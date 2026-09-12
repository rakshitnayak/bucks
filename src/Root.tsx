import { useEffect, useState } from "react";
import { api, type Session } from "./api";
import { App } from "./layout/App";
import { AuthScreen } from "./pages/AuthScreen";

export function Root() {
  const [session, setSession] = useState<Session | null | undefined>();

  useEffect(() => {
    api
      .me()
      .then(setSession)
      .catch(() => setSession(null));
  }, []);

  if (session === undefined) {
    return <div className="app-loading">Opening your daybook…</div>;
  }

  return session ? (
    <App session={session} onLogout={() => setSession(null)} />
  ) : (
    <AuthScreen onSession={setSession} />
  );
}
