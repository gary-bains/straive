/**
 * Role-based access control, shared by the API (enforcement) and the web client
 * (UI gating). Permissions are derived from a member's per-project role.
 *
 * This is the single authority for "who can do what". The API MUST treat it as
 * the source of truth; the web client uses it only to hide/disable affordances.
 */
import type { ProjectRole } from "./domain.js";

export const ACTIONS = [
  "project.view",
  "project.update",
  "project.delete",
  "member.view",
  "member.manage",
  "ticket.view",
  "ticket.create",
  "ticket.update",
  "ticket.delete",
] as const;

export type Action = (typeof ACTIONS)[number];

/** Each role's allowed actions. Higher roles are supersets, but listed
 *  explicitly for clarity and easy auditing. */
const ROLE_ACTIONS: Record<ProjectRole, ReadonlySet<Action>> = {
  owner: new Set(ACTIONS),
  admin: new Set<Action>([
    "project.view",
    "project.update",
    "member.view",
    "member.manage",
    "ticket.view",
    "ticket.create",
    "ticket.update",
    "ticket.delete",
  ]),
  member: new Set<Action>([
    "project.view",
    "member.view",
    "ticket.view",
    "ticket.create",
    "ticket.update",
  ]),
  viewer: new Set<Action>(["project.view", "member.view", "ticket.view"]),
};

/** Returns true if a member with `role` may perform `action`. */
export function can(role: ProjectRole, action: Action): boolean {
  return ROLE_ACTIONS[role]?.has(action) ?? false;
}

/**
 * Guards a role change / removal. Admins manage members, but must never be able
 * to affect an owner. Only an owner may target another owner.
 */
export function canManageMemberWithRole(
  actorRole: ProjectRole,
  targetRole: ProjectRole,
): boolean {
  if (!can(actorRole, "member.manage")) return false;
  if (targetRole === "owner") return actorRole === "owner";
  return true;
}
