import { randomUUID } from "node:crypto";
import {
  createError,
  defineEventHandler,
  readBody,
  setResponseStatus,
} from "h3";
import { transaction } from "../../utils/database";
import { createSession, publicUser, type DbUser } from "../../utils/auth";
import { hashPassword } from "../../utils/password";
import { registerSchema, parseInput } from "../../utils/schemas";
export default defineEventHandler(async (event) => {
  const input = parseInput(registerSchema, await readBody<unknown>(event));
  const password = await hashPassword(input.password);
  try {
    const user = await transaction(async (client) => {
      const customerId = `customer-${randomUUID()}`,
        id = `user-${randomUUID()}`;
      await client.query("INSERT INTO customers(id,name) VALUES($1,$2)", [
        customerId,
        input.company,
      ]);
      return (
        await client.query<DbUser>(
          "INSERT INTO users(id,name,email,password_hash,role,customer_id) VALUES($1,$2,$3,$4,'Client',$5) RETURNING *",
          [id, input.name, input.email, password, customerId],
        )
      ).rows[0]!;
    });
    await createSession(event, user);
    setResponseStatus(event, 201);
    return { user: publicUser(user) };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    )
      throw createError({
        statusCode: 409,
        statusMessage: "Email already registered",
        data: { message: "Эта почта уже зарегистрирована" },
      });
    throw error;
  }
});
