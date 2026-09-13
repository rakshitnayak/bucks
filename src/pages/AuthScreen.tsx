import { type FormEvent, useState } from "react";
import { api, type Session } from "../api";
import { PublicHeader } from "../components/PublicHeader";
import { LandingOverview } from "../components/LandingOverview";

type AuthScreenProps = {
  onSession: (session: Session) => void;
};

export function AuthScreen({ onSession }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    const form = new FormData(event.currentTarget);
    try {
      onSession(
        await api[mode](
          String(form.get("email")),
          String(form.get("password")),
        ),
      );
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="public-page">
      <PublicHeader />
      <div className="landing-layout">
        <LandingOverview />
        <section className="auth-card">
          <p className="public-kicker">YOUR NEXT MONEY CHAPTER</p>
          <h1>
            {mode === "register"
              ? "Start fresh. Stay on track."
              : "Welcome back."}
          </h1>
          <p className="auth-copy">
            {mode === "register"
              ? "Build a clearer picture of your money, one entry at a time."
              : "Your books and little money moments are waiting for you."}
          </p>
          <form onSubmit={submit}>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={12}
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                required
                placeholder="At least 12 characters"
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "register"
                  ? "Create account"
                  : "Sign in"}{" "}
              <span>→</span>
            </button>
          </form>
          <button
            className="auth-switch"
            onClick={() => {
              setMode(mode === "register" ? "login" : "register");
              setError("");
            }}
          >
            {mode === "register"
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </button>
          <p className="auth-footer">
            Just exploring? <a href="/calculator">Plan a budget for free ↗</a>
          </p>
        </section>
      </div>
      <footer className="public-footer">
        bucks · Small entries. Clearer days.
      </footer>
    </div>
  );
}
