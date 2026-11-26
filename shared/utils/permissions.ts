import type { Role, SessionUser } from "../types/auth";
import type { RequestStatus } from "../types/request";
export function isStaff(role: Role) {
  return role === "Operator" || role === "Admin";
}
export function canReadRequest(
  user: SessionUser,
  request: { author_id?: string | null; assignee_id?: string | null },
) {
  return (
    isStaff(user.role) ||
    (user.role === "Client"
      ? request.author_id === user.id
      : request.assignee_id === user.id)
  );
}
export const transitions: Record<RequestStatus, RequestStatus[]> = {
  new: ["assigned", "closed"],
  assigned: ["in_progress", "closed"],
  in_progress: ["waiting", "resolved", "closed"],
  waiting: ["in_progress", "closed"],
  resolved: ["in_progress", "closed"],
  closed: [],
};
export function allowedStatuses(
  status: RequestStatus,
  role: Role,
): RequestStatus[] {
  if (role === "Client") return [];
  return transitions[status].filter((next) =>
    role === "Agent" ? next !== "closed" && next !== "assigned" : true,
  );
}
