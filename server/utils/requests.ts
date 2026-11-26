import { randomUUID } from "node:crypto";
import { createError } from "h3";
import type { PoolClient } from "pg";
import { query, transaction } from "./database";
import type { SessionUser } from "../../shared/types/auth";
import type {
  ApiItem,
  ApiRequest,
  ApiRequestsResponse,
  CreateRequestBody,
  UpdateRequestBody,
  RequestsQuery,
} from "../../shared/types/api";
import { allowedStatuses } from "../../shared/utils/permissions";
import { priorities, statuses } from "../../shared/utils/request-options";

interface RequestRow extends Omit<ApiRequest, "created_at" | "due_at"> {
  created_at: Date;
  due_at: Date | null;
}
const requestSelect = `SELECT r.*,a.name AS author_name,ass.name AS assignee_name,c.name AS customer_name,cat.name AS category_name,
  COALESCE((SELECT json_agg(json_build_object('id',co.id,'text',co.text,'author_id',co.author_id,'author_name',cu.name,'created_at',co.created_at) ORDER BY co.created_at,co.id) FROM comments co JOIN users cu ON cu.id=co.author_id WHERE co.request_id=r.id),'[]'::json) AS comments,
  COALESCE((SELECT json_agg(json_build_object('id',e.id,'title',e.title,'description',e.description,'kind',e.kind,'created_at',e.created_at) ORDER BY e.created_at,e.id) FROM request_events e WHERE e.request_id=r.id),'[]'::json) AS timeline
  FROM requests r JOIN users a ON a.id=r.author_id JOIN customers c ON c.id=r.customer_id JOIN categories cat ON cat.id=r.category_id LEFT JOIN users ass ON ass.id=r.assignee_id`;
