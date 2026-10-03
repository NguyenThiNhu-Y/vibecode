import { DEPLOYMENT_LABELS, PATTERN_LABELS, PHASE_LABELS } from "../labels";
import type { ArchitectureResult, EffortBasis } from "../types";
import { IconBolt } from "./icons";
import MermaidDiagram from "./MermaidDiagram";
import { Badge, Card } from "./ui";

const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

function Formula({ basis }: { basis: EffortBasis }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-md bg-warning-soft px-3 py-2 text-sm text-fg">
      <IconBolt className="text-warning" />
      <span className="font-medium">Công thức tính effort gốc (bằng code, không phải LLM):</span>
      <span>Bảng chuẩn {PATTERN_LABELS[basis.pattern].split(" –")[0]}</span>
      {basis.multipliers.length === 0 && <span className="text-muted">× 1 (không có hệ số điều chỉnh)</span>}
      {basis.multipliers.map((m) => (
        <span key={m.key}>
          × <b className="font-mono">{fmt(m.factor)}</b> <span className="text-muted">{m.label}</span>
        </span>
      ))}
      {basis.multipliers.length > 1 && (
        <span>
          = <b className="font-mono">× {fmt(basis.factor)}</b>
        </span>
      )}
    </div>
  );
}

export default function ArchitectureCard({ data, basis }: { data: ArchitectureResult; basis: EffortBasis | null }) {
  return (
    <Card step="architecture" title="Kiến trúc & effort" actions={<Badge>Triển khai: {DEPLOYMENT_LABELS[data.deployment]}</Badge>}>
      {data.mermaid && (
        <div className="mb-4">
          <MermaidDiagram code={data.mermaid} />
        </div>
      )}

      <h3 className="mb-1.5 text-sm font-semibold text-muted">Thành phần</h3>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <tbody className="divide-y divide-line">
            {data.components.map((c) => (
              <tr key={c.name} className="align-top">
                <td className="w-48 px-3 py-2 font-medium text-fg">{c.name}</td>
                <td className="px-3 py-2 text-muted">{c.purpose}</td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap gap-1">
                    {c.tech_options.map((t) => (
                      <code key={t} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-sm text-muted">
                        {t}
                      </code>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-4 mb-1.5 text-sm font-semibold text-muted">Effort theo giai đoạn</h3>
      {basis && <Formula basis={basis} />}
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead className="bg-surface-2 text-sm text-subtle">
            <tr>
              <th className="px-3 py-2 font-medium">Giai đoạn</th>
              <th className="px-3 py-2 font-medium">Ngày công</th>
              <th className="px-3 py-2 font-medium">Đội ngũ</th>
              <th className="px-3 py-2 font-medium">Bàn giao</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.estimates.map((e) => {
              const computed = basis?.computed[e.phase];
              const adjusted = computed && (computed[0] !== e.min_person_days || computed[1] !== e.max_person_days);
              return (
                <tr key={e.phase} className="align-top">
                  <td className="px-3 py-2 font-medium text-fg">{PHASE_LABELS[e.phase]}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <b className="text-fg tabular-nums">
                      {e.min_person_days}–{e.max_person_days}
                    </b>
                    {computed && (
                      <span className="block text-sm text-subtle tabular-nums">
                        gốc {computed[0]}–{computed[1]}
                        {adjusted && <span className="text-warning"> · đã điều chỉnh</span>}
                      </span>
                    )}
                    {e.adjustment_note && <span className="block max-w-56 text-sm whitespace-normal text-warning">{e.adjustment_note}</span>}
                  </td>
                  <td className="px-3 py-2 text-muted">{e.team.join(", ")}</td>
                  <td className="px-3 py-2 text-muted">{e.deliverables.join("; ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.reference_projects.length > 0 && (
        <p className="mt-3 text-sm text-subtle">
          Dự án tham chiếu: <span className="font-mono text-muted">{data.reference_projects.join(", ")}</span>
        </p>
      )}
    </Card>
  );
}
