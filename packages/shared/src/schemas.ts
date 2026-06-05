/**
 * Zod schemas for request payloads. Single source of truth for validation,
 * reused by Fastify (server-side validation) and React forms (client-side).
 * Inferred types are exported so callers stay in lockstep with the schemas.
 */
import { z } from "zod";
import { PROJECT_ROLES, TICKET_PRIORITIES, TICKET_STATUSES } from "./domain.js";

export const projectRoleSchema = z.enum(PROJECT_ROLES);
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);

// --- Projects ---

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(2000).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// --- Memberships ---

/** Invite an existing user (by email) into a project with a role. */
export const addMemberSchema = z.object({
  email: z.string().trim().email(),
  // Owner is assigned only on project creation, never via invite.
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

// --- Tickets ---

export const createTicketSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(5000).optional(),
  status: ticketStatusSchema.default("todo"),
  priority: ticketPrioritySchema.default("medium"),
  assignee_id: z.string().uuid().nullable().optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = createTicketSchema.partial();
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

/** Query filters for listing tickets. */
export const ticketFiltersSchema = z.object({
  status: ticketStatusSchema.optional(),
  assignee_id: z.string().uuid().optional(),
});
export type TicketFilters = z.infer<typeof ticketFiltersSchema>;
