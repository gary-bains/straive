import type { FastifyInstance } from "fastify";

/** Liveness/readiness endpoints for Cloud Run and uptime checks. */
export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", { schema: { tags: ["system"] } }, async () => ({
    status: "ok",
    uptime: process.uptime(),
  }));

  // Readiness verifies the DB connection AND that the schema is migrated.
  // NB: a plain select (not head:true) so a missing table surfaces as an error
  // — with head:true the 404 has no body and supabase-js leaves `error` null.
  app.get("/ready", { schema: { tags: ["system"] } }, async (_req, reply) => {
    const { error } = await app.supabase.from("projects").select("id").limit(1);
    if (error) {
      return reply.code(503).send({ status: "unavailable", reason: error.message });
    }
    return { status: "ready" };
  });
}
