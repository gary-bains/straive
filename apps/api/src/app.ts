import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { ApiError } from "@ticketing/shared";
import Fastify, { type FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { type AppConfig, corsOrigin } from "./config.js";
import { AppError } from "./lib/errors.js";
import { authPlugin } from "./plugins/auth.js";
import { supabasePlugin } from "./plugins/supabase.js";
import { healthRoutes } from "./routes/health.js";
import { meRoutes } from "./routes/me.js";
import { memberRoutes } from "./routes/members.js";
import { projectRoutes } from "./routes/projects.js";
import { ticketRoutes } from "./routes/tickets.js";

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "test" ? "silent" : "info",
      transport:
        config.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } }
          : undefined,
    },
  });

  // Zod drives both request validation and response serialization.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: corsOrigin(config.CORS_ORIGIN) });
  await app.register(supabasePlugin, { config });
  await app.register(authPlugin);

  await app.register(swagger, {
    openapi: {
      info: { title: "Ticketing API", version: "1.0.0" },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  // Error/notFound handlers MUST be registered before the route plugins so the
  // encapsulated route contexts inherit them (Fastify captures the handler that
  // exists on the parent at the moment a child plugin is registered).

  // Unknown routes -> consistent 404 envelope.
  app.setNotFoundHandler((req, reply) => {
    const body: ApiError = {
      error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.url} not found` },
    };
    reply.code(404).send(body);
  });

  // Central error handler -> consistent ApiError envelope.
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      const body: ApiError = {
        error: { code: error.code, message: error.message, details: error.details },
      };
      return reply.code(error.statusCode).send(body);
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const body: ApiError = {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.validation,
        },
      };
      return reply.code(400).send(body);
    }

    // Fastify built-in client errors (e.g. malformed JSON) carry a 4xx status.
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (typeof statusCode === "number" && statusCode < 500) {
      const message = error instanceof Error ? error.message : "Bad request";
      const body: ApiError = {
        error: { code: "BAD_REQUEST", message },
      };
      return reply.code(statusCode).send(body);
    }

    req.log.error({ err: error }, "Unhandled error");
    const body: ApiError = {
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    };
    return reply.code(500).send(body);
  });

  // Routes (registered after the handlers above so they inherit them).
  await app.register(healthRoutes);
  await app.register(meRoutes);
  await app.register(projectRoutes);
  await app.register(memberRoutes);
  await app.register(ticketRoutes);

  return app;
}
