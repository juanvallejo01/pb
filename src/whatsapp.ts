// Envío de mensajes a la WhatsApp Cloud API (Graph API) con fetch nativo.
// Ninguna función lanza excepciones: si Meta responde con error, se registra y se devuelve false.

import { logger, maskPhone } from "./logger";
import type { OutgoingMessage } from "./menu";

const REQUEST_TIMEOUT_MS = 10_000;

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
}

interface GraphError {
  error?: { code?: number; message?: string; fbtrace_id?: string };
}

export function createWhatsAppClient(config: WhatsAppConfig) {
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;

  async function send(to: string, kind: string, content: Record<string, unknown>): Promise<boolean> {
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
        return false;
      }

      logger.info(`Mensaje enviado: tipo=${kind} a ${maskPhone(to)}`);
      return true;
    } catch (err) {
      const reason = controller.signal.aborted ? `timeout de ${REQUEST_TIMEOUT_MS / 1000} s` : "error de red";
      logger.error(`No se pudo enviar el mensaje (${kind}) a ${maskPhone(to)}: ${reason}`, err);
      return false;
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

  /** Envía un mensaje del menú. Si la imagen de bienvenida falla, reenvía el texto como respaldo. */
  async function sendOutgoing(to: string, msg: OutgoingMessage): Promise<boolean> {
    switch (msg.kind) {
      case "text":
        return sendText(to, msg.body, msg.previewUrl);
      case "image": {
        const ok = await sendImage(to, msg.link, msg.caption);
        if (ok) return true;
        logger.warn(`Falló la imagen de bienvenida para ${maskPhone(to)}; se envía como texto.`);
        return sendText(to, msg.caption, true);
      }
      case "list":
        return sendList(to, msg.body, msg.button, msg.sectionTitle, msg.rows);
      case "cta_url":
        return sendCtaUrl(to, msg.body, msg.displayText, msg.url);
      case "buttons":
        return sendReplyButtons(to, msg.body, msg.buttons);
    }
  }

  /** Envía los mensajes en orden, esperando cada uno antes del siguiente. */
  async function sendAll(to: string, messages: OutgoingMessage[]): Promise<void> {
    for (const msg of messages) {
      await sendOutgoing(to, msg);
    }
  }

  return { sendText, sendImage, sendList, sendCtaUrl, sendReplyButtons, sendOutgoing, sendAll };
}

export type WhatsAppClient = ReturnType<typeof createWhatsAppClient>;
