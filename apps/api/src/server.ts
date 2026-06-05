import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function main() {
  // Load .env in non-production for local convenience.
  if (process.env.NODE_ENV !== "production") {
    const { config } = await import("dotenv");
    config();
  }

  const cfg = loadConfig();
  const app = await buildApp(cfg);

  const close = async (signal: string) => {
    app.log.info({ signal }, "Shutting down");
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void close("SIGTERM"));
  process.on("SIGINT", () => void close("SIGINT"));

  try {
    await app.listen({ port: cfg.PORT, host: cfg.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
