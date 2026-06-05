import { z } from "zod";

/**
 * Validated runtime configuration. Fails fast at startup if the environment is
 * misconfigured rather than erroring deep inside a request.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGIN: z.string().default("*"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/** CORS origin option: "*" stays a string; a list becomes an array. */
export function corsOrigin(value: string): string | string[] | boolean {
  if (value === "*") return true;
  const origins = value.split(",").map((s) => s.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0]! : origins;
}
