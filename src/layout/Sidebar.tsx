import type { Session } from "../api";

type SidebarProps = {
  session: Session;
  home: () => void;
  onLogout: () => void;
  isSigningOut: boolean;
  theme: "light" | "dark";
  toggleTheme: () => void;
};

export function Sidebar({
  session,
  home,
  onLogout,
  isSigningOut,
  theme,
  toggleTheme,
}: SidebarProps) {
  return (
    <aside>
      <button className="brand plain" onClick={home}>
        <i>b</i>bucks
      </button>
      <nav>
        <button className="active" onClick={home}>
          ⌂ <span>All books</span>
        </button>
        <a href="#books">
          ▣ <span>Your books</span>
        </a>
        <a href="#insights">
          ◔ <span>Insights</span>
        </a>
        <button onClick={toggleTheme}>
          {theme === "light" ? "☾" : "☀"}{" "}
          <span>{theme === "light" ? "Dark" : "Light"} mode</span>
        </button>
      </nav>
      <div className="aside-bottom">
        <div className="plan">
          <b>Your money, organised</b>
          <small>Every account. One clear picture.</small>
        </div>
        <div className="user">
          <i>{session.user.email.slice(0, 2).toUpperCase()}</i>
          <span>
            <b>{session.user.email.split("@")[0]}</b>
            <small>{session.user.email}</small>
          </span>
          <button className="logout" onClick={onLogout} disabled={isSigningOut}>
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </aside>
  );
}
