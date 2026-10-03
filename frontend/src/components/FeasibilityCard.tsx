import { GO_LABELS, RISK_LABELS } from "../labels";
import type { FeasibilityResult, GoRecommendation } from "../types";
import { Badge, Card } from "./ui";

const GO_TONE: Record<GoRecommendation, "success" | "warning" | "danger"> = { go: "success", go_with_poc: "warning", not_now: "danger" };

export function severityTone(severity: number): "danger" | "warning" | "success" {
  return severity >= 4 ? "danger" : severity === 3 ? "warning" : "success";
}

export function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-semibold text-fg tabular-nums">{value}/5</span>
      </div>
      <div className="flex gap-0.5" role="meter" aria-label={label} aria-valuemin={1} aria-valuemax={5} aria-valuenow={value}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-sm ${i <= value ? "bg-accent" : "bg-surface-2"}`} />
        ))}
      </div>
    </div>
  );
}

export default function FeasibilityCard({ data }: { data: FeasibilityResult }) {
  return (
    <Card step="feasibility" title="Khả thi & rủi ro" actions={<Badge tone={GO_TONE[data.go_recommendation]}>{GO_LABELS[data.go_recommendation]}</Badge>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <ScoreBar label="Sẵn sàng dữ liệu" value={data.data_readiness} />
        <ScoreBar label="Khả thi kỹ thuật" value={data.technical_feasibility} />
        <ScoreBar label="Giá trị kinh doanh" value={data.business_value} />
      </div>
      <div className="mt-4 overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead className="bg-surface-2 text-sm text-subtle">
            <tr>
              <th className="px-3 py-2 font-medium">Mức</th>
              <th className="px-3 py-2 font-medium">Loại</th>
              <th className="px-3 py-2 font-medium">Rủi ro</th>
              <th className="px-3 py-2 font-medium">Giảm thiểu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.risks.map((risk, i) => (
              <tr key={i} className="align-top">
                <td className="px-3 py-2">
                  <Badge tone={severityTone(risk.severity)}>{risk.severity}/5</Badge>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted">{RISK_LABELS[risk.category]}</td>
                <td className="px-3 py-2 text-fg">{risk.description}</td>
                <td className="px-3 py-2 text-muted">{risk.mitigation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
