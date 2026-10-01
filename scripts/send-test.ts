// Envía la plantilla de prueba "hello_world" a un número para comprobar que el token y el
// Phone number ID funcionan. Uso: npm run send-test 573001234567
//
// Se usa una plantilla porque WhatsApp solo deja que el negocio escriba primero con plantillas
// aprobadas. Cuando la persona responde, el bot contesta con la bienvenida y el menú.

import { config as loadEnv } from "dotenv";
import { loadConfig } from "../src/config";
import { logger, maskPhone } from "../src/logger";

async function main(): Promise<void> {
  loadEnv({ quiet: true });
  const config = loadConfig();

  const to = (process.argv[2] ?? "").replace(/\D/g, "");
  if (!/^\d{10,15}$/.test(to)) {
    logger.error("Uso: npm run send-test 573001234567 (número con indicativo, solo dígitos)");
    process.exit(1);
  }

  const res = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: { name: "hello_world", language: { code: "en_US" } },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      error?: { code?: number; message?: string; fbtrace_id?: string };
    };
    const e = data.error ?? {};
    logger.error(
      `Meta rechazó el envío a ${maskPhone(to)}: status=${res.status} code=${e.code ?? "?"} ` +
        `message="${e.message ?? "?"}" fbtrace_id=${e.fbtrace_id ?? "?"}`,
    );
    process.exit(1);
  }

  logger.info(`Plantilla hello_world enviada a ${maskPhone(to)}. Respóndele al bot para ver el menú.`);
}

main().catch((err) => {
  logger.error("No se pudo enviar el mensaje de prueba.", err);
  process.exit(1);
});
