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
    await api.logout();
    onLogout();
  };

  return (
    <div className="app-shell">
      <Sidebar
        session={session}
        home={() => openBook(null)}
        onLogout={onLogout}
        theme={theme}
        toggleTheme={toggleTheme}
      />
      <div className="mobile-actions">
        <button onClick={toggleTheme}>{theme === "light" ? "☾" : "☀"}</button>
        <button onClick={signOut}>Sign out</button>
      </div>
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
