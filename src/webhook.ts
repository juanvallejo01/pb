// Rutas GET y POST /webhook: verificación de Meta, validación de firma, lectura de mensajes y deduplicación.

import crypto from "node:crypto";
import express, { Router, type Request, type Response } from "express";
import { logger, maskPhone } from "./logger";
import type { IncomingMessage } from "./menu";

export interface WebhookOptions {
  verifyToken: string;
  appSecret: string;
  /** Se llama una vez por cada mensaje nuevo (ya deduplicado). */
  onMessage: (message: IncomingMessage) => Promise<void>;
  /** Se llama con cada estado de entrega (sent, delivered, read, failed) de los mensajes del bot. */
  onStatus?: (messageId: string, status: string) => void;
}

/** Valida X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(body crudo, app secret). */
export function isValidSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const received = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest();

  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(received, expected);
}

/** Recuerda los últimos ids procesados para no responder dos veces al mismo mensaje. */
export class MessageDeduplicator {
  private readonly ids = new Set<string>();

  constructor(private readonly maxSize = 1000) {}

  /** Devuelve true si el id es nuevo (y lo registra); false si ya se había visto. */
  isNew(id: string): boolean {
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    while (this.ids.size > this.maxSize) {
      // Un Set conserva el orden de inserción: el primero es el más antiguo.
      const oldest = this.ids.values().next().value as string;
      this.ids.delete(oldest);
    }
    return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Convierte un mensaje crudo de Meta en IncomingMessage, o null si no tiene la forma esperada. */
export function parseMessage(raw: unknown): IncomingMessage | null {
  if (!isRecord(raw)) return null;
  const { id, from, type } = raw;
  if (typeof id !== "string" || typeof from !== "string" || typeof type !== "string") return null;

  const message: IncomingMessage = { id, from, type };
  if (type === "interactive" && isRecord(raw.interactive)) {
    const { list_reply, button_reply } = raw.interactive;
    if (isRecord(list_reply) && typeof list_reply.id === "string") {
      message.selectionKind = "list_reply";
      message.selectedId = list_reply.id;
    } else if (isRecord(button_reply) && typeof button_reply.id === "string") {
      message.selectionKind = "button_reply";
      message.selectedId = button_reply.id;
    }
  }
  return message;
}

/** Extrae los mensajes de entry[].changes[].value.messages[], ignorando statuses. */
export function extractMessages(payload: unknown): IncomingMessage[] {
  if (!isRecord(payload)) return [];
  const result: IncomingMessage[] = [];
  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) continue;
    for (const change of asArray(entry.changes)) {
      if (!isRecord(change) || !isRecord(change.value)) continue;
      for (const raw of asArray(change.value.messages)) {
        const message = parseMessage(raw);
        if (message) result.push(message);
        else logger.warn("Mensaje con estructura inesperada; se ignora.");
      }
    }
  }
  return result;
}

/** Extrae los estados de entrega de entry[].changes[].value.statuses[] (solo id y estado). */
export interface DeliveryStatus {
  id: string;
  status: string;
  errorCode?: number;
  errorTitle?: string;
}

export function extractStatuses(payload: unknown): DeliveryStatus[] {
  if (!isRecord(payload)) return [];
  const result: DeliveryStatus[] = [];
  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) continue;
    for (const change of asArray(entry.changes)) {
      if (!isRecord(change) || !isRecord(change.value)) continue;
      for (const raw of asArray(change.value.statuses)) {
        if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.status !== "string") continue;
        const item: DeliveryStatus = { id: raw.id, status: raw.status };
        const error = asArray(raw.errors)[0];
        if (isRecord(error)) {
          if (typeof error.code === "number") item.errorCode = error.code;
          if (typeof error.title === "string") item.errorTitle = error.title;
        }
        result.push(item);
      }
    }
  }
  return result;
}

export function createWebhookRouter(options: WebhookOptions): Router {
  const router = Router();
  const dedup = new MessageDeduplicator(1000);

  router.get("/webhook", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === options.verifyToken && typeof challenge === "string") {
      logger.info("Webhook verificado por Meta.");
      res.status(200).type("text/plain").send(challenge);
      return;
    }
    logger.warn("Intento de verificación del webhook rechazado (verify token o modo incorrecto).");
    res.sendStatus(403);
  });

  router.post(
    "/webhook",
    express.raw({ type: "application/json", limit: "100kb" }),
    (req: Request, res: Response) => {
      const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const signature = req.get("x-hub-signature-256");

      if (!isValidSignature(rawBody, signature, options.appSecret)) {
        logger.warn(`POST /webhook rechazado: firma ${signature ? "inválida" : "ausente"}.`);
        res.sendStatus(401);
        return;
      }

      // Responder de inmediato para que Meta no reintente; procesar después.
      res.sendStatus(200);

      let payload: unknown;
      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch (err) {
        logger.error("El body del webhook no es JSON válido.", err);
        return;
      }

      void processPayload(payload);
    },
  );

  async function processPayload(payload: unknown): Promise<void> {
    let messages: IncomingMessage[];
    try {
      for (const { id, status, errorCode, errorTitle } of extractStatuses(payload)) {
        if (status === "failed") {
          logger.warn(`Meta informa que un mensaje del bot no se entregó: code=${errorCode ?? "?"} "${errorTitle ?? "?"}"`);
        }
        options.onStatus?.(id, status);
      }
      messages = extractMessages(payload);
    } catch (err) {
      logger.error("Error leyendo el payload del webhook.", err);
      return;
    }

    for (const message of messages) {
      if (!dedup.isNew(message.id)) {
        logger.info(`Mensaje duplicado ignorado de ${maskPhone(message.from)}.`);
        continue;
      }
      logger.info(
        `Mensaje recibido de ${maskPhone(message.from)}: tipo=${message.type}` +
          (message.selectedId ? ` id=${message.selectedId}` : ""),
      );
      try {
        await options.onMessage(message);
      } catch (err) {
        logger.error(`Error procesando mensaje de ${maskPhone(message.from)}.`, err);
      }
    }
  }

  return router;
}
