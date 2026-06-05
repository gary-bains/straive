import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type { AppConfig } from "../config.js";

declare module "fastify" {
  interface FastifyInstance {
    /** Service-role Supabase client. Full DB access; bypasses RLS. */
    supabase: SupabaseClient;
  }
}

/**
 * Decorates the Fastify instance with a single service-role Supabase client.
 * Authorization is enforced in the API layer (see lib/rbac.ts), so this client
 * intentionally has unrestricted database access.
 */
export const supabasePlugin = fp(
  async (app: FastifyInstance, opts: { config: AppConfig }) => {
    const client = createClient(
      opts.config.SUPABASE_URL,
      opts.config.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    app.decorate("supabase", client);
  },
  { name: "supabase" },
);
