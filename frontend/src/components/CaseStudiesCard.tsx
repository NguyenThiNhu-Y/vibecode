import { MARKET_LABELS, PATTERN_LABELS } from "../labels";
import type { CaseStudyMatch } from "../types";
import { IconBulb } from "./icons";
import { Badge, Panel } from "./ui";

export default function CaseStudiesCard({ items }: { items: CaseStudyMatch[] }) {
  if (!items.length) return null;
  return (
    <Panel
      icon={<IconBulb />}
      title="Case study đưa vào hồ sơ"
      subtitle="Chọn tự động từ thư viện case study được phép trình bày (cùng hướng giải pháp, thị trường, ngành). Có trong slide và file Word."
      bodyClassName="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3"
    >
      {items.map((cs) => (
        <article key={cs.id} className="flex flex-col rounded-md border border-line p-3">
          <h3 className="font-semibold text-fg">{cs.title}</h3>
          <p className="mt-0.5 text-sm text-subtle">
            {[cs.industry, MARKET_LABELS[cs.market], cs.year, cs.duration].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="accent">{PATTERN_LABELS[cs.pattern].split(" –")[0]}</Badge>
            {cs.reasons.map((r) => (
              <Badge key={r}>{r}</Badge>
            ))}
          </div>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted">
            {cs.results.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="mt-auto pt-2 text-xs text-subtle tabular-nums">Độ phù hợp {Math.round(cs.score * 100)}%</p>
        </article>
      ))}
    </Panel>
  );
}
