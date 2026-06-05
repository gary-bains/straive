import { describe, expect, it } from "vitest";
import { can, canManageMemberWithRole } from "./permissions.js";

describe("can()", () => {
  it("grants owners every action", () => {
    expect(can("owner", "project.delete")).toBe(true);
    expect(can("owner", "member.manage")).toBe(true);
    expect(can("owner", "ticket.delete")).toBe(true);
  });

  it("lets admins manage but not delete the project", () => {
    expect(can("admin", "member.manage")).toBe(true);
    expect(can("admin", "ticket.delete")).toBe(true);
    expect(can("admin", "project.delete")).toBe(false);
  });

  it("lets members work tickets but not manage members or delete tickets", () => {
    expect(can("member", "ticket.create")).toBe(true);
    expect(can("member", "ticket.update")).toBe(true);
    expect(can("member", "ticket.delete")).toBe(false);
    expect(can("member", "member.manage")).toBe(false);
    expect(can("member", "project.update")).toBe(false);
  });

  it("restricts viewers to read-only", () => {
    expect(can("viewer", "project.view")).toBe(true);
    expect(can("viewer", "ticket.view")).toBe(true);
    expect(can("viewer", "ticket.create")).toBe(false);
    expect(can("viewer", "ticket.update")).toBe(false);
  });
});

describe("canManageMemberWithRole()", () => {
  it("forbids admins from touching owners", () => {
    expect(canManageMemberWithRole("admin", "owner")).toBe(false);
    expect(canManageMemberWithRole("admin", "member")).toBe(true);
  });

  it("allows owners to manage any role", () => {
    expect(canManageMemberWithRole("owner", "owner")).toBe(true);
    expect(canManageMemberWithRole("owner", "admin")).toBe(true);
  });

  it("forbids members and viewers entirely", () => {
    expect(canManageMemberWithRole("member", "viewer")).toBe(false);
    expect(canManageMemberWithRole("viewer", "viewer")).toBe(false);
  });
});
