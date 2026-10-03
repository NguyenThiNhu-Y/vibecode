import { CONFIDENCE_LABELS, PATTERN_LABELS, PATTERN_TAGLINES } from "../labels";
import type { Confidence, PatternResult } from "../types";
import { IconSparkles, IconX } from "./icons";
import { Badge, Callout, Card } from "./ui";

const CONFIDENCE_TONE: Record<Confidence, "danger" | "warning" | "success"> = { low: "danger", medium: "warning", high: "success" };

export default function PatternCard({ data }: { data: PatternResult }) {
  const noAi = data.pattern === "no_ai_rule_based";
  return (
    <Card step="pattern" title="Hướng giải pháp" actions={<Badge tone={CONFIDENCE_TONE[data.confidence]}>{CONFIDENCE_LABELS[data.confidence]}</Badge>}>
      {noAi && (
        <div className="mb-3">
          <Callout tone="success" icon={<IconSparkles className="text-success" />}>
            <b>Không cần AI cho bài toán này.</b> Một giải pháp quy tắc / script sẽ rẻ hơn, nhanh hơn và chính xác hơn.
          </Callout>
        </div>
      )}
      <p className="text-lg font-semibold text-accent-strong">{PATTERN_LABELS[data.pattern]}</p>
      <p className="text-sm text-subtle">{PATTERN_TAGLINES[data.pattern]}</p>
      <p className="mt-3 leading-relaxed text-fg">{data.rationale}</p>

      {data.rejected.length > 0 && (
        <>
          <h3 className="mt-4 mb-1.5 text-sm font-semibold text-muted">Đã cân nhắc và loại</h3>
          <ul className="divide-y divide-line rounded-md border border-line">
            {data.rejected.map((r) => (
              <li key={r.pattern} className="grid gap-1 px-3 py-2 sm:grid-cols-[220px_1fr] sm:gap-4">
                <span className="flex items-center gap-1.5 text-subtle line-through">
                  <IconX className="shrink-0 text-danger no-underline" />
                  {PATTERN_LABELS[r.pattern]}
                </span>
                <span className="text-muted">{r.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {data.assumptions.length > 0 && (
        <>
          <h3 className="mt-4 mb-1.5 text-sm font-semibold text-muted">Giả định</h3>
          <ul className="list-disc space-y-0.5 pl-5 text-fg">
            {data.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
