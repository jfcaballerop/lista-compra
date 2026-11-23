import { D1UserRepository } from "../infrastructure/repositories/d1-user-repository";
import { hashPassword, newSalt } from "../infrastructure/security/password";
import {
  createSession,
  passwordEqual,
  SESSION_SECONDS,
} from "../infrastructure/security/session";
import { error, json, readJson } from "./http";

function usernameKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim();
  return /^[a-zA-Z0-9._-]{3,32}$/.test(username) ? username.toLowerCase() : null;
}

async function authenticated(username: string, id: string, secret: string): Promise<Response> {
  const token = await createSession(secret, id);
  return json({ authenticated: true, username }, 200, {
    "set-cookie": `compra_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}`,
  });
}

export async function register(
  req: Request,
  db: D1Database,
  invitation: string | undefined,
  secret: string,
  hasher: DurableObjectNamespace,
): Promise<Response> {
  if (!invitation || invitation.length < 16)
    return error("Registro no configurado. Define INVITE_CODE de al menos 16 caracteres.", 503);
  const body = await readJson(req);
  if (typeof body.invitation !== "string" || !passwordEqual(body.invitation, invitation))
    return error("Código de invitación incorrecto.", 401);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const key = usernameKey(username);
  if (!key)
    return error("El usuario debe tener de 3 a 32 letras, números, puntos, guiones o guiones bajos.");
  if (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128)
    return error("La contraseña debe tener de 12 a 128 caracteres.");
  const salt = newSalt();
  const user = {
    id: crypto.randomUUID(),
    username,
    password_salt: salt,
    password_hash: await hashPassword(hasher, body.password, salt),
  };
  if (!(await new D1UserRepository(db).create(user, key)))
    return error("Ese nombre de usuario ya está en uso.", 409);
  return authenticated(user.username, user.id, secret);
}

export async function login(req: Request, db: D1Database, secret: string, hasher: DurableObjectNamespace): Promise<Response> {
  const body = await readJson(req);
  const key = usernameKey(body.username);
  const password = typeof body.password === "string" ? body.password : "";
  const user = key ? await new D1UserRepository(db).findByUsername(key) : null;
  if (!user || !password || password.length > 128 || !passwordEqual(await hashPassword(hasher, password, user.password_salt), user.password_hash))
    return error("Usuario o contraseña incorrectos.", 401);
  return authenticated(user.username, user.id, secret);
}

export function logout(): Response {
  return json({ authenticated: false }, 200, {
    "set-cookie":
      "compra_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
  });
}
