// Punto de entrada: carga la configuración, monta las rutas y arranca el servidor.

import { config as loadEnv } from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import { loadConfig, type Config } from "./config";
import { logger } from "./logger";
import { decideReply } from "./menu";
import { createWebhookRouter } from "./webhook";
import { createWhatsAppClient } from "./whatsapp";

process.on("unhandledRejection", (reason) => {
  logger.error("Promesa rechazada sin manejar.", reason);
});

process.on("uncaughtException", (err) => {
  logger.error("Excepción no controlada; el proceso se cerrará.", err);
  process.exit(1);
});

loadEnv({ quiet: true });

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  logger.error("No se pudo iniciar el bot.", err);
  process.exit(1);
}

const whatsapp = createWhatsAppClient(config);
const app = express();
app.disable("x-powered-by");

app.get("/", (_req, res) => {
  res.status(200).type("text/plain").send("Unimédicas WhatsApp bot OK");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(
  createWebhookRouter({
    verifyToken: config.verifyToken,
    appSecret: config.appSecret,
    onMessage: async (message) => {
      const replies = decideReply(message, { welcomeImageUrl: config.welcomeImageUrl });
      await whatsapp.sendAll(message.from, replies);
    },
  }),
);

app.use((_req, res) => {
  res.sendStatus(404);
});

// Manejo global de errores de Express (ej. body demasiado grande).
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const status =
    typeof err === "object" && err !== null && "status" in err && typeof err.status === "number" ? err.status : 500;
  logger.error(`Error en ${req.method} ${req.path} (status ${status}).`, err);
  if (!res.headersSent) res.sendStatus(status);
});

app.listen(config.port, () => {
  logger.info(`Bot de Unimédicas IPS escuchando en el puerto ${config.port}.`);
  logger.info(`Bienvenida: ${config.welcomeImageUrl ? "imagen con texto" : "solo texto (sin WELCOME_IMAGE_URL)"}.`);
});
