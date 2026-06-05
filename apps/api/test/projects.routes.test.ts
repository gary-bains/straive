import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SEEDED_PROJECT_ID,
  authHeader,
  buildTestApp,
} from "./helpers.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("projects routes", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await app.inject({ method: "GET", url: "/api/projects" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("lists the projects a user belongs to with their role", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { authorization: await authHeader("alice@example.com") },
    });
    expect(res.statusCode).toBe(200);
    const seeded = res.json().find((p: { id: string }) => p.id === SEEDED_PROJECT_ID);
    expect(seeded).toBeDefined();
    expect(seeded.role).toBe("owner");
  });

  it("creates a project and makes the creator owner", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { authorization: await authHeader("carol@example.com") },
      payload: { name: `Test Project ${Date.now()}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().role).toBe("owner");

    // Cleanup.
    await app.inject({
      method: "DELETE",
      url: `/api/projects/${res.json().id}`,
      headers: { authorization: await authHeader("carol@example.com") },
    });
  });

  it("returns 404 for a project the caller is not a member of", async () => {
    // Carol creates a private project; Alice is not a member.
    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { authorization: await authHeader("carol@example.com") },
      payload: { name: `Private ${Date.now()}` },
    });
    const projectId = created.json().id;

    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}`,
      headers: { authorization: await authHeader("alice@example.com") },
    });
    expect(res.statusCode).toBe(404);

    await app.inject({
      method: "DELETE",
      url: `/api/projects/${projectId}`,
      headers: { authorization: await authHeader("carol@example.com") },
    });
  });

  it("forbids a viewer from updating the project", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/projects/${SEEDED_PROJECT_ID}`,
      headers: { authorization: await authHeader("dave@example.com") },
      payload: { name: "Hacked" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("forbids an admin from deleting the project (owner only)", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/projects/${SEEDED_PROJECT_ID}`,
      headers: { authorization: await authHeader("bob@example.com") },
    });
    expect(res.statusCode).toBe(403);
  });

  it("validates the request body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { authorization: await authHeader("alice@example.com") },
      payload: { name: "" },
    });
    expect(res.statusCode).toBe(400);
  });
});
