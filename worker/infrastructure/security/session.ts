export const SESSION_SECONDS = 30 * 24 * 60 * 60;

const encoder = new TextEncoder();

export function passwordEqual(candidate: string, actual: string): boolean {
  // Compara todos los bytes sin cortar en la primera diferencia.
  if (!candidate || !actual) return false;
  const a = encoder.encode(candidate);
  const b = encoder.encode(actual);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return mismatch === 0;
}

function toB64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

async function signingKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSession(secret: string, userId: string): Promise<string> {
  const expiration = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `v2.${expiration}.${userId}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    encoder.encode(payload),
  );
  return `${payload}.${toB64Url(new Uint8Array(signature))}`;
}

export async function sessionUserId(
  req: Request,
  secret: string,
): Promise<string | null> {
  const value = req.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("compra_session="))
    ?.slice("compra_session=".length);
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v2" || !/^\d{10,12}$/.test(parts[1]) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parts[2]))
    return null;
  const expiration = Number(parts[1]);
  if (!Number.isSafeInteger(expiration) || expiration <= Date.now() / 1000)
    return null;
  try {
    const signature = new Uint8Array(fromB64Url(parts[3])).buffer;
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      signature,
      encoder.encode(`v2.${parts[1]}.${parts[2]}`),
    );
    return valid ? parts[2] : null;
  } catch {
    return null;
  }
}
