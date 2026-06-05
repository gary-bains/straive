import {
  type ProjectRole,
  addMemberSchema,
  canManageMemberWithRole,
  updateMemberSchema,
} from "@ticketing/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { Errors } from "../lib/errors.js";
import { getMembership, requireMembership } from "../lib/rbac.js";

const projectParam = z.object({ projectId: z.string().uuid() });
const memberParam = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function memberRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // List members with their profiles (any member can view).
  r.get(
    "/api/projects/:projectId/members",
    {
      preHandler: app.authenticate,
      schema: { params: projectParam, tags: ["members"] },
    },
    async (req) => {
      await requireMembership(
        app.supabase,
        req.params.projectId,
        req.user.id,
        "member.view",
      );
      const { data, error } = await app.supabase
        .from("memberships")
        .select("id, project_id, user_id, role, created_at, profile:profiles(*)")
        .eq("project_id", req.params.projectId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  );

  // Invite an existing user by email (owner/admin).
  r.post(
    "/api/projects/:projectId/members",
    {
      preHandler: app.authenticate,
      schema: { params: projectParam, body: addMemberSchema, tags: ["members"] },
    },
    async (req, reply) => {
      await requireMembership(
        app.supabase,
        req.params.projectId,
        req.user.id,
        "member.manage",
      );

      const { data: profile, error: lookupErr } = await app.supabase
        .from("profiles")
        .select("id")
        .ilike("email", req.body.email)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      if (!profile) {
        throw Errors.notFound(`No user found with email ${req.body.email}`);
      }

      const existing = await getMembership(
        app.supabase,
        req.params.projectId,
        profile.id,
      );
      if (existing) throw Errors.conflict("User is already a member");

      const { data, error } = await app.supabase
        .from("memberships")
        .insert({
          project_id: req.params.projectId,
          user_id: profile.id,
          role: req.body.role,
        })
        .select("id, project_id, user_id, role, created_at, profile:profiles(*)")
        .single();
      if (error) throw error;
      return reply.code(201).send(data);
    },
  );

  // Change a member's role (owner/admin; admins can't touch an owner).
  r.patch(
    "/api/projects/:projectId/members/:userId",
    {
      preHandler: app.authenticate,
      schema: { params: memberParam, body: updateMemberSchema, tags: ["members"] },
    },
    async (req) => {
      const actor = await requireMembership(
        app.supabase,
        req.params.projectId,
        req.user.id,
        "member.manage",
      );
      const target = await getMembership(
        app.supabase,
        req.params.projectId,
        req.params.userId,
      );
      if (!target) throw Errors.notFound("Member not found");

      if (!canManageMemberWithRole(actor.role, target.role)) {
        throw Errors.forbidden("You cannot modify this member");
      }
      // The sole owner cannot be demoted (would orphan the project).
      if (target.role === "owner") {
        throw Errors.badRequest("Transfer ownership before changing the owner's role");
      }

      const { data, error } = await app.supabase
        .from("memberships")
        .update({ role: req.body.role as ProjectRole })
        .eq("project_id", req.params.projectId)
        .eq("user_id", req.params.userId)
        .select("id, project_id, user_id, role, created_at, profile:profiles(*)")
        .single();
      if (error) throw error;
      return data;
    },
  );

  // Remove a member (owner/admin; admins can't remove an owner).
  r.delete(
    "/api/projects/:projectId/members/:userId",
    {
      preHandler: app.authenticate,
      schema: { params: memberParam, tags: ["members"] },
    },
    async (req, reply) => {
      const actor = await requireMembership(
        app.supabase,
        req.params.projectId,
        req.user.id,
        "member.manage",
      );
      const target = await getMembership(
        app.supabase,
        req.params.projectId,
        req.params.userId,
      );
      if (!target) throw Errors.notFound("Member not found");
      if (target.role === "owner") {
        throw Errors.badRequest("The project owner cannot be removed");
      }
      if (!canManageMemberWithRole(actor.role, target.role)) {
        throw Errors.forbidden("You cannot remove this member");
      }

      const { error } = await app.supabase
        .from("memberships")
        .delete()
        .eq("project_id", req.params.projectId)
        .eq("user_id", req.params.userId);
      if (error) throw error;
      return reply.code(204).send();
    },
  );
}
