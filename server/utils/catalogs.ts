import { randomUUID } from "node:crypto";
import { createError } from "h3";
import type { z } from "zod";
import { query, transaction } from "./database";
import type { SessionUser } from "../../shared/types/auth";
import type { ApiUser, ApiCustomer, ApiCategory } from "../../shared/types/api";
import type { DbUser } from "./auth";
import { publicUser } from "./auth";
import { hashPassword } from "./password";
import type { userSchema, userUpdateSchema } from "./schemas";

export async function listUsers(user: SessionUser): Promise<ApiUser[]> {
  const where =
    user.role === "Admin"
      ? "true"
      : user.role === "Operator"
        ? "role='Agent' OR id=$1"
        : "id=$1";
  const rows = (
    await query<SessionUser>(
      `SELECT id,name,email,role,is_active,customer_id FROM users WHERE ${where} ORDER BY name`,
      user.role === "Admin" ? [] : [user.id],
    )
  ).rows;
  return rows.map((person) => ({
    id: person.id,
    name: person.name,
    role: person.role,
    is_active: person.is_active,
    customer_id: person.customer_id,
    ...(user.role === "Admin" || person.id === user.id
      ? { email: person.email }
      : {}),
  }));
}
export async function listCustomers(user: SessionUser): Promise<ApiCustomer[]> {
  if (user.role === "Client")
    return (
      await query<ApiCustomer>("SELECT id,name FROM customers WHERE id=$1", [
        user.customer_id,
      ])
    ).rows;
  if (user.role === "Agent")
    return (
      await query<ApiCustomer>(
        "SELECT DISTINCT c.id,c.name FROM customers c JOIN requests r ON r.customer_id=c.id WHERE r.assignee_id=$1 ORDER BY c.name",
        [user.id],
      )
    ).rows;
  return (
    await query<ApiCustomer>("SELECT id,name FROM customers ORDER BY name")
  ).rows;
}
export async function listCategories(): Promise<ApiCategory[]> {
  return (
    await query<ApiCategory>("SELECT id,name FROM categories ORDER BY name")
  ).rows;
}
export async function saveCatalog(
  table: "customers" | "categories",
  name: string,
  id?: string,
) {
  const result = id
    ? await query<ApiCustomer>(
        `UPDATE ${table} SET name=$1 WHERE id=$2 RETURNING id,name`,
        [name, id],
      )
    : await query<ApiCustomer>(
        `INSERT INTO ${table}(id,name) VALUES($1,$2) RETURNING id,name`,
        [
          `${table === "customers" ? "customer" : "category"}-${randomUUID()}`,
          name,
        ],
      );
  if (!result.rows[0])
    throw createError({ statusCode: 404, statusMessage: "Record not found" });
  return result.rows[0];
}
export async function saveUser(
  input: z.infer<typeof userSchema> | z.infer<typeof userUpdateSchema>,
  id?: string,
) {
  try {
    return await transaction(async (client) => {
      const old = id
        ? (
            await client.query<DbUser>(
              "SELECT * FROM users WHERE id=$1 FOR UPDATE",
              [id],
            )
          ).rows[0]
        : undefined;
      if (id && !old)
        throw createError({ statusCode: 404, statusMessage: "User not found" });
      const role = input.role ?? old!.role,
        customer =
          input.customer_id !== undefined
            ? input.customer_id
            : (old?.customer_id ?? null);
      if (
        role === "Client" &&
        (!customer ||
          !(
            await client.query("SELECT id FROM customers WHERE id=$1", [
              customer,
            ])
          ).rowCount)
      )
        throw createError({
          statusCode: 422,
          statusMessage: "Customer required for Client",
        });
      const password = input.password
        ? await hashPassword(input.password)
        : old!.password_hash;
      const values = [
        input.name ?? old!.name,
        input.email ?? old!.email,
        password,
        role,
        input.is_active ?? old?.is_active ?? true,
        role === "Client" ? customer : null,
      ];
      const row = id
        ? (
            await client.query<DbUser>(
              "UPDATE users SET name=$1,email=$2,password_hash=$3,role=$4,is_active=$5,customer_id=$6 WHERE id=$7 RETURNING *",
              [...values, id],
            )
          ).rows[0]!
        : (
            await client.query<DbUser>(
              "INSERT INTO users(name,email,password_hash,role,is_active,customer_id,id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
              [...values, `user-${randomUUID()}`],
            )
          ).rows[0]!;
      if (!row.is_active || old?.role !== row.role || input.password)
        await client.query("DELETE FROM sessions WHERE user_id=$1", [row.id]);
      return publicUser(row);
    });
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
      });
    throw error;
  }
}
