import { createError, defineEventHandler, readBody } from "h3";
import { query } from "../../utils/database";
import { createSession, publicUser, type DbUser } from "../../utils/auth";
import { verifyPassword } from "../../utils/password";
import { loginSchema, parseInput } from "../../utils/schemas";
export default defineEventHandler(async (event) => {
  const input = parseInput(loginSchema, await readBody<unknown>(event));
  const user = (
    await query<DbUser>("SELECT * FROM users WHERE email=$1", [input.email])
  ).rows[0];
  if (
    !user ||
    !user.is_active ||
    !(await verifyPassword(input.password, user.password_hash))
  )
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid credentials",
      data: { message: "Неверная почта или пароль" },
    });
  await createSession(event, user);
  return { user: publicUser(user) };
});
