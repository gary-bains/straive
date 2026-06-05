import {
  type ProjectWithRole,
  createProjectSchema,
  updateProjectSchema,
} from "@ticketing/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { Errors } from "../lib/errors.js";
import { requireMembership } from "../lib/rbac.js";

const idParam = z.object({ id: z.string().uuid() });

export async function projectRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // List projects the caller belongs to, annotated with their role.
  r.get(
    "/api/projects",
    { preHandler: app.authenticate, schema: { tags: ["projects"] } },
    async (req) => {
      const { data, error } = await app.supabase
        .from("memberships")
        .select("role, project:projects(*)")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;

      return (data ?? [])
        .filter((row) => row.project)
        .map((row) => ({
          ...(row.project as unknown as ProjectWithRole),
          role: row.role,
        }));
    },
  );

  // Create a project; the creator becomes its owner.
  r.post(
    "/api/projects",
    {
      preHandler: app.authenticate,
      schema: { body: createProjectSchema, tags: ["projects"] },
    },
    async (req, reply) => {
      const { data: project, error } = await app.supabase
        .from("projects")
        .insert({
          name: req.body.name,
          description: req.body.description ?? null,
          owner_id: req.user.id,
        })
        .select("*")
        .single();
      if (error) throw error;

      const { error: memErr } = await app.supabase.from("memberships").insert({
        project_id: project.id,
        user_id: req.user.id,
        role: "owner",
      });
      if (memErr) {
        // Roll back the orphaned project so the creator can retry cleanly.
        await app.supabase.from("projects").delete().eq("id", project.id);
        throw memErr;
      }

      return reply.code(201).send({ ...project, role: "owner" });
    },
  );

  // Project detail (any member).
  r.get(
    "/api/projects/:id",
    {
      preHandler: app.authenticate,
      schema: { params: idParam, tags: ["projects"] },
    },
    async (req) => {
      const membership = await requireMembership(
        app.supabase,
        req.params.id,
        req.user.id,
        "project.view",
      );
      const { data, error } = await app.supabase
        .from("projects")
        .select("*")
        .eq("id", req.params.id)
        .single();
      if (error) throw error;
      return { ...data, role: membership.role };
    },
  );

  // Update project (owner/admin).
  r.patch(
    "/api/projects/:id",
    {
      preHandler: app.authenticate,
      schema: { params: idParam, body: updateProjectSchema, tags: ["projects"] },
    },
    async (req) => {
      await requireMembership(
        app.supabase,
        req.params.id,
        req.user.id,
        "project.update",
      );
      if (Object.keys(req.body).length === 0) {
        throw Errors.badRequest("No fields to update");
      }
      const { data, error } = await app.supabase
        .from("projects")
        .update(req.body)
        .eq("id", req.params.id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
  );

  // Delete project (owner only).
  r.delete(
    "/api/projects/:id",
    {
      preHandler: app.authenticate,
      schema: { params: idParam, tags: ["projects"] },
    },
    async (req, reply) => {
      await requireMembership(
        app.supabase,
        req.params.id,
        req.user.id,
        "project.delete",
      );
      const { error } = await app.supabase
        .from("projects")
        .delete()
        .eq("id", req.params.id);
      if (error) throw error;
      return reply.code(204).send();
    },
  );
}
