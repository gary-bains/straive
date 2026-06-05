import type {
  AddMemberInput,
  CreateProjectInput,
  CreateTicketInput,
  MemberWithProfile,
  Profile,
  Project,
  ProjectWithRole,
  Ticket,
  TicketFilters,
  UpdateMemberInput,
  UpdateProjectInput,
  UpdateTicketInput,
} from "@ticketing/shared";
import { supabase } from "../lib/supabase";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "UNKNOWN",
      err?.message ?? res.statusText,
    );
  }
  return body as T;
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries as [string, string][]).toString()}`;
}

export const api = {
  me: () => request<Profile>("/api/me"),

  // Projects
  listProjects: () => request<ProjectWithRole[]>("/api/projects"),
  getProject: (id: string) => request<ProjectWithRole>(`/api/projects/${id}`),
  createProject: (input: CreateProjectInput) =>
    request<ProjectWithRole>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateProject: (id: string, input: UpdateProjectInput) =>
    request<Project>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteProject: (id: string) =>
    request<void>(`/api/projects/${id}`, { method: "DELETE" }),

  // Members
  listMembers: (projectId: string) =>
    request<MemberWithProfile[]>(`/api/projects/${projectId}/members`),
  addMember: (projectId: string, input: AddMemberInput) =>
    request<MemberWithProfile>(`/api/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateMember: (projectId: string, userId: string, input: UpdateMemberInput) =>
    request<MemberWithProfile>(`/api/projects/${projectId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  removeMember: (projectId: string, userId: string) =>
    request<void>(`/api/projects/${projectId}/members/${userId}`, {
      method: "DELETE",
    }),

  // Tickets
  listTickets: (projectId: string, filters: TicketFilters = {}) =>
    request<Ticket[]>(`/api/projects/${projectId}/tickets${qs(filters)}`),
  createTicket: (projectId: string, input: CreateTicketInput) =>
    request<Ticket>(`/api/projects/${projectId}/tickets`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateTicket: (ticketId: string, input: UpdateTicketInput) =>
    request<Ticket>(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteTicket: (ticketId: string) =>
    request<void>(`/api/tickets/${ticketId}`, { method: "DELETE" }),
};
