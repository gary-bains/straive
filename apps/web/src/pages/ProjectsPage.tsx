import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export function ProjectsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });

  const createProject = useMutation({
    mutationFn: () =>
      api.createProject({ name, description: description || undefined }),
    onSuccess: () => {
      setName("");
      setDescription("");
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) createProject.mutate();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Projects</h1>
      </div>

      <form className="card inline-form" onSubmit={onCreate}>
        <input
          placeholder="New project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button className="btn btn-primary" disabled={createProject.isPending}>
          {createProject.isPending ? "Creating…" : "Create"}
        </button>
      </form>
      {createProject.isError && (
        <div className="error">{(createProject.error as Error).message}</div>
      )}

      {projects.isLoading && <p className="muted">Loading projects…</p>}
      {projects.isError && (
        <div className="error">{(projects.error as Error).message}</div>
      )}

      <div className="grid">
        {projects.data?.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} className="card project-card">
            <div className="project-card-head">
              <h3>{p.name}</h3>
              <span className={`badge role-${p.role}`}>{p.role}</span>
            </div>
            <p className="muted">{p.description || "No description"}</p>
          </Link>
        ))}
        {projects.data?.length === 0 && (
          <p className="muted">No projects yet — create one above.</p>
        )}
      </div>
    </div>
  );
}
