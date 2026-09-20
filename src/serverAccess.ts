export const MAX_REQUEST_BYTES = 65536;
export const AGENT_MAX_STEPS = 8;
export const AGENT_MAX_MS = 5000;

export function redactSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length < 8) {
      continue;
    }
    out = out.split(secret).join("[redacted]");
  }
  return out;
}
