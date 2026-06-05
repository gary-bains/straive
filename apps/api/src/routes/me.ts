import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { Errors } from "../lib/errors.js";

/** Returns the authenticated user's profile. */
export async function meRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/api/me",
    { preHandler: app.authenticate, schema: { tags: ["me"] } },
    async (req) => {
      const { data, error } = await app.supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url, created_at")
        .eq("id", req.user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw Errors.notFound("Profile not found");
      return data;
    },
  );
}
