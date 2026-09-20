const features = [
  {
    icon: "↗",
    title: "Every account. Its own book.",
    copy: "Create books for your bank, cash, household or side project. Keep every money story organised.",
  },
  {
    icon: "+",
    title: "Capture the little things.",
    copy: "Log cash in and out with categories, notes and the payment mode you used.",
  },
  {
    icon: "◷",
    title: "See where your money goes.",
    copy: "Explore insights across all books or zoom into one, filter dates and export logs to PDF.",
  },
];

export function LandingOverview() {
  return (
    <section className="landing-overview">
      <p className="public-kicker">
        <span /> A LITTLE CLARITY. A LOT LESS GUESSWORK.
      </p>
      <h1>
        Your money,
        <br />
        with a little more <em>meaning.</em>
      </h1>
      <p className="landing-intro">
        Meet bucks — your everyday money journal. Track what comes in, what goes
        out, and everything in between. One beautiful place for all your books.
      </p>
      <div
        className="money-preview"
        aria-label="Illustrative Bucks book preview"
      >
        <div className="preview-heading">
          <span>My everyday book</span>
          <span className="sample-badge">PREVIEW</span>
        </div>
        <p className="preview-label">A little snapshot of your month</p>
        <div className="preview-balance">
          ₹24,850<span>Current balance</span>
        </div>
        <div className="preview-totals">
          <span>
            ↙ Cash in <strong>₹50,000</strong>
          </span>
          <span>
            ↗ Cash out <strong>₹25,150</strong>
          </span>
        </div>
        <div className="preview-entry">
          <span className="preview-icon">☕</span>
          <span>
            Coffee & a catch-up<small>Food & drinks · UPI</small>
          </span>
          <strong>− ₹240</strong>
        </div>
      </div>
      <div className="landing-features" id="features">
        {features.map((feature) => (
          <article key={feature.title}>
            <span className="feature-icon">{feature.icon}</span>
            <h2>{feature.title}</h2>
            <p>{feature.copy}</p>
          </article>
        ))}
      </div>
      <a className="calculator-teaser" href="/calculator">
        <span>
          Make room for what matters.
          <small>
            Try the free 50/30/20 budget calculator. No account needed.
          </small>
        </span>
        <span>↗</span>
      </a>
    </section>
  );
}
