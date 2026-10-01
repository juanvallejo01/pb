// Lógica del bot: decide qué mensajes responder según lo que envió el usuario.
// No llama a Meta; solo devuelve la lista de mensajes a enviar (fácil de probar).

import { MENU_BUTTON, MENU_SECTION_TITLE, MENU_TEXT, SERVICES, WELCOME_TEXT, type Service } from "./services";

export const MENU_BUTTON_ID = "menu";
export const BACK_TEXT = "¿Deseas consultar otro servicio?";
export const BACK_BUTTON_TITLE = "🔙 Volver al menú";
export const CTA_DISPLAY_TEXT = "💬 Abrir WhatsApp";

/** Mensaje entrante ya normalizado desde el webhook. */
export interface IncomingMessage {
  id: string;
  from: string;
  type: string;
  /** id elegido en una lista o botón, si aplica. */
  selectedId?: string;
  selectionKind?: "list_reply" | "button_reply";
}

/** Mensaje a enviar, independiente de la API de Meta. */
export type OutgoingMessage =
  | { kind: "text"; body: string; previewUrl: boolean }
  | { kind: "image"; link: string; caption: string }
  | {
      kind: "list";
      body: string;
      button: string;
      sectionTitle: string;
      rows: { id: string; title: string; description: string }[];
    }
  | { kind: "cta_url"; body: string; displayText: string; url: string }
  | { kind: "buttons"; body: string; buttons: { id: string; title: string }[] };

export interface MenuOptions {
  welcomeImageUrl?: string;
}

/** 573234681856 → +57 323 468 1856 */
export function formatPhone(phone: string): string {
  const m = /^57(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return m ? `+57 ${m[1]} ${m[2]} ${m[3]}` : `+${phone}`;
}

export function whatsappLink(service: Service): string {
  return `https://wa.me/${service.phone}?text=${encodeURIComponent(`Hola, quiero información sobre ${service.title}`)}`;
}

export function welcomeMessages(options: MenuOptions = {}): OutgoingMessage[] {
  const welcome: OutgoingMessage = options.welcomeImageUrl
    ? { kind: "image", link: options.welcomeImageUrl, caption: WELCOME_TEXT }
    : { kind: "text", body: WELCOME_TEXT, previewUrl: true };

  return [
    welcome,
    {
      kind: "list",
      body: MENU_TEXT,
      button: MENU_BUTTON,
      sectionTitle: MENU_SECTION_TITLE,
      rows: SERVICES.map((s) => ({ id: s.id, title: s.title, description: s.description })),
    },
  ];
}

export function serviceMessages(service: Service): OutgoingMessage[] {
  const body =
    `${service.emoji} *${service.title.toLocaleUpperCase("es-CO")}*\n\n` +
    `${service.description}\n\n` +
    `Para más información comunícate con:\n` +
    `📱 ${formatPhone(service.phone)}`;

  return [
    { kind: "cta_url", body, displayText: CTA_DISPLAY_TEXT, url: whatsappLink(service) },
    { kind: "buttons", body: BACK_TEXT, buttons: [{ id: MENU_BUTTON_ID, title: BACK_BUTTON_TITLE }] },
  ];
}

/** Decide la respuesta. Cualquier cosa que no sea un servicio válido → bienvenida. */
export function decideReply(message: IncomingMessage, options: MenuOptions = {}): OutgoingMessage[] {
  if (message.selectionKind === "list_reply" && message.selectedId) {
    const service = SERVICES.find((s) => s.id === message.selectedId);
    if (service) return serviceMessages(service);
  }
  return welcomeMessages(options);
}
