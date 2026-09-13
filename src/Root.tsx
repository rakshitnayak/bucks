import { useEffect, useState } from "react";
import { api, type Session } from "./api";
import { App } from "./layout/App";
import { AuthScreen } from "./pages/AuthScreen";
import { BudgetCalculator } from "./pages/BudgetCalculator";

export function Root() {
  const [session, setSession] = useState<Session | null | undefined>();
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const updatePath = () => setPath(window.location.pathname);
    window.addEventListener("popstate", updatePath);
    return () => window.removeEventListener("popstate", updatePath);
  }, []);

  useEffect(() => {
    api
      .me()
      .then(setSession)
      .catch(() => setSession(null));
  }, []);

  if (path === "/calculator" || path === "/calculator/") {
    return <BudgetCalculator />;
  }

  if (session === undefined) {
    return <div className="app-loading">Opening bucks…</div>;
  }

  return session ? (
    <App session={session} onLogout={() => setSession(null)} />
  ) : (
    <AuthScreen onSession={setSession} />
  );
}
