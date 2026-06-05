import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { Errors } from "../lib/errors.js";

export interface AuthUser {
  id: string;
  email: string | undefined;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser;
  }
  interface FastifyInstance {
    /** preHandler that requires a valid Supabase JWT and sets request.user. */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Verifies the `Authorization: Bearer <jwt>` header by asking Supabase Auth to
 * resolve the token (works for any token signing scheme). On success the
 * authenticated user is attached to the request.
 */
export const authPlugin = fp(
  async (app: FastifyInstance) => {
    // Populated by `authenticate`; cast because the property is non-null only
    // after that preHandler runs.
    app.decorateRequest("user", null as unknown as AuthUser);

    app.decorate(
      "authenticate",
      async (req: FastifyRequest, _reply: FastifyReply) => {
        const header = req.headers.authorization;
        if (!header?.startsWith("Bearer ")) {
          throw Errors.unauthorized("Missing bearer token");
        }
        const token = header.slice("Bearer ".length).trim();

        const { data, error } = await app.supabase.auth.getUser(token);
        if (error || !data.user) {
          throw Errors.unauthorized("Invalid or expired token");
        }

        req.user = { id: data.user.id, email: data.user.email };
      },
    );
  },
  { name: "auth", dependencies: ["supabase"] },
);
