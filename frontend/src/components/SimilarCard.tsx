import { Link } from "react-router-dom";
import { DEAL_STAGE_LABELS, DEAL_STAGE_TONE, PATTERN_LABELS, formatMoney } from "../labels";
import type { SimilarRun } from "../types";
import { IconHistory } from "./icons";
import { Badge, Panel } from "./ui";

export default function SimilarCard({ items }: { items: SimilarRun[] }) {
  if (!items.length) return null;
  return (
    <Panel icon={<IconHistory />} title="Hồ sơ tương tự đã làm" subtitle="Tái sử dụng proposal, báo giá và bài học từ các hồ sơ cũ." bodyClassName="p-0">
      <ul className="divide-y divide-line">
        {items.map((s) => (
          <li key={s.id}>
            <Link to={`/runs/${s.id}`} className="grid gap-1 px-4 py-2.5 hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
              <span className="min-w-0">
                <span className="font-medium text-fg">{s.project_name || `#${s.id}`}</span>
                <span className="ml-2 text-sm text-subtle">{s.business_goal}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5 text-sm">
                {s.pattern && <Badge tone="accent">{PATTERN_LABELS[s.pattern].split(" –")[0]}</Badge>}
                <Badge tone={DEAL_STAGE_TONE[s.deal_stage]}>{DEAL_STAGE_LABELS[s.deal_stage]}</Badge>
                {s.quote_total !== null && s.quote_currency && <span className="text-muted tabular-nums">{formatMoney(s.quote_total, s.quote_currency)}</span>}
                <span className="text-subtle tabular-nums">{Math.round(s.score * 100)}% giống</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
