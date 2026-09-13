import { useState } from "react";
import { PublicHeader } from "../components/PublicHeader";

const buckets = [
  {
    name: "Needs",
    description:
      "The essentials: rent, groceries, bills, transport and minimum debt payments.",
    className: "needs",
  },
  {
    name: "Wants",
    description:
      "The good extras: eating out, hobbies, shopping and entertainment.",
    className: "wants",
  },
  {
    name: "Savings",
    description:
      "Your future: emergency funds, savings, investments and extra debt repayments.",
    className: "savings",
  },
];

export function BudgetCalculator() {
  const [income, setIncome] = useState("50000");
  const [currency, setCurrency] = useState("INR");
  const [percentages, setPercentages] = useState(["50", "30", "20"]);
  const amount = Number(income);
  const shares = percentages.map(Number);
  const total = shares.reduce((sum, value) => sum + value, 0);
  const valid =
    income.trim() !== "" &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    percentages.every(
      (value, index) =>
        value.trim() !== "" &&
        Number.isFinite(shares[index]) &&
        shares[index] >= 0 &&
        shares[index] <= 100,
    ) &&
    Math.abs(total - 100) < 0.001;
  const money = (value: number) =>
    new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);

  return (
    <div className="public-page">
      <PublicHeader />
      <div className="calculator-page">
        <p className="public-kicker">FREE TOOL · NO SIGN-IN NEEDED</p>
        <h1>
          A plan for every <em>buck.</em>
        </h1>
        <p className="calculator-intro">
          Give your monthly take-home income three simple jobs: essentials,
          enjoyment and your future. Start with 50/30/20, then adjust it to fit
          your life.
        </p>
        <div className="calculator-layout">
          <section className="calculator-inputs" aria-label="Budget settings">
            <h2>Let’s find your balance.</h2>
            <label htmlFor="income">Monthly take-home income</label>
            <div className="income-input">
              <select
                aria-label="Currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                <option value="INR">INR ₹</option>
                <option value="USD">USD $</option>
                <option value="EUR">EUR €</option>
                <option value="GBP">GBP £</option>
              </select>
              <input
                id="income"
                type="number"
                min="0"
                step="0.01"
                value={income}
                onChange={(event) => setIncome(event.target.value)}
              />
            </div>
            <p className="calculator-hint">
              Use the amount you receive after taxes.
            </p>
            <div className="split-heading">
              <h3>Your split</h3>
              <button
                type="button"
                onClick={() => setPercentages(["50", "30", "20"])}
              >
                Reset to 50/30/20
              </button>
            </div>
            <div className="percentage-inputs">
              {buckets.map((bucket, index) => (
                <label key={bucket.name}>
                  {bucket.name}
                  <span>
                    <input
                      aria-label={`${bucket.name} percentage`}
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={percentages[index]}
                      onChange={(event) =>
                        setPercentages((current) =>
                          current.map((value, position) =>
                            position === index ? event.target.value : value,
                          ),
                        )
                      }
                    />
                    %
                  </span>
                </label>
              ))}
            </div>
            {!valid && (
              <p className="form-error" role="alert">
                Enter a non-negative income and percentages between 0 and 100
                that add up to 100%. Your current total is{" "}
                {Number.isFinite(total) ? total : "—"}%.
              </p>
            )}
            <p className="calculator-hint">
              The standard rule is 50/30/20. A 50/30/30 split adds up to 110%,
              so it would exceed your income.
            </p>
          </section>
          <section
            className="budget-results"
            aria-label="Your budget"
            aria-live="polite"
          >
            <div className="results-heading">
              <span>YOUR MONTHLY PLAN</span>
              <strong>{valid ? money(amount) : "—"}</strong>
            </div>
            <div className="budget-bar" aria-hidden="true">
              {buckets.map((bucket, index) => (
                <span
                  key={bucket.name}
                  className={bucket.className}
                  style={{ width: valid ? `${shares[index]}%` : "33.33%" }}
                />
              ))}
            </div>
            {buckets.map((bucket, index) => (
              <article
                className={`budget-bucket ${bucket.className}`}
                key={bucket.name}
              >
                <div>
                  <h2>
                    {bucket.name}
                    <span>{valid ? `${shares[index]}%` : "—"}</span>
                  </h2>
                  <p>{bucket.description}</p>
                </div>
                <strong>
                  {valid ? money((amount * shares[index]) / 100) : "—"}
                </strong>
              </article>
            ))}
            <p className="calculator-hint">
              A starting point, not a strict rule. Adjust for your commitments
              and goals. Values are rounded to the nearest currency fraction.
            </p>
          </section>
        </div>
        <div className="calculator-cta">
          <div>
            <h2>A budget is the beginning.</h2>
            <p>
              Use bucks to track your actual spending with books, categories and
              insights.
            </p>
          </div>
          <a className="public-button" href="/">
            Start your money journal →
          </a>
        </div>
        <p className="calculator-privacy">
          Calculated in your browser. Your income is not sent to our server or
          saved.
        </p>
      </div>
      <footer className="public-footer">
        <a href="/">← Back to bucks</a>
        <span>Small entries. Clearer days.</span>
      </footer>
    </div>
  );
}
