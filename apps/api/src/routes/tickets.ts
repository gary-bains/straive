import {
  type Ticket,
  createTicketSchema,
  ticketFiltersSchema,
  updateTicketSchema,
} from "@ticketing/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { Errors } from "../lib/errors.js";
import { requireMembership } from "../lib/rbac.js";

const projectParam = z.object({ projectId: z.string().uuid() });
const ticketParam = z.object({ ticketId: z.string().uuid() });

async function loadTicket(supabase: SupabaseClient, ticketId: string): Promise<Ticket> {
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Errors.notFound("Ticket not found");
  return data as Ticket;
}

export async function ticketRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // List tickets in a project (any member), with optional filters.
  r.get(
    "/api/projects/:projectId/tickets",
    {
      preHandler: app.authenticate,
      schema: {
        params: projectParam,
        querystring: ticketFiltersSchema,
        tags: ["tickets"],
      },
    },
    async (req) => {
      await requireMembership(
        app.supabase,
        req.params.projectId,
        req.user.id,
        "ticket.view",
      );
      let query = app.supabase
        .from("tickets")
        .select("*")
        .eq("project_id", req.params.projectId);
      if (req.query.status) query = query.eq("status", req.query.status);
      if (req.query.assignee_id)
        query = query.eq("assignee_id", req.query.assignee_id);

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  );

  // Create a ticket (member and up). Reporter is the caller.
  r.post(
    "/api/projects/:projectId/tickets",
    {
      preHandler: app.authenticate,
      schema: {
        params: projectParam,
        body: createTicketSchema,
        tags: ["tickets"],
      },
    },
    async (req, reply) => {
      await requireMembership(
        app.supabase,
        req.params.projectId,
        req.user.id,
        "ticket.create",
      );
      const { data, error } = await app.supabase
        .from("tickets")
        .insert({
          project_id: req.params.projectId,
          title: req.body.title,
          description: req.body.description ?? null,
          status: req.body.status,
          priority: req.body.priority,
          assignee_id: req.body.assignee_id ?? null,
          reporter_id: req.user.id,
        })
        .select("*")
        .single();
      if (error) throw error;
      return reply.code(201).send(data);
    },
  );

  // Ticket detail (any member of its project).
  r.get(
    "/api/tickets/:ticketId",
    {
      preHandler: app.authenticate,
      schema: { params: ticketParam, tags: ["tickets"] },
    },
    async (req) => {
      const ticket = await loadTicket(app.supabase, req.params.ticketId);
      await requireMembership(
        app.supabase,
        ticket.project_id,
        req.user.id,
        "ticket.view",
      );
      return ticket;
    },
  );

  // Update a ticket (member and up).
  r.patch(
    "/api/tickets/:ticketId",
    {
      preHandler: app.authenticate,
      schema: { params: ticketParam, body: updateTicketSchema, tags: ["tickets"] },
    },
    async (req) => {
      const ticket = await loadTicket(app.supabase, req.params.ticketId);
      await requireMembership(
        app.supabase,
        ticket.project_id,
        req.user.id,
        "ticket.update",
      );
      if (Object.keys(req.body).length === 0) {
        throw Errors.badRequest("No fields to update");
      }
      const { data, error } = await app.supabase
        .from("tickets")
        .update(req.body)
        .eq("id", req.params.ticketId)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
  );

  // Delete a ticket (owner/admin).
  r.delete(
    "/api/tickets/:ticketId",
    {
      preHandler: app.authenticate,
      schema: { params: ticketParam, tags: ["tickets"] },
    },
    async (req, reply) => {
      const ticket = await loadTicket(app.supabase, req.params.ticketId);
      await requireMembership(
        app.supabase,
        ticket.project_id,
        req.user.id,
        "ticket.delete",
      );
      const { error } = await app.supabase
        .from("tickets")
        .delete()
        .eq("id", req.params.ticketId);
      if (error) throw error;
      return reply.code(204).send();
    },
  );
}
