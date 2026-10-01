// Lee y valida las variables de entorno. Si falta alguna obligatoria, el servidor no arranca.

export interface Config {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  appSecret: string;
  apiVersion: string;
  welcomeImageUrl: string | undefined;
  port: number;
}

const REQUIRED = ["META_ACCESS_TOKEN", "META_PHONE_NUMBER_ID", "META_VERIFY_TOKEN", "META_APP_SECRET"] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing = REQUIRED.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno obligatorias: ${missing.join(", ")}. ` +
        "Revisa tu archivo .env (usa .env.example como guía) o las variables del servidor.",
    );
  }

  const welcomeImageUrl = env.WELCOME_IMAGE_URL?.trim() || undefined;
  if (welcomeImageUrl && !/^https:\/\//i.test(welcomeImageUrl)) {
    throw new Error("WELCOME_IMAGE_URL debe ser una URL pública que empiece por https://");
  }

  const port = Number(env.PORT?.trim() || 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT no es válido: "${env.PORT}"`);
  }

  return {
    accessToken: env.META_ACCESS_TOKEN!.trim(),
    phoneNumberId: env.META_PHONE_NUMBER_ID!.trim(),
    verifyToken: env.META_VERIFY_TOKEN!.trim(),
    appSecret: env.META_APP_SECRET!.trim(),
    apiVersion: env.META_API_VERSION?.trim() || "v23.0",
    welcomeImageUrl,
    port,
  };
}
