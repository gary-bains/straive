import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useAuth } from "./lib/auth";
import { LoginPage } from "./pages/LoginPage";
import { ProjectBoardPage } from "./pages/ProjectBoardPage";
import { ProjectsPage } from "./pages/ProjectsPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="centered muted">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  const { session } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/projects" replace /> : <LoginPage />}
      />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectBoardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
