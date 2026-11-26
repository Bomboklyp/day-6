import type { RequestPriority, RequestStatus } from "./request";

export interface Person {
  name: string;
  initials: string;
  color: string;
}

export interface RequestComment {
  id: string;
  author: Person;
  text: string;
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  kind: "created" | "status" | "comment";
}

export interface WorkflowRequest {
  resolution?: string | null;
  waitingReason?: string | null;
  closingReason?: string | null;
  incomplete?: boolean;
  id: number;
  title: string;
  description: string;
  status: RequestStatus;
  priority: RequestPriority;
  category: string;
  client: string;
  author: Person;
  assignee: Person;
  createdAt: string;
  dueAt: string;
  comments: RequestComment[];
  timeline: TimelineEvent[];
}

export interface UserProfile {
  name: string;
  email: string;
  position: string;
  department: string;
  about: string;
  notifications: boolean;
  density: "comfortable" | "compact";
}

export interface RequestFilters {
  search: string;
  status: RequestStatus | "";
  priority: RequestPriority | "";
  sort: "newest" | "oldest" | "priority";
  assignment?: "" | "unassigned" | "mine";
}

export interface NewRequest {
  title: string;
  description: string;
  category: string;
  priority: RequestPriority;
}
