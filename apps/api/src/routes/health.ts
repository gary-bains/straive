import type { FastifyInstance } from "fastify";

/** Liveness/readiness endpoints for Cloud Run and uptime checks. */
export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", { schema: { tags: ["system"] } }, async () => ({
    status: "ok",
    uptime: process.uptime(),
  }));

  // Readiness verifies the DB connection is usable.
  app.get("/ready", { schema: { tags: ["system"] } }, async (_req, reply) => {
    const { error } = await app.supabase
      .from("projects")
      .select("id", { count: "exact", head: true });
    if (error) {
      return reply.code(503).send({ status: "unavailable" });
    }
    return { status: "ready" };
  });
}
