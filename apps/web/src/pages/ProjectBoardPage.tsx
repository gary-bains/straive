import { type Ticket, TICKET_STATUSES, can } from "@ticketing/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { MembersPanel } from "../components/MembersPanel";
import { TicketModal } from "../components/TicketModal";

const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

export function ProjectBoardPage() {
  const { projectId = "" } = useParams();
  const [modal, setModal] = useState<{ ticket?: Ticket } | null>(null);

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.getProject(projectId),
  });
  const tickets = useQuery({
    queryKey: ["tickets", projectId],
    queryFn: () => api.listTickets(projectId),
  });
  const members = useQuery({
    queryKey: ["members", projectId],
    queryFn: () => api.listMembers(projectId),
  });

  if (project.isLoading) return <p className="muted">Loading…</p>;
  if (project.isError)
    return <div className="error">{(project.error as Error).message}</div>;

  const role = project.data!.role;
  const canCreate = can(role, "ticket.create");
  const canUpdate = can(role, "ticket.update");
  const canDelete = can(role, "ticket.delete");
  const memberList = members.data ?? [];

  const nameFor = (id: string | null) =>
    id ? memberList.find((m) => m.user_id === id)?.profile.full_name ?? "—" : null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link to="/projects" className="muted small">
            ← Projects
          </Link>
          <h1>
            {project.data!.name}{" "}
            <span className={`badge role-${role}`}>{role}</span>
          </h1>
        </div>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setModal({})}>
            + New ticket
          </button>
        )}
      </div>

      <div className="board-layout">
        <div className="board">
          {TICKET_STATUSES.map((status) => {
            const items = (tickets.data ?? []).filter((t) => t.status === status);
            return (
              <div key={status} className="board-column">
                <div className="column-header">
                  <span>{STATUS_LABELS[status]}</span>
                  <span className="count">{items.length}</span>
                </div>
                {items.map((t) => (
                  <div
                    key={t.id}
                    className={`ticket-card ${canUpdate ? "clickable" : ""}`}
                    onClick={canUpdate ? () => setModal({ ticket: t }) : undefined}
                  >
                    <div className="ticket-title">{t.title}</div>
                    <div className="ticket-meta">
                      <span className={`badge priority-${t.priority}`}>
                        {t.priority}
                      </span>
                      {t.assignee_id && (
                        <span className="muted small">{nameFor(t.assignee_id)}</span>
                      )}
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="empty-col muted">—</div>}
              </div>
            );
          })}
        </div>

        <MembersPanel projectId={projectId} myRole={role} />
      </div>

      {modal && (
        <TicketModal
          projectId={projectId}
          members={memberList}
          ticket={modal.ticket}
          canDelete={canDelete}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
