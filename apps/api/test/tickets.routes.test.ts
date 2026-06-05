import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEEDED_PROJECT_ID, authHeader, buildTestApp } from "./helpers.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const base = `/api/projects/${SEEDED_PROJECT_ID}/tickets`;

describe("tickets routes", () => {
  it("lists tickets for a member", async () => {
    const res = await app.inject({
      method: "GET",
      url: base,
      headers: { authorization: await authHeader("carol@example.com") },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    expect(res.json().length).toBeGreaterThanOrEqual(5);
  });

  it("filters tickets by status", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${base}?status=todo`,
      headers: { authorization: await authHeader("carol@example.com") },
    });
    expect(res.statusCode).toBe(200);
    for (const t of res.json()) expect(t.status).toBe("todo");
  });

  it("lets a member create, update, but not delete a ticket", async () => {
    const carol = await authHeader("carol@example.com");

    const created = await app.inject({
      method: "POST",
      url: base,
      headers: { authorization: carol },
      payload: { title: "Member ticket", priority: "high" },
    });
    expect(created.statusCode).toBe(201);
    const ticket = created.json();
    expect(ticket.reporter_id).toBe("33333333-3333-3333-3333-333333333333");
    expect(ticket.status).toBe("todo");

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/tickets/${ticket.id}`,
      headers: { authorization: carol },
      payload: { status: "in_progress" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().status).toBe("in_progress");

    // Member cannot delete.
    const deletedByMember = await app.inject({
      method: "DELETE",
      url: `/api/tickets/${ticket.id}`,
      headers: { authorization: carol },
    });
    expect(deletedByMember.statusCode).toBe(403);

    // Admin can delete (cleanup).
    const deletedByAdmin = await app.inject({
      method: "DELETE",
      url: `/api/tickets/${ticket.id}`,
      headers: { authorization: await authHeader("bob@example.com") },
    });
    expect(deletedByAdmin.statusCode).toBe(204);
  });

  it("forbids a viewer from creating a ticket", async () => {
    const res = await app.inject({
      method: "POST",
      url: base,
      headers: { authorization: await authHeader("dave@example.com") },
      payload: { title: "Should fail" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects invalid ticket payloads", async () => {
    const res = await app.inject({
      method: "POST",
      url: base,
      headers: { authorization: await authHeader("carol@example.com") },
      payload: { title: "", priority: "nope" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for a missing ticket", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/tickets/00000000-0000-0000-0000-000000000099",
      headers: { authorization: await authHeader("carol@example.com") },
    });
    expect(res.statusCode).toBe(404);
  });
});
