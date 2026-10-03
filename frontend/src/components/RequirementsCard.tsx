import { useState } from "react";
import { COVERAGE_LABELS, COVERAGE_TONE } from "../labels";
import type { Coverage, RequirementItem, RequirementMatrix } from "../types";
import { Badge, Card, TONE } from "./ui";

const ORDER: Coverage[] = ["full", "partial", "not_supported", "needs_clarification"];

export default function RequirementsCard({ data, requirements }: { data: RequirementMatrix; requirements: RequirementItem[] }) {
  const [filter, setFilter] = useState<Coverage | "all">("all");
  if (data.skipped) {
    return (
      <Card step="requirements" title="Đáp ứng yêu cầu">
        <p className="text-muted">Khách chưa gửi file danh sách requirement (Excel/CSV), nên bước này được bỏ qua. Đính kèm file khi tạo hồ sơ để có bảng đáp ứng từng dòng.</p>
      </Card>
    );
  }
  const texts = Object.fromEntries(requirements.map((r) => [r.id, r]));
  const counts = Object.fromEntries(ORDER.map((c) => [c, data.items.filter((i) => i.coverage === c).length])) as Record<Coverage, number>;
  const shown = data.items.filter((i) => filter === "all" || i.coverage === filter);

  return (
    <Card
      step="requirements"
      title="Đáp ứng yêu cầu"
      subtitle={`${data.items.length} requirement · code kiểm tra không bỏ sót dòng nào`}
    >
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo mức đáp ứng">
        <button
          type="button"
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
          className={`rounded-md px-2.5 py-1 text-sm font-medium ${filter === "all" ? "bg-fg text-surface" : "bg-surface-2 text-muted hover:text-fg"}`}
        >
          Tất cả {data.items.length}
        </button>
        {ORDER.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={filter === c}
            onClick={() => setFilter(filter === c ? "all" : c)}
            className={`rounded-md px-2.5 py-1 text-sm font-medium ${TONE[COVERAGE_TONE[c]]} ${filter === c ? "ring-2 ring-current" : ""}`}
          >
            {COVERAGE_LABELS[c]} {counts[c]}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead className="bg-surface-2 text-sm text-subtle">
            <tr>
              <th className="px-3 py-2 font-medium">Mã</th>
              <th className="px-3 py-2 font-medium">Yêu cầu của khách</th>
              <th className="px-3 py-2 font-medium">Mức đáp ứng</th>
              <th className="px-3 py-2 font-medium">Ghi chú</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((item) => {
              const req = texts[item.req_id];
              return (
                <tr key={item.req_id} className="align-top">
                  <td className="px-3 py-2 font-mono text-sm text-subtle">{item.req_id}</td>
                  <td className="px-3 py-2 text-fg">
                    {req?.text ?? "—"}
                    {(req?.priority || req?.category) && (
                      <span className="block text-sm text-subtle">{[req.category, req.priority].filter(Boolean).join(" · ")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={COVERAGE_TONE[item.coverage]}>{COVERAGE_LABELS[item.coverage]}</Badge>
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {item.note}
                    {item.component && <span className="block text-sm text-subtle">→ {item.component}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
