import { useEffect, useState } from "react";
import { api, type Session } from "../api";
import { BooksDashboard } from "../pages/BooksDashboard";
import { BookPage } from "../pages/BookPage";
import { Sidebar } from "./Sidebar";

type AppProps = {
  session: Session;
  onLogout: () => void;
};

export function App({ session, onLogout }: AppProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<string | null>(() =>
    location.hash.startsWith("#book/") ? location.hash.slice(6) : null,
  );
  const [theme, setTheme] = useState<"light" | "dark">(
    () =>
      (localStorage.getItem("daybook-theme") as "light" | "dark") || "light",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("daybook-theme", theme);
  }, [theme]);

  const openBook = (id: string | null) => {
    location.hash = id ? `book/${id}` : "";
    setSelectedBook(id);
  };

  const toggleTheme = () =>
    setTheme((value) => (value === "light" ? "dark" : "light"));

  const signOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setLogoutError(null);
    try {
      await api.logout();
      location.hash = "";
      onLogout();
    } catch {
      setLogoutError("Unable to sign out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="app-shell">
      <Sidebar
        session={session}
        home={() => openBook(null)}
        onLogout={signOut}
        isSigningOut={isSigningOut}
        theme={theme}
        toggleTheme={toggleTheme}
      />
      <div className="mobile-actions">
        <button onClick={toggleTheme}>{theme === "light" ? "☾" : "☀"}</button>
        <button onClick={signOut} disabled={isSigningOut}>
          {isSigningOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
      {logoutError && <div role="alert">{logoutError}</div>}
      {selectedBook ? (
        <BookPage
          session={session}
          bookId={selectedBook}
          back={() => openBook(null)}
        />
      ) : (
        <BooksDashboard session={session} openBook={openBook} />
      )}
    </div>
  );
}
