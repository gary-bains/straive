/**
 * Domain enums and entity types — the single source of truth shared by the API
 * and the web client. These mirror the Postgres schema in
 * `supabase/migrations/0001_init.sql`. Keep them in sync.
 */

// --- Enums (value arrays double as runtime sources for Zod + UI rendering) ---

export const PROJECT_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const TICKET_STATUSES = ["todo", "in_progress", "in_review", "done"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

// --- Entities (shape of rows as returned by the API) ---

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
  created_at: string;
}

export interface Ticket {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  reporter_id: string;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
}

// --- Composite/expanded shapes used by some endpoints ---

/** A membership row joined with the member's profile (members list). */
export interface MemberWithProfile extends Membership {
  profile: Profile;
}

/** A project enriched with the caller's role (project list/detail). */
export interface ProjectWithRole extends Project {
  role: ProjectRole;
}

// --- API error envelope ---

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
