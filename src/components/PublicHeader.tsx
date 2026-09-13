export function PublicHeader() {
  return (
    <header className="public-header">
      <a className="brand" href="/" aria-label="Bucks home">
        <i>b</i>bucks<span className="brand-dot">.</span>
      </a>
      <nav aria-label="Public navigation">
        <a href="/#features">Explore features</a>
        <a href="/calculator">Budget calculator ↗</a>
      </nav>
    </header>
  );
}
