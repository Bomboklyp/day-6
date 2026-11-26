import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { pool } from "../server/utils/database";
import { hashPassword } from "../server/utils/password";
import { createApiCatalogs, createApiSeed } from "../server/utils/seed";
import type { Role } from "../shared/types/auth";

export const demoPassword = "Practice123!";
export async function initializeDatabase(target: Pool = pool) {
  await target.query(
    await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"),
  );
  const client = await target.connect();
  try {
    await client.query("BEGIN");
    const catalogs = createApiCatalogs();
    for (const item of catalogs.customers)
      await client.query(
        "INSERT INTO customers(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [item.id, item.name],
      );
    for (const item of catalogs.categories)
      await client.query(
        "INSERT INTO categories(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [item.id, item.name],
      );
    const people: {
      id: string;
      name: string;
      email: string;
      role: Role;
      customer: string | null;
      active: boolean;
    }[] = [
      {
        id: "user-1",
        name: "Анна Кузнецова",
        email: "operator@workflow.local",
        role: "Operator",
        customer: null,
        active: true,
      },
      {
        id: "user-2",
        name: "Мария Смирнова",
        email: "client@workflow.local",
        role: "Client",
        customer: "customer-1",
        active: true,
      },
      {
        id: "user-3",
        name: "Брунгильда Брунгильдовна",
        email: "agent@workflow.local",
        role: "Agent",
        customer: null,
        active: true,
      },
      {
        id: "user-4",
        name: "Олег Соколов",
        email: "inactive@workflow.local",
        role: "Agent",
        customer: null,
        active: false,
      },
      {
        id: "user-5",
        name: "Александра Константиновна Рождественская-Соколова",
        email: "agent2@workflow.local",
        role: "Agent",
        customer: null,
        active: true,
      },
      {
        id: "user-6",
        name: "Администратор",
        email: "admin@workflow.local",
        role: "Admin",
        customer: null,
        active: true,
      },
      {
        id: "user-7",
        name: "Иван Петров",
        email: "client2@workflow.local",
        role: "Client",
        customer: "customer-2",
        active: true,
      },
      {
        id: "user-8",
        name: "Дмитрий Волков",
        email: "client3@workflow.local",
        role: "Client",
        customer: "customer-3",
        active: true,
      },
    ];
    for (const person of people)
      await client.query(
        "INSERT INTO users(id,name,email,password_hash,role,customer_id,is_active) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
        [
          person.id,
          person.name,
          person.email,
          await hashPassword(demoPassword),
          person.role,
          person.customer,
          person.active,
        ],
      );
    for (const item of createApiSeed()) {
      const author =
        item.customer_id === "customer-1"
          ? "user-2"
          : item.customer_id === "customer-2"
            ? "user-7"
            : "user-8";
      const initial = item.id === 1042,
        status = initial ? "new" : item.status;
      const assignee = initial
        ? null
        : item.id === 1035
          ? "user-5"
          : item.assignee_id;
      const inserted = await client.query(
        "INSERT INTO requests(id,title,description,status,priority,customer_id,category_id,author_id,assignee_id,created_at,due_at,resolution,waiting_reason,closing_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING RETURNING id",
        [
          item.id,
          item.title,
          (item.description?.length ?? 0) >= 10
            ? item.description
            : `Обращение: ${item.description ?? item.title}`,
          status,
          item.priority,
          item.customer_id,
          item.category_id,
          author,
          assignee,
          item.created_at,
          item.due_at,
          status === "resolved" ? "Работы по заявке выполнены." : null,
          status === "waiting" ? "Ожидается ответ клиента." : null,
          status === "closed" ? "Заявка закрыта после проверки." : null,
        ],
      );
      if (!inserted.rowCount) continue;
      for (const comment of (initial
        ? item.comments?.slice(0, 1)
        : item.comments) ?? [])
        await client.query(
          "INSERT INTO comments(id,request_id,author_id,text,created_at) VALUES($1,$2,$3,$4,$5)",
          [
            randomUUID(),
            item.id,
            comment.author_id ?? author,
            comment.text,
            comment.created_at,
          ],
        );
      for (const event of (initial
        ? item.timeline?.slice(0, 1)
        : item.timeline) ?? [])
        await client.query(
          "INSERT INTO request_events(id,request_id,actor_id,title,description,kind,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            randomUUID(),
            item.id,
            author,
            event.title,
            event.description ?? "",
            event.kind,
            event.created_at,
          ],
        );
    }
    await client.query(
      "SELECT setval(pg_get_serial_sequence('requests','id'),GREATEST(1043,(SELECT COALESCE(max(id),1043) FROM requests)))",
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/init-db.ts")) {
  try {
    await initializeDatabase();
    console.log("Database schema and seed are ready");
  } finally {
    await pool.end();
  }
}
