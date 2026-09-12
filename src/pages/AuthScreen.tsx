import { type FormEvent, useState } from "react";
import { api, type Session } from "../api";

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
    <div className="auth-page">
      <section className="auth-card">
        <span className="brand">
          <i>d</i>daybook
        </span>
        <p className="eyebrow">MONEY, GENTLY ORGANISED</p>
        <h1>
          {mode === "register" ? "Create your daybook." : "Welcome back."}
        </h1>
        <p className="auth-copy">
          One calm place for every account, expense and small money moment.
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
          {error && <p className="form-error">{error}</p>}
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
      </section>
    </div>
  );
}
