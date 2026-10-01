// Envío de mensajes a la WhatsApp Cloud API (Graph API) con fetch nativo.
// Ninguna función lanza excepciones: si Meta responde con error, se registra y se devuelve null.

import { logger, maskPhone } from "./logger";
import type { OutgoingMessage } from "./menu";

const REQUEST_TIMEOUT_MS = 10_000;
/** Máximo que se espera la confirmación de entrega de la bienvenida antes de enviar el menú. */
export const DELIVERY_WAIT_MS = 8_000;

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
}

interface GraphError {
  error?: { code?: number; message?: string; fbtrace_id?: string };
}

interface GraphSendResponse {
  messages?: { id?: string }[];
}

/** Resultado final de entrega de un mensaje, según los statuses que Meta envía al webhook. */
export type DeliveryResult = "delivered" | "failed" | "timeout";

/**
 * WhatsApp no garantiza que los mensajes lleguen en el orden en que se envían (una imagen tarda
 * más que un texto). Este registro permite esperar a que Meta confirme la entrega de un mensaje
 * antes de enviar el siguiente. Solo guarda ids de mensajes y su estado, nunca datos del usuario.
 */
export class DeliveryTracker {
  private readonly waiters = new Map<string, (result: DeliveryResult) => void>();
  /** Estados que llegaron antes de que alguien los esperara (poco común, pero posible). */
  private readonly early = new Map<string, DeliveryResult>();

  constructor(private readonly maxEarly = 1000) {}

  /** Se llama desde el webhook con cada status recibido. */
  notify(messageId: string, status: string): void {
    const result: DeliveryResult | null =
      status === "delivered" || status === "read" ? "delivered" : status === "failed" ? "failed" : null;
    if (!result) return; // "sent" no basta: aún no ha llegado al teléfono

    const waiter = this.waiters.get(messageId);
    if (waiter) {
      waiter(result);
      return;
    }
    this.early.set(messageId, result);
    while (this.early.size > this.maxEarly) {
      this.early.delete(this.early.keys().next().value as string);
    }
  }

  /** Espera a que el mensaje se entregue o falle, como máximo timeoutMs. */
  waitFor(messageId: string, timeoutMs: number): Promise<DeliveryResult> {
    const known = this.early.get(messageId);
    if (known) {
      this.early.delete(messageId);
      return Promise.resolve(known);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => finish("timeout"), timeoutMs);
      const finish = (result: DeliveryResult) => {
        clearTimeout(timer);
        this.waiters.delete(messageId);
        resolve(result);
      };
      this.waiters.set(messageId, finish);
    });
  }
}

export function createWhatsAppClient(
  config: WhatsAppConfig,
  tracker: DeliveryTracker = new DeliveryTracker(),
  deliveryWaitMs = DELIVERY_WAIT_MS,
) {
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;

  /** Envía el mensaje y devuelve el id que asigna Meta, o null si falló. */
  async function send(to: string, kind: string, content: Record<string, unknown>): Promise<string | null> {
    const payload = { messaging_product: "whatsapp", recipient_type: "individual", to, ...content };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as GraphError;
        const e = data.error ?? {};
        logger.error(
          `Meta rechazó el mensaje (${kind}) a ${maskPhone(to)}: status=${res.status} ` +
            `code=${e.code ?? "?"} message="${e.message ?? "?"}" fbtrace_id=${e.fbtrace_id ?? "?"}`,
        );
        return null;
      }

      const data = (await res.json().catch(() => ({}))) as GraphSendResponse;
      logger.info(`Mensaje enviado: tipo=${kind} a ${maskPhone(to)}`);
      return data.messages?.[0]?.id ?? "";
    } catch (err) {
      const reason = controller.signal.aborted ? `timeout de ${REQUEST_TIMEOUT_MS / 1000} s` : "error de red";
      logger.error(`No se pudo enviar el mensaje (${kind}) a ${maskPhone(to)}: ${reason}`, err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function sendText(to: string, body: string, previewUrl = false) {
    return send(to, "text", { type: "text", text: { body, preview_url: previewUrl } });
  }

  function sendImage(to: string, link: string, caption: string) {
    return send(to, "image", { type: "image", image: { link, caption } });
  }

  function sendList(
    to: string,
    body: string,
    button: string,
    sectionTitle: string,
    rows: { id: string; title: string; description: string }[],
  ) {
    return send(to, "list", {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body },
        action: { button, sections: [{ title: sectionTitle, rows }] },
      },
    });
  }

  function sendCtaUrl(to: string, body: string, displayText: string, url: string) {
    return send(to, "cta_url", {
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: body },
        action: { name: "cta_url", parameters: { display_text: displayText, url } },
      },
    });
  }

  function sendReplyButtons(to: string, body: string, buttons: { id: string; title: string }[]) {
    return send(to, "button", {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: { buttons: buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })) },
      },
    });
  }

  /** Espera la confirmación de entrega; devuelve "timeout" si no hay id para rastrear. */
  async function waitForDelivery(to: string, messageId: string, kind: string): Promise<DeliveryResult> {
    if (!messageId) return "timeout";
    const result = await tracker.waitFor(messageId, deliveryWaitMs);
    if (result === "timeout") {
      logger.warn(`Sin confirmación de entrega (${kind}) para ${maskPhone(to)} en ${deliveryWaitMs / 1000} s; se continúa.`);
    }
    return result;
  }

  /**
   * Envía la imagen de bienvenida y espera a que se entregue. Si Meta la rechaza al enviarla o
   * avisa después que falló (por ejemplo, no pudo descargar el logo), envía el texto como respaldo.
   */
  async function sendWelcomeImage(to: string, link: string, caption: string): Promise<void> {
    const imageId = await sendImage(to, link, caption);
    if (imageId !== null && (await waitForDelivery(to, imageId, "image")) !== "failed") return;

    logger.warn(`Falló la imagen de bienvenida para ${maskPhone(to)}; se envía como texto.`);
    const textId = await sendText(to, caption, true);
    if (textId) await waitForDelivery(to, textId, "text");
  }

  /** Envía los mensajes en orden, esperando cada uno antes del siguiente. */
  async function sendAll(to: string, messages: OutgoingMessage[]): Promise<void> {
    for (const [i, msg] of messages.entries()) {
      const hasNext = i < messages.length - 1;
      switch (msg.kind) {
        case "image":
          await sendWelcomeImage(to, msg.link, msg.caption);
          break;
        case "text": {
          const id = await sendText(to, msg.body, msg.previewUrl);
          if (id && hasNext) await waitForDelivery(to, id, "text");
          break;
        }
        case "list":
          await sendList(to, msg.body, msg.button, msg.sectionTitle, msg.rows);
          break;
        case "cta_url": {
          const id = await sendCtaUrl(to, msg.body, msg.displayText, msg.url);
          if (id && hasNext) await waitForDelivery(to, id, "cta_url");
          break;
        }
        case "buttons":
          await sendReplyButtons(to, msg.body, msg.buttons);
          break;
      }
    }
  }

  return { sendText, sendImage, sendList, sendCtaUrl, sendReplyButtons, sendAll };
}

export type WhatsAppClient = ReturnType<typeof createWhatsAppClient>;
