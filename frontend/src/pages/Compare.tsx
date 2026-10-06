import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getRun } from "../api";
import { IconArrowLeft } from "../components/icons";
import { ErrorBox, Spinner, StatusPill, buttonClass } from "../components/ui";
import {
  CONFIDENCE_LABELS,
  DEAL_STAGE_LABELS,
  DEPLOYMENT_LABELS,
  GO_LABELS,
  PATTERN_LABELS,
  PHASE_LABELS,
  formatDateTime,
  formatMoney,
} from "../labels";
import type { Phase, ScopingRun } from "../types";

interface Row {
  label: string;
  value: (run: ScopingRun) => string;
  render?: (run: ScopingRun) => ReactNode;
}

const effort = (run: ScopingRun, phase: Phase) => {
  const e = run.architecture?.estimates.find((x) => x.phase === phase);
  return e ? `${e.min_person_days}–${e.max_person_days} ngày công` : "—";
};

const ROWS: Row[] = [
  { label: "Dự án", value: (r) => r.project_name ?? "—" },
  { label: "Khách hàng", value: (r) => r.client_name ?? "—" },
  { label: "Giai đoạn deal", value: (r) => DEAL_STAGE_LABELS[r.deal_stage] },
  { label: "Trạng thái", value: (r) => r.status, render: (r) => <StatusPill status={r.status} /> },
  { label: "Thời gian tạo", value: (r) => formatDateTime(r.created_at) },
  { label: "Mục tiêu", value: (r) => r.intake?.business_goal ?? "—" },
  { label: "Ràng buộc", value: (r) => r.intake?.constraints.join(", ") || "—" },
  {
    label: "Câu hỏi làm rõ",
    value: (r) =>
      r.gaps
        ? `${r.gaps.questions.length} câu (${r.gaps.questions.filter((q) => q.blocking).length} bắt buộc)`
        : "—",
  },
  { label: "Hướng giải pháp", value: (r) => (r.pattern ? PATTERN_LABELS[r.pattern.pattern] : "—") },
  { label: "Độ tự tin", value: (r) => (r.pattern ? CONFIDENCE_LABELS[r.pattern.confidence] : "—") },
  {
    label: "Điểm khả thi (dữ liệu / kỹ thuật / giá trị)",
    value: (r) =>
      r.feasibility
        ? `${r.feasibility.data_readiness} / ${r.feasibility.technical_feasibility} / ${r.feasibility.business_value}`
        : "—",
  },
  { label: "Khuyến nghị", value: (r) => (r.feasibility ? GO_LABELS[r.feasibility.go_recommendation] : "—") },
  {
    label: "Rủi ro cao nhất",
    value: (r) => {
      const top = r.feasibility?.risks[0];
      return top ? `Mức ${top.severity}: ${top.description}` : "—";
    },
  },
  {
    label: "Triển khai",
    value: (r) => (r.architecture ? DEPLOYMENT_LABELS[r.architecture.deployment] : "—"),
  },
  ...(["poc", "mvp", "production"] as Phase[]).map((phase) => ({
    label: `Effort ${PHASE_LABELS[phase]}`,
    value: (r: ScopingRun) => effort(r, phase),
  })),
  {
    label: "WBS",
    value: (r) =>
      r.wbs
        ? `${r.wbs.items.filter((i) => i.level === 2).length} task · ${r.wbs.totals.reduce((s, t) => s + t.total_md, 0)} man-day`
        : "—",
  },
  {
    label: "Timeline",
    value: (r) => (r.schedule ? `${r.schedule.phases.reduce((s, p) => s + p.working_days, 0)} ngày làm việc` : "—"),
  },
  {
    label: "Báo giá sơ bộ",
    value: (r) =>
      r.quotation
        ? `${formatMoney(r.quotation.total, r.quotation.currency)} (${formatMoney(r.quotation.total_min, r.quotation.currency)} – ${formatMoney(r.quotation.total_max, r.quotation.currency)})`
        : "—",
  },
  {
    label: "Đáp ứng yêu cầu",
    value: (r) => {
      if (!r.requirements || r.requirements.skipped) return "—";
      const full = r.requirements.items.filter((i) => i.coverage === "full").length;
      return `${full}/${r.requirements.items.length} đáp ứng đầy đủ`;
    },
  },
  {
    label: "Tài liệu đính kèm",
    value: (r) => (r.attachments?.length ? r.attachments.map((a) => a.filename).join(", ") : "—"),
  },
  {
    label: "Thời gian chạy",
    value: (r) =>
      `${(Object.values(r.step_latency_ms).reduce((a, b) => a + b, 0) / 1000).toFixed(1)}s`,
  },
];

export default function Compare() {
  const [params] = useSearchParams();
  const ids = [params.get("a"), params.get("b")].filter((x): x is string => Boolean(x));
  const [runs, setRuns] = useState<ScopingRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length !== 2) {
      setError("Cần chọn đúng 2 phiên để so sánh.");
      return;
    }
    Promise.all(ids.map(getRun))
      .then(setRuns)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được dữ liệu."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link to="/history" className="mb-4 inline-flex items-center gap-1.5 text-muted hover:text-fg">
        <IconArrowLeft />
        Lịch sử
      </Link>
      <h1 className="mb-4 text-xl font-semibold text-fg">So sánh 2 hồ sơ</h1>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!runs && !error && (
        <p className="flex items-center gap-2 text-muted">
          <Spinner /> Đang tải…
        </p>
      )}
      {runs && (
        <div className="rounded-lg border border-line bg-surface overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="w-56 px-4 py-2.5 text-sm font-medium text-subtle">
                  Tiêu chí
                </th>
                {runs.map((r) => (
                  <th key={r.id} className="px-4 py-2.5">
                    <Link to={`/runs/${r.id}`} className="font-mono text-accent-strong hover:underline">
                      #{r.id}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const differs = row.value(runs[0]) !== row.value(runs[1]);
                return (
                  <tr key={row.label} className="border-b border-line/60 align-top last:border-0">
                    <th className="px-4 py-2.5 font-medium text-muted">
                      {row.label}
                      {differs && (
                        <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs font-semibold text-accent-strong">
                          khác
                        </span>
                      )}
                    </th>
                    {runs.map((r) => (
                      <td key={r.id} className={`px-4 py-2.5 ${differs ? "text-fg" : "text-muted"}`}>
                        {row.render ? row.render(r) : row.value(r)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4">
        <Link to="/history" className={buttonClass.secondary}>
          Chọn phiên khác
        </Link>
      </div>
    </main>
  );
}