function dto(row: RequestRow): ApiRequest {
  return {
    ...row,
    created_at: row.created_at.toISOString(),
    due_at: row.due_at?.toISOString() ?? null,
  };
}
function scope(user: SessionUser) {
  if (user.role === "Client")
    return { sql: "r.author_id=$1", values: [user.id] as unknown[] };
  if (user.role === "Agent")
    return { sql: "r.assignee_id=$1", values: [user.id] as unknown[] };
  return { sql: "true", values: [] as unknown[] };
}
function canRead(
  user: SessionUser,
  request: Pick<ApiRequest, "author_id" | "assignee_id">,
) {
  return (
    user.role === "Admin" ||
    user.role === "Operator" ||
    (user.role === "Client"
      ? request.author_id === user.id
      : request.assignee_id === user.id)
  );
}
export function requestId(value: string | undefined): number {
  if (
    !value ||
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1 ||
    Number(value) > 2147483647
  )
    throw createError({ statusCode: 400, statusMessage: "Invalid request id" });
  return Number(value);
}
export async function readRequest(
  id: number,
  user: SessionUser,
  client?: PoolClient,
): Promise<ApiItem<ApiRequest>> {
  const access = scope(user),
    sql = `${requestSelect} WHERE ${access.sql} AND r.id=$${access.values.length + 1}`,
    values = [...access.values, id];
  const result = client
    ? await client.query<RequestRow>(sql, values)
    : await query<RequestRow>(sql, values);
  if (!result.rows[0])
    throw createError({ statusCode: 404, statusMessage: "Request not found" });
  return { data: dto(result.rows[0]) };
}
export async function listRequests(
  user: SessionUser,
  filters: RequestsQuery,
): Promise<ApiRequestsResponse> {
  const access = scope(user),
    clauses = [access.sql],
    values: unknown[] = [...access.values];
  function add(sql: string, value: unknown) {
    values.push(value);
    clauses.push(sql.replaceAll("?", `$${values.length}`));
  }
  if (filters.q)
    add(
      "(r.title ILIKE ? OR r.description ILIKE ? OR ('#'||r.id::text) ILIKE ? OR EXISTS(SELECT 1 FROM customers search_customer WHERE search_customer.id=r.customer_id AND search_customer.name ILIKE ?))",
      `%${filters.q}%`,
    );
  if (filters.status) add("r.status=?", filters.status);
  if (filters.priority) add("r.priority=?", filters.priority);
  if (filters.assignment === "mine") add("r.assignee_id=?", user.id);
  if (filters.assignment === "unassigned")
    clauses.push("r.assignee_id IS NULL");
  const where = clauses.join(" AND ");
  const total = (
    await query<{ count: number }>(
      `SELECT count(*)::int AS count FROM requests r WHERE ${where}`,
      values,
    )
  ).rows[0]!.count;
  const pages = Math.max(1, Math.ceil(total / filters.per_page)),
    page = Math.min(filters.page, pages);
  const order =
    filters.sort === "oldest"
      ? "r.created_at ASC,r.id ASC"
      : filters.sort === "priority"
        ? "CASE r.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,r.id DESC"
        : "r.created_at DESC,r.id DESC";
  const result = await query<RequestRow>(
    `${requestSelect} WHERE ${where} ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.per_page, (page - 1) * filters.per_page],
  );
  const stats = (
    await query<ApiRequestsResponse["stats"]>(
      `SELECT count(*) FILTER(WHERE r.status='new')::int AS new,count(*) FILTER(WHERE r.status='in_progress')::int AS in_progress,count(*) FILTER(WHERE r.status='waiting')::int AS waiting,count(*) FILTER(WHERE r.status='resolved')::int AS resolved FROM requests r WHERE ${access.sql}`,
      access.values,
    )
  ).rows[0]!;
  return {
    data: result.rows.map(dto),
    meta: { page, per_page: filters.per_page, total, total_pages: pages },
    stats,
  };
}
async function event(
  client: PoolClient,
  id: number,
  actor: SessionUser,
  title: string,
  description = "",
  kind: "created" | "status" | "comment" = "status",
) {
  await client.query(
    "INSERT INTO request_events(id,request_id,actor_id,title,description,kind) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), id, actor.id, title, description, kind],
  );
}
export async function createRequest(
  user: SessionUser,
  input: CreateRequestBody,
) {
  if (user.role === "Agent")
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  if (
    user.role === "Client" &&
    input.customer_id &&
    input.customer_id !== user.customer_id
  )
    throw createError({ statusCode: 403, statusMessage: "Forbidden customer" });
  const customerId =
    user.role === "Client" ? user.customer_id : input.customer_id;
  if (!customerId)
    throw createError({
      statusCode: 422,
      statusMessage: "Customer required",
      data: { message: "Выберите клиента" },
    });
  return transaction(async (client) => {
    if (
      !(
        await client.query("SELECT id FROM customers WHERE id=$1", [customerId])
      ).rowCount ||
      !(
        await client.query("SELECT id FROM categories WHERE id=$1", [
          input.category_id,
        ])
      ).rowCount
    )
      throw createError({
        statusCode: 422,
        statusMessage: "Unknown customer or category",
      });
    const id = (
      await client.query<{ id: number }>(
        "INSERT INTO requests(title,description,priority,customer_id,category_id,author_id,due_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '1 day') RETURNING id",
        [
          input.title,
          input.description,
          input.priority,
          customerId,
          input.category_id,
          user.id,
        ],
      )
    ).rows[0]!.id;
    await event(
      client,
      id,
      user,
      `${user.name} создал(а) заявку`,
      "",
      "created",
    );
    return readRequest(id, user, client);
  });
}
export async function updateRequest(
  id: number,
  user: SessionUser,
  input: UpdateRequestBody,
) {
  if (user.role === "Client")
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  if (
    user.role === "Agent" &&
    (input.priority !== undefined || input.assignee_id !== undefined)
  )
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  return transaction(async (client) => {
    const record = (
      await client.query<RequestRow>(
        "SELECT * FROM requests WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!record || !canRead(user, record))
      throw createError({
        statusCode: 404,
        statusMessage: "Request not found",
      });
    if (record.status === "closed")
      throw createError({
        statusCode: 409,
        statusMessage: "Request is closed",
        data: { message: "Закрытую заявку нельзя изменять" },
      });
    if (
      input.expected_revision !== undefined &&
      input.expected_revision !== record.revision
    )
      throw createError({
        statusCode: 409,
        statusMessage: "Request changed",
        data: { message: "Заявка уже изменена. Обновите данные" },
      });
    let assignee = record.assignee_id ?? null,
      nextStatus = input.status ?? record.status;
    if (input.assignee_id !== undefined) {
      if (input.assignee_id) {
        const agent = (
          await client.query<{
            name: string;
            role: string;
            is_active: boolean;
          }>("SELECT name,role,is_active FROM users WHERE id=$1 FOR SHARE", [
            input.assignee_id,
          ])
        ).rows[0];
        if (!agent || agent.role !== "Agent" || !agent.is_active)
          throw createError({
            statusCode: 422,
            statusMessage: "Inactive or invalid assignee",
            data: {
              message:
                "Деактивированный сотрудник не может получить новое назначение. Выберите активного исполнителя.",
            },
          });
        await event(
          client,
          id,
          user,
          `Назначен исполнитель: ${agent.name}`,
          input.comment ?? "",
        );
        if (record.status === "new") nextStatus = "assigned";
      } else if (record.status !== "new" && record.status !== "assigned")
        throw createError({
          statusCode: 409,
          statusMessage: "Assignee required for current status",
        });
      else nextStatus = "new";
      assignee = input.assignee_id;
    }
    if (input.status && input.status !== record.status) {
      if (!allowedStatuses(record.status, user.role).includes(input.status))
        throw createError({
          statusCode: 409,
          statusMessage: "Invalid status transition",
          data: { message: "Недопустимый переход статуса" },
        });
      if (
        ["assigned", "in_progress", "waiting", "resolved"].includes(
          input.status,
        ) &&
        !assignee
      )
        throw createError({
          statusCode: 422,
          statusMessage: "Assignee required",
          data: { message: "Сначала назначьте исполнителя" },
        });
      if (input.status === "waiting" && !input.reason?.trim())
        throw createError({
          statusCode: 422,
          statusMessage: "Waiting reason required",
          data: { message: "Укажите причину ожидания." },
        });
      if (input.status === "resolved" && !input.resolution?.trim())
        throw createError({
          statusCode: 422,
          statusMessage: "Resolution required",
          data: { message: "Опишите результат решения." },
        });
      if (input.status === "closed" && !input.reason?.trim())
        throw createError({
          statusCode: 422,
          statusMessage: "Closing reason required",
          data: { message: "Укажите причину ручного закрытия." },
        });
    }
    if (
      nextStatus === "resolved" &&
      input.resolution !== undefined &&
      !input.resolution.trim()
    )
      throw createError({
        statusCode: 422,
        statusMessage: "Resolution required",
      });
    const priority = input.priority ?? record.priority;
    if (priority !== record.priority)
      await event(
        client,
        id,
        user,
        `Приоритет изменён на «${priorities.find((item) => item.value === priority)?.label}»`,
      );
    if (nextStatus !== record.status)
      await event(
        client,
        id,
        user,
        `Статус: ${statuses.find((item) => item.value === nextStatus)?.label}`,
        input.resolution ?? input.reason ?? "",
      );
    await client.query(
      "UPDATE requests SET assignee_id=$1,status=$2,priority=$3,resolution=$4,waiting_reason=$5,closing_reason=$6,revision=revision+1 WHERE id=$7",
      [
        assignee,
        nextStatus,
        priority,
        input.status === "resolved"
          ? (input.resolution ?? record.resolution)
          : record.resolution,
        input.status === "waiting"
          ? (input.reason ?? record.waiting_reason)
          : record.waiting_reason,
        input.status === "closed"
          ? (input.reason ?? record.closing_reason)
          : record.closing_reason,
        id,
      ],
    );
    return readRequest(id, user, client);
  });
}
export async function addComment(
  id: number,
  user: SessionUser,
  text: string,
  clientId: string,
) {
  return transaction(async (client) => {
    const record = (
      await client.query<RequestRow>(
        "SELECT * FROM requests WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!record || !canRead(user, record))
      throw createError({
        statusCode: 404,
        statusMessage: "Request not found",
      });
    const inserted = await client.query(
      "INSERT INTO comments(id,request_id,author_id,text,client_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(author_id,client_id) WHERE client_id IS NOT NULL DO NOTHING RETURNING id",
      [randomUUID(), id, user.id, text, clientId],
    );
    if (!inserted.rowCount) {
      const previous = (
        await client.query<{ request_id: number; text: string }>(
          "SELECT request_id,text FROM comments WHERE author_id=$1 AND client_id=$2",
          [user.id, clientId],
        )
      ).rows[0];
      if (!previous || previous.request_id !== id || previous.text !== text)
        throw createError({
          statusCode: 409,
          statusMessage: "Comment key already used",
          data: {
            message:
              "???? ?????? ??? ??????????? ??? ??????? ???????????. ???????? ????? ? ????????? ????????.",
          },
        });
      return readRequest(id, user, client);
    }
    await client.query("UPDATE requests SET revision=revision+1 WHERE id=$1", [
      id,
    ]);
    await event(
      client,
      id,
      user,
      `${user.name} добавил(а) комментарий`,
      "",
      "comment",
    );
    return readRequest(id, user, client);
  });
}
