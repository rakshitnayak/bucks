type MetricProps = {
  title: string;
  value: string;
  note: string;
  tone?: string;
};

export function Metric({ title, value, note, tone }: MetricProps) {
  return (
    <article className="metric">
      <p>{title}</p>
      <strong className={tone}>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
