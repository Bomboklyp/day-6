import type {
  RequestFilters,
  RequestPriority,
  WorkflowRequest,
} from "../types/workflow";
import { priorities } from "#shared/utils/request-options";
export {
  priorities,
  statuses,
  categories,
} from "#shared/utils/request-options";
export function filterRequests(
  requests: WorkflowRequest[],
  filters: RequestFilters,
): WorkflowRequest[] {
  const query = filters.search.trim().toLocaleLowerCase("ru-RU");
  const weight = (priority: RequestPriority) =>
    priorities.find((item) => item.value === priority)?.weight ?? 0;
  return requests
    .filter(
      (item) =>
        (!query ||
          [
            item.title,
            item.description,
            "#" + item.id,
            String(item.id),
            item.client,
          ].some((text) => text.toLocaleLowerCase("ru-RU").includes(query))) &&
        (!filters.status || item.status === filters.status) &&
        (!filters.priority || item.priority === filters.priority) &&
        (!filters.assignment ||
          (filters.assignment === "unassigned"
            ? item.assignee.name === "Не назначен"
            : item.assignee.name === "Анна Кузнецова")),
    )
    .sort((a, b) =>
      filters.sort === "priority"
        ? weight(b.priority) - weight(a.priority) || b.id - a.id
        : filters.sort === "oldest"
          ? a.id - b.id
          : b.id - a.id,
    );
}
