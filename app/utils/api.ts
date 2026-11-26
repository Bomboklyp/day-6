import type { ApiCatalogs, ApiRequest, ApiUser } from "../../shared/types/api";
import type { Person, WorkflowRequest } from "../types/workflow";
import { initials } from "./format";

function person(
  user: ApiUser | undefined,
  fallback: string,
  name?: string | null,
): Person {
  const resolved = name?.trim() || user?.name || fallback;
  return {
    name: resolved,
    initials: resolved === "Не назначен" ? "" : initials(resolved),
    color: user?.color ?? "purple",
  };
}
export function mapApiRequest(
  request: ApiRequest,
  catalogs: ApiCatalogs,
): WorkflowRequest {
  return {
    incomplete: !request.title?.trim() || !request.customer_id,
    resolution: request.resolution,
    waitingReason: request.waiting_reason,
    closingReason: request.closing_reason,
    id: request.id,
    title: request.title?.trim() || "Без названия",
    description: request.description?.trim() || "Описание не указано.",
    status: request.status,
    priority: request.priority,
    category:
      request.category_name ??
      catalogs.categories.find((item) => item.id === request.category_id)
        ?.name ??
      "Категория не указана",
    client:
      request.customer_name ??
      catalogs.customers.find((item) => item.id === request.customer_id)
        ?.name ??
      "Клиент не указан",
    author: person(
      catalogs.users.find((user) => user.id === request.author_id),
      "Автор не указан",
      request.author_name,
    ),
    assignee: person(
      catalogs.users.find((user) => user.id === request.assignee_id),
      "Не назначен",
      request.assignee_name,
    ),
    createdAt: request.created_at,
    dueAt: request.due_at ?? "",
    comments: (request.comments ?? []).map((comment) => ({
      id: comment.id,
      text: comment.text,
      createdAt: comment.created_at,
      author: person(
        catalogs.users.find((user) => user.id === comment.author_id),
        "Автор не указан",
        comment.author_name,
      ),
    })),
    timeline: (request.timeline ?? []).map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description ?? "",
      createdAt: event.created_at,
      kind: event.kind,
    })),
  };
}
export function apiErrorStatus(error: unknown): number {
  if (!error || typeof error !== "object") return 0;
  if ("statusCode" in error && typeof error.statusCode === "number")
    return error.statusCode;
  if ("status" in error && typeof error.status === "number")
    return error.status;
  return 0;
}
export function apiErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "data" in error &&
    error.data &&
    typeof error.data === "object" &&
    "data" in error.data &&
    error.data.data &&
    typeof error.data.data === "object" &&
    "message" in error.data.data &&
    typeof error.data.data.message === "string"
  )
    return error.data.data.message;
  const status = apiErrorStatus(error);
  if (status === 401) return "Сессия истекла. Войдите снова.";
  if (status === 403) return "Недостаточно прав для этого действия.";
  if (status === 422) return "Проверьте условия выполнения действия.";
  if (status === 429)
    return "Слишком много запросов. Подождите немного и повторите загрузку.";
  if (status === 409)
    return "Данные заявки уже изменились. Обновите заявку и повторите действие.";
  if (status === 500 || status === 503)
    return "Сервис временно недоступен. Попробуйте ещё раз.";
  if (status === 404) return "Заявка не найдена. Возможно, она была удалена.";
  if (status === 400) return "Проверьте введённые данные и попробуйте ещё раз.";
  return "Не удалось связаться с сервером. Проверьте соединение и повторите запрос.";
}
