import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

/**
 * Integration tests run against the LOCAL Supabase stack (`supabase start`).
 *
 * Keys are never hard-coded. They come from the environment (CI sets them), and
 * otherwise are read from the running local stack via `supabase status` — so no
 * secret-shaped value lives in the repo.
 */
function resolveSupabaseEnv() {
  let url = process.env.SUPABASE_URL;
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !serviceKey || !anonKey) {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
    let out: string;
    try {
      out = execSync("npx --yes supabase status -o env", {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      throw new Error(
        "Local Supabase is not running. Start it with `npm run db:start`, or set " +
          "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY.",
      );
    }
    const read = (key: string) =>
      out.match(new RegExp(`^${key}="?([^"\\n]+)"?`, "m"))?.[1];
    url ??= read("API_URL");
    serviceKey ??= read("SECRET_KEY");
    anonKey ??= read("PUBLISHABLE_KEY");
  }

  if (!url || !serviceKey || !anonKey) {
    throw new Error("Could not resolve local Supabase URL/keys.");
  }
  return { url, serviceKey, anonKey };
}

const env = resolveSupabaseEnv();
export const SUPABASE_URL = env.url;
export const SERVICE_KEY = env.serviceKey;
export const ANON_KEY = env.anonKey;

export const SEEDED_PROJECT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

export const USERS = {
  alice: { email: "alice@example.com", id: "11111111-1111-1111-1111-111111111111" },
  bob: { email: "bob@example.com", id: "22222222-2222-2222-2222-222222222222" },
  carol: { email: "carol@example.com", id: "33333333-3333-3333-3333-333333333333" },
  dave: { email: "dave@example.com", id: "44444444-4444-4444-4444-444444444444" },
} as const;

export async function buildTestApp(): Promise<FastifyInstance> {
  const cfg = loadConfig({
    NODE_ENV: "test",
    PORT: "8080",
    HOST: "0.0.0.0",
    CORS_ORIGIN: "*",
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  });
  return buildApp(cfg);
}

const tokenCache = new Map<string, string>();

/** Signs in a seeded user and returns an Authorization header value. */
export async function authHeader(email: string): Promise<string> {
  let token = tokenCache.get(email);
  if (!token) {
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: "password123",
    });
    if (error || !data.session) {
      throw new Error(`Failed to sign in ${email}: ${error?.message}`);
    }
    token = data.session.access_token;
    tokenCache.set(email, token);
  }
  return `Bearer ${token}`;
}
