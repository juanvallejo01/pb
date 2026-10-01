// Logs simples con fecha. Nunca registres tokens, secretos ni el body completo.

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info(message: string): void {
    console.log(`[${timestamp()}] INFO  ${message}`);
  },
  warn(message: string): void {
    console.warn(`[${timestamp()}] WARN  ${message}`);
  },
  error(message: string, err?: unknown): void {
    const detail = err instanceof Error ? ` | ${err.name}: ${err.message}` : err !== undefined ? ` | ${String(err)}` : "";
    console.error(`[${timestamp()}] ERROR ${message}${detail}`);
  },
};

/**
 * Enmascara un número de teléfono para los logs (datos de pacientes).
 * Ej.: 573133173172 → 57313***3172
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 9) return "***";
  return `${digits.slice(0, 5)}***${digits.slice(-4)}`;
}
