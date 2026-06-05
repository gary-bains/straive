import { type Action, type ProjectRole, can } from "@ticketing/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Errors } from "./errors.js";

export interface MembershipContext {
  membershipId: string;
  role: ProjectRole;
}

/** Looks up the caller's membership in a project, or null if they're not a member. */
export async function getMembership(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<MembershipContext | null> {
  const { data, error } = await supabase
    .from("memberships")
    .select("id, role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { membershipId: data.id, role: data.role as ProjectRole };
}

/**
 * Asserts the caller is a member of the project AND may perform `action`.
 * Returns their membership context. Non-members get 404 (so project existence
 * isn't leaked); members lacking the permission get 403.
 */
export async function requireMembership(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  action: Action,
): Promise<MembershipContext> {
  const membership = await getMembership(supabase, projectId, userId);
  if (!membership) {
    throw Errors.notFound("Project not found");
  }
  if (!can(membership.role, action)) {
    throw Errors.forbidden(`Your role (${membership.role}) cannot ${action}`);
  }
  return membership;
}
