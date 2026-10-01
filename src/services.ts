// =====================================================================
//  CONTENIDO EDITABLE DEL BOT
//  Aquí se cambia el texto de bienvenida y la lista de servicios.
//  No hace falta tocar ningún otro archivo para editar el contenido.
// =====================================================================

/**
 * Texto de bienvenida. Se envía como pie de foto del logo
 * (o como texto si no hay WELCOME_IMAGE_URL).
 * Los asteriscos *así* se ven en negrita en WhatsApp.
 * Máximo 1024 caracteres.
 */
export const WELCOME_TEXT = `🏥 *Bienvenido a Unimédicas IPS*

🕐 *Horario de atención*
Lunes a viernes: 7:00 a.m. – 6:00 p.m.
Sábados: 8:00 a.m. – 12:00 m.

📅 *Canales para solicitar citas*

🏢 *Presencial*
L-V: 7:00 – 9:00 a.m. y 2:00 – 4:00 p.m.

📧 *Correo:* citas.unimedicas.mag@gmail.com
L-V: 7:00 a.m. – 6:00 p.m. (respuesta máx. 24 h)

☎️ *Teléfono:*
602 297 8067 ext. 2001 – Centro
602 297 8067 ext. 2003 – Continente
L-V: 9:00 – 11:00 a.m. y 4:00 – 5:00 p.m.

💬 *WhatsApp:* 300 0000 000
(Uso exclusivo Zona Rural Magisterio)

🙋 *Hablar con un asesor*
Asesor Líder SIAU: 301 0000 000

🌐 Conoce más en https://unimedicasips.com/`;

/** Texto que acompaña al menú de servicios. */
export const MENU_TEXT = "¿Sobre qué servicio deseas información?";
/** Texto del botón que abre la lista de servicios (máx. 20 caracteres). */
export const MENU_BUTTON = "Ver servicios";
/** Título de la sección de la lista (máx. 24 caracteres). */
export const MENU_SECTION_TITLE = "Servicios";

export interface Service {
  /** Identificador interno: minúsculas, sin espacios ni tildes. No se muestra al usuario. */
  id: string;
  /** Emoji que acompaña al título en el detalle. */
  emoji: string;
  /** Nombre del servicio en el menú (máx. 24 caracteres). */
  title: string;
  /** Texto corto bajo el nombre en el menú y en el detalle (máx. 72 caracteres). */
  description: string;
  /** WhatsApp del área: solo números, empezando por 57. Ej.: 573001234567 */
  phone: string;
}

/**
 * LISTA DE SERVICIOS
 *
 * Cómo AGREGAR un servicio:
 *   1. Copia uno de los bloques { ... }, incluida la coma final.
 *   2. Pégalo dentro de los corchetes [ ] y cambia sus datos.
 *   3. El "id" debe ser único (no repetido) y no puede ser "menu".
 *
 * Cómo QUITAR un servicio: borra su bloque { ... } completo con su coma.
 *
 * Cómo CAMBIAR un servicio: edita el texto que está entre comillas.
 *
 * El orden de esta lista es el orden en que aparece en el menú.
 * WhatsApp permite máximo 10 servicios.
 * Si algo no cumple las reglas, el bot no arranca y dice exactamente qué corregir.
 */
export const SERVICES: Service[] = [
  {
    id: "riesgo_cardiovascular",
    emoji: "❤️",
    title: "Riesgo cardiovascular",
    description: "Citas PyP de control de riesgo cardiovascular",
    phone: "573106234631",
  },
  {
    id: "crecimiento_desarrollo",
    emoji: "👶",
    title: "Crecimiento y desarrollo",
    description: "Controles para niños y niñas",
    phone: "573234681856",
  },
  {
    id: "holter_mapa",
    emoji: "📈",
    title: "Holter y MAPA",
    description: "Monitoreo cardíaco y de presión arterial",
    phone: "573105373702",
  },
  {
    id: "citologias_mamografias",
    emoji: "🩺",
    title: "Citologías y mamografías",
    description: "Tamizaje de cuello uterino y de mama",
    phone: "573207568625",
  },
  {
    id: "adultez_vejez",
    emoji: "🧓",
    title: "Adultez y vejez",
    description: "Controles para adultos y adultos mayores",
    phone: "573105372652",
  },
  {
    id: "planificacion_jovenes",
    emoji: "👫",
    title: "Planificación y jóvenes",
    description: "Planificación familiar, adolescencia y juventud",
    phone: "573247092649",
  },
  {
    id: "recordatorio_citas",
    emoji: "🔔",
    title: "Recordatorio de citas",
    description: "Sedes Continente y Centro (Naranjito)",
    phone: "573159143430",
  },
  // Para activar este servicio cuando haya número: quita las // del inicio
  // de cada línea y reemplaza el teléfono por el número real.
  // {
  //   id: "zona_rural_magisterio",
  //   emoji: "🌾",
  //   title: "Zona Rural Magisterio",
  //   description: "Atención para docentes de la zona rural",
  //   phone: "57XXXXXXXXXX",
  // },
];

// ---------------------------------------------------------------------
//  Validación automática de los límites de WhatsApp (no editar).
// ---------------------------------------------------------------------

export const LIMITS = {
  rowTitle: 24,
  rowDescription: 72,
  maxServices: 10,
  idLength: 200,
  caption: 1024,
} as const;

export function validateContent(services: Service[], welcomeText: string): void {
  const errors: string[] = [];

  if (services.length === 0) errors.push("Debe haber al menos un servicio.");
  if (services.length > LIMITS.maxServices) {
    errors.push(`Hay ${services.length} servicios; WhatsApp permite máximo ${LIMITS.maxServices}.`);
  }
  if (welcomeText.length > LIMITS.caption) {
    errors.push(`El texto de bienvenida tiene ${welcomeText.length} caracteres; el máximo es ${LIMITS.caption}.`);
  }

  const seen = new Set<string>();
  services.forEach((s, i) => {
    const where = `Servicio #${i + 1} ("${s.title}")`;
    if (!s.id) errors.push(`${where}: el id está vacío.`);
    if (s.id.length > LIMITS.idLength) errors.push(`${where}: el id supera ${LIMITS.idLength} caracteres.`);
    if (s.id === "menu") errors.push(`${where}: el id no puede ser "menu" (está reservado).`);
    if (seen.has(s.id)) errors.push(`${where}: el id "${s.id}" está repetido.`);
    seen.add(s.id);
    if (!s.title) errors.push(`${where}: el título está vacío.`);
    if (s.title.length > LIMITS.rowTitle) {
      errors.push(`${where}: el título tiene ${s.title.length} caracteres; el máximo es ${LIMITS.rowTitle}.`);
    }
    if (s.description.length > LIMITS.rowDescription) {
      errors.push(
        `${where}: la descripción tiene ${s.description.length} caracteres; el máximo es ${LIMITS.rowDescription}.`,
      );
    }
    if (!/^57\d{10}$/.test(s.phone)) {
      errors.push(`${where}: el teléfono "${s.phone}" debe tener solo números y empezar por 57 (ej. 573001234567).`);
    }
  });

  if (errors.length > 0) {
    throw new Error(`Error en services.ts:\n - ${errors.join("\n - ")}`);
  }
}

validateContent(SERVICES, WELCOME_TEXT);
