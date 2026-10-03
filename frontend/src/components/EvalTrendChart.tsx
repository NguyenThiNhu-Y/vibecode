import { useEffect, useRef, useState } from "react";
import type { EvalReportInfo } from "../types";

// Validated categorical slots (dataviz reference palette); light/dark steps live in index.css.
export const SERIES = [
  { key: "pattern_accuracy", label: "Pattern accuracy", color: "var(--series-1)" },
  { key: "topic_recall", label: "Topic recall", color: "var(--series-2)" },
  { key: "schema_success_rate", label: "Schema success", color: "var(--series-3)" },
] as const;

const HEIGHT = 280;
const PAD = { top: 16, right: 132, bottom: 40, left: 48 };

export function reportLabel(r: EvalReportInfo): string {
  return r.label || r.name.replace("eval_", "");
}

export default function EvalTrendChart({ reports }: { reports: EvalReportInfo[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const n = reports.length;
  const x = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + (1 - v) * plotH;
  const value = (r: EvalReportInfo, key: (typeof SERIES)[number]["key"]) => Number(r.summary[key] ?? 0);

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n === 1 ? 0 : Math.round((px / rect.width) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  const last = reports[n - 1];
  // Direct labels at the line ends, nudged apart so they never collide.
  const endLabels = SERIES.map((s) => ({ ...s, y: y(value(last, s.key)) }))
    .sort((a, b) => a.y - b.y)
    .map((l, i, arr) => ({ ...l, y: i > 0 && l.y - arr[i - 1].y < 16 ? arr[i - 1].y + 16 : l.y }));

  return (
    <div ref={box} className="relative">
      <svg width={width} height={HEIGHT} role="img" aria-label="Biểu đồ chỉ số eval qua các lần chạy">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fill="var(--subtle)" fontSize={12}>
              {t * 100}%
            </text>
          </g>
        ))}
        {reports.map((r, i) =>
          n <= 8 || i % Math.ceil(n / 8) === 0 || i === n - 1 ? (
            <text key={r.name} x={x(i)} y={HEIGHT - 14} textAnchor="middle" fill="var(--muted)" fontSize={12}>
              {reportLabel(r).slice(0, 14)}
            </text>
          ) : null,
        )}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--subtle)" strokeDasharray="3 3" />
        )}
        {SERIES.map((s) => (
          <g key={s.key}>
            {n > 1 && (
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={reports.map((r, i) => `${x(i)},${y(value(r, s.key))}`).join(" ")}
              />
            )}
            {reports.map((r, i) => (
              <circle
                key={r.name}
                cx={x(i)}
                cy={y(value(r, s.key))}
                r={hover === i ? 6 : 4.5}
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth={2}
              />
            ))}
          </g>
        ))}
        {endLabels.map((l) => (
          <text key={l.key} x={x(n - 1) + 12} y={l.y} dy="0.32em" fill="var(--fg)" fontSize={12}>
            {l.label} {Math.round(value(last, l.key) * 100)}%
          </text>
        ))}
        <rect
          x={PAD.left - 10}
          y={PAD.top}
          width={plotW + 20}
          height={plotH}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-48 rounded-md border border-line bg-surface px-3 py-2.5 text-sm shadow-lg"
          style={{
            left: Math.min(x(hover) + 12, width - 210),
            top: PAD.top,
          }}
        >
          <p className="mb-1.5 font-semibold text-fg">{reportLabel(reports[hover])}</p>
          {SERIES.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-4 text-muted">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <b className="font-mono text-fg">{Math.round(value(reports[hover], s.key) * 100)}%</b>
            </p>
          ))}
          <p className="mt-1 text-subtle">
            LLM: {reports[hover].provider ?? "?"} · {reports[hover].summary.cases} case
          </p>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-2">
            <span className="h-0.5 w-5 rounded" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
