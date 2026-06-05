import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function Layout() {
  const { user, signOut } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/projects" className="brand">
          🎫 Ticketing
        </Link>
        <div className="topbar-right">
          <span className="muted">{user?.email}</span>
          <button className="btn btn-ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
