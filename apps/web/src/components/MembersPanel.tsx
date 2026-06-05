import {
  type ProjectRole,
  can,
  canManageMemberWithRole,
} from "@ticketing/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { api } from "../api/client";

const ASSIGNABLE_ROLES: ProjectRole[] = ["admin", "member", "viewer"];

export function MembersPanel({
  projectId,
  myRole,
}: {
  projectId: string;
  myRole: ProjectRole;
}) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const manage = can(myRole, "member.manage");

  const members = useQuery({
    queryKey: ["members", projectId],
    queryFn: () => api.listMembers(projectId),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["members", projectId] });

  const addMember = useMutation({
    mutationFn: () => api.addMember(projectId, { email, role }),
    onSuccess: () => {
      setEmail("");
      void invalidate();
    },
  });

  const changeRole = useMutation({
    mutationFn: (vars: { userId: string; role: "admin" | "member" | "viewer" }) =>
      api.updateMember(projectId, vars.userId, { role: vars.role }),
    onSuccess: invalidate,
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.removeMember(projectId, userId),
    onSuccess: invalidate,
  });

  function onInvite(e: FormEvent) {
    e.preventDefault();
    if (email.trim()) addMember.mutate();
  }

  return (
    <aside className="card members-panel">
      <h3>Members</h3>

      <ul className="member-list">
        {members.data?.map((m) => {
          const editable =
            manage && m.role !== "owner" && canManageMemberWithRole(myRole, m.role);
          return (
            <li key={m.user_id} className="member-row">
              <div>
                <div className="member-name">
                  {m.profile.full_name ?? m.profile.email}
                </div>
                <div className="muted small">{m.profile.email}</div>
              </div>
              {editable ? (
                <div className="member-actions">
                  <select
                    value={m.role}
                    onChange={(e) =>
                      changeRole.mutate({
                        userId: m.user_id,
                        role: e.target.value as "admin" | "member" | "viewer",
                      })
                    }
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => removeMember.mutate(m.user_id)}
                    aria-label="Remove member"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <span className={`badge role-${m.role}`}>{m.role}</span>
              )}
            </li>
          );
        })}
      </ul>

      {manage && (
        <form className="invite-form" onSubmit={onInvite}>
          <input
            type="email"
            placeholder="Invite by email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="form-row">
            <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button className="btn btn-primary btn-sm" disabled={addMember.isPending}>
              Invite
            </button>
          </div>
          {addMember.isError && (
            <div className="error small">{(addMember.error as Error).message}</div>
          )}
        </form>
      )}
    </aside>
  );
}
