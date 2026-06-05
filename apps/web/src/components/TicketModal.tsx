import {
  type MemberWithProfile,
  type Ticket,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from "@ticketing/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { api } from "../api/client";
import { Modal } from "./Modal";

interface Props {
  projectId: string;
  members: MemberWithProfile[];
  ticket?: Ticket;
  canDelete: boolean;
  onClose: () => void;
}

export function TicketModal({ projectId, members, ticket, canDelete, onClose }: Props) {
  const qc = useQueryClient();
  const editing = Boolean(ticket);

  const [title, setTitle] = useState(ticket?.title ?? "");
  const [description, setDescription] = useState(ticket?.description ?? "");
  const [status, setStatus] = useState(ticket?.status ?? "todo");
  const [priority, setPriority] = useState(ticket?.priority ?? "medium");
  const [assignee, setAssignee] = useState(ticket?.assignee_id ?? "");

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["tickets", projectId] });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        title,
        description: description || undefined,
        status,
        priority,
        assignee_id: assignee || null,
      };
      return editing
        ? api.updateTicket(ticket!.id, payload)
        : api.createTicket(projectId, payload);
    },
    onSuccess: () => {
      void invalidate();
      onClose();
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteTicket(ticket!.id),
    onSuccess: () => {
      void invalidate();
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (title.trim()) save.mutate();
  }

  return (
    <Modal title={editing ? "Edit ticket" : "New ticket"} onClose={onClose}>
      <form onSubmit={onSubmit} className="form">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </label>
        <div className="form-row">
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as Ticket["status"])}>
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Ticket["priority"])}
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Assignee
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile.full_name ?? m.profile.email}
              </option>
            ))}
          </select>
        </label>

        {save.isError && <div className="error">{(save.error as Error).message}</div>}

        <div className="modal-actions">
          {editing && canDelete && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              Delete
            </button>
          )}
          <div className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
