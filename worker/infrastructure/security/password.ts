import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";

const encoder = new TextEncoder();
const ITERATIONS = 600_000;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function derivePassword(password: string, salt: string): Promise<string> {
  const bytes = Uint8Array.from(salt.match(/.{2}/g) ?? [], (part) => parseInt(part, 16));
  // Cloudflare limita Web Crypto a 100.000 iteraciones por operación.
  const hash = pbkdf2(sha256, encoder.encode(password), bytes, { c: ITERATIONS, dkLen: 32 });
  return hex(hash);
}

export function newSalt(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

export class PasswordHasher {
  async fetch(req: Request): Promise<Response> {
    const body: unknown = await req.json();
    if (typeof body !== "object" || body === null ||
        !("password" in body) || typeof body.password !== "string" ||
        body.password.length < 1 || body.password.length > 128 ||
        !("salt" in body) || typeof body.salt !== "string" ||
        !/^[0-9a-f]{32}$/.test(body.salt))
      return new Response("Datos inválidos.", { status: 400 });
    return Response.json({ hash: await derivePassword(body.password, body.salt) });
  }
}

export async function hashPassword(
  namespace: DurableObjectNamespace,
  password: string,
  salt: string,
): Promise<string> {
  const stub = namespace.get(namespace.idFromName("password-hasher"));
  const response = await stub.fetch("https://password-hasher.internal/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password, salt }),
  });
  if (!response.ok) throw new Error(`Error al calcular la contraseña: ${response.status}`);
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("hash" in body) ||
      typeof body.hash !== "string" || !/^[0-9a-f]{64}$/.test(body.hash))
    throw new Error("Respuesta inválida del servicio de contraseñas.");
  return body.hash;
}
