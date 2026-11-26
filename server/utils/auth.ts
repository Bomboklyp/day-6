import { randomBytes } from "node:crypto";
import {
  createError,
  deleteCookie,
  getCookie,
  getRequestURL,
  setCookie,
  type H3Event,
} from "h3";
import type { Role, SessionUser } from "../../shared/types/auth";
import { query } from "./database";
import { tokenHash } from "./password";

export interface DbUser extends SessionUser {
  password_hash: string;
}
export const sessionCookie = "workflow_session";
export function publicUser(user: SessionUser): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    customer_id: user.customer_id,
  };
}
export async function getSessionUser(
  event: H3Event,
): Promise<SessionUser | null> {
  const token = getCookie(event, sessionCookie);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result = await query<SessionUser>(
    "SELECT u.id,u.name,u.email,u.role,u.is_active,u.customer_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active=true",
    [tokenHash(token)],
  );
  return result.rows[0] ? publicUser(result.rows[0]) : null;
}
export function requireUser(event: H3Event): SessionUser {
  if (!event.context.user)
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
      data: { message: "Войдите в аккаунт" },
    });
  return event.context.user;
}
export function requireRole(event: H3Event, roles: Role[]): SessionUser {
  const user = requireUser(event);
  if (!roles.includes(user.role))
    throw createError({
      statusCode: 403,
      statusMessage: "Forbidden",
      data: { message: "Недостаточно прав" },
    });
  return user;
}
export async function deleteSession(event: H3Event) {
  const token = getCookie(event, sessionCookie);
  if (token)
    await query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(token)]);
  deleteCookie(event, sessionCookie, { path: "/" });
}
export async function createSession(event: H3Event, user: SessionUser) {
  await deleteSession(event);
  const token = randomBytes(32).toString("base64url");
  await query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
    [tokenHash(token), user.id],
  );
  setCookie(event, sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getRequestURL(event).protocol === "https:",
    path: "/",
    maxAge: 7 * 86400,
  });
}
