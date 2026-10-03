import type { ReactNode } from "react";
import {
  CONFIDENCE_LABELS,
  COVERAGE_LABELS,
  COVERAGE_TONE,
  GO_LABELS,
  PATTERN_LABELS,
  PHASE_LABELS,
  RISK_LABELS,
  formatMoney,
} from "../labels";
import type { Coverage, Quotation, Schedule, StepResults } from "../types";
import { severityTone, ScoreBar } from "./FeasibilityCard";
import { IconChevronRight, IconPause, IconSparkles } from "./icons";
import { Badge, Callout, Panel } from "./ui";

export type TabKey = "overview" | "input" | "solution" | "plan" | "requirements" | "proposal" | "process";

function Tile({ title, tab, onOpen, children }: { title: string; tab: TabKey; onOpen: (t: TabKey) => void; children: ReactNode }) {
  return (
    <Panel
      title={title}
      actions={
        <button type="button" onClick={() => onOpen(tab)} className="inline-flex items-center gap-0.5 text-sm text-subtle hover:text-fg">
          Chi tiết <IconChevronRight />
        </button>
      }
    >
      {children}
    </Panel>
  );
}

const Pending = ({ children = "Đang chờ agent…" }: { children?: ReactNode }) => <p className="text-subtle">{children}</p>;

export default function OverviewTab({
  results,
  quotation,
  schedule,
  waiting,
  onOpen,
}: {
  results: Partial<StepResults>;
  quotation: Quotation | null;
  schedule: Schedule | null;
  waiting: boolean;
  onOpen: (tab: TabKey) => void;
}) {
  const { intake, gaps, pattern, feasibility, architecture, wbs, requirements } = results;
  const blocking = gaps?.questions.filter((q) => q.blocking).length ?? 0;
  const counts = requirements && !requirements.skipped
    ? (["full", "partial", "not_supported", "needs_clarification"] as Coverage[]).map((c) => [c, requirements.items.filter((i) => i.coverage === c).length] as const)
    : null;

  return (
    <div className="space-y-4">
      {waiting && gaps && (
        <Callout tone="warning" icon={<IconPause className="text-warning" />}>
          Agent đang chờ khách trả lời <b>{blocking} câu hỏi bắt buộc</b>.{" "}
          <button type="button" onClick={() => onOpen("input")} className="font-semibold text-accent-strong underline underline-offset-2">
            Trả lời hoặc gửi câu hỏi cho khách
          </button>
        </Callout>
      )}
      {pattern?.pattern === "no_ai_rule_based" && (
        <Callout tone="success" icon={<IconSparkles className="text-success" />}>
          <b>Không cần AI cho bài toán này.</b> Một giải pháp quy tắc / script sẽ rẻ hơn, nhanh hơn và chính xác hơn.
        </Callout>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Tile title="Mục tiêu của khách" tab="input" onOpen={onOpen}>
          {intake ? (
            <>
              <p className="text-fg">{intake.business_goal}</p>
              {intake.constraints.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1">
                  {intake.constraints.map((c) => (
                    <Badge key={c}>{c}</Badge>
                  ))}
                </p>
              )}
            </>
          ) : (
            <Pending />
          )}
        </Tile>

        <Tile title="Hướng giải pháp" tab="solution" onOpen={onOpen}>
          {pattern ? (
            <>
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-accent-strong">{PATTERN_LABELS[pattern.pattern]}</span>
                <Badge>Tự tin: {CONFIDENCE_LABELS[pattern.confidence].replace("Độ tự tin ", "")}</Badge>
              </p>
              <p className="mt-1 line-clamp-3 text-muted">{pattern.rationale}</p>
            </>
          ) : (
            <Pending />
          )}
        </Tile>

        <Tile title="Khả thi" tab="solution" onOpen={onOpen}>
          {feasibility ? (
            <>
              <div className="mb-3">
                <Badge tone={feasibility.go_recommendation === "go" ? "success" : feasibility.go_recommendation === "not_now" ? "danger" : "warning"}>
                  {GO_LABELS[feasibility.go_recommendation]}
                </Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <ScoreBar label="Dữ liệu" value={feasibility.data_readiness} />
                <ScoreBar label="Kỹ thuật" value={feasibility.technical_feasibility} />
                <ScoreBar label="Giá trị" value={feasibility.business_value} />
              </div>
            </>
          ) : (
            <Pending />
          )}
        </Tile>

        <Tile title="Rủi ro lớn nhất" tab="solution" onOpen={onOpen}>
          {feasibility ? (
            <ul className="space-y-1.5">
              {feasibility.risks.slice(0, 3).map((r, i) => (
                <li key={i} className="flex gap-2">
                  <Badge tone={severityTone(r.severity)}>{r.severity}</Badge>
                  <span className="text-fg">
                    {r.description} <span className="text-sm text-subtle">· {RISK_LABELS[r.category]}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Pending />
          )}
        </Tile>

        <Tile title="Effort & kế hoạch" tab="plan" onOpen={onOpen}>
          {architecture ? (
            <>
              <table className="w-full text-left">
                <tbody className="divide-y divide-line">
                  {architecture.estimates.map((e) => (
                    <tr key={e.phase}>
                      <td className="py-1 text-muted">{PHASE_LABELS[e.phase]}</td>
                      <td className="py-1 text-right font-medium text-fg tabular-nums">
                        {e.min_person_days}–{e.max_person_days} ngày công
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {wbs && schedule && (
                <p className="mt-2 text-sm text-subtle">
                  WBS {wbs.tasks.length} đầu việc · timeline khoảng {Math.ceil(schedule.total_days / 5)} tuần
                </p>
              )}
            </>
          ) : (
            <Pending />
          )}
        </Tile>

        <Tile title="Báo giá sơ bộ" tab="plan" onOpen={onOpen}>
          {quotation ? (
            <>
              <p className="text-xl font-semibold text-fg tabular-nums">{formatMoney(quotation.total, quotation.currency)}</p>
              <p className="text-sm text-subtle tabular-nums">
                Khoảng {formatMoney(quotation.total_min, quotation.currency)} – {formatMoney(quotation.total_max, quotation.currency)} · dự phòng {quotation.contingency_pct}%
                {quotation.monthly_run_cost !== null && <> · vận hành {formatMoney(quotation.monthly_run_cost, quotation.currency)}/tháng</>}
              </p>
            </>
          ) : (
            <Pending>{pattern?.pattern === "needs_clarification" ? "Chưa tính được báo giá khi hướng giải pháp chưa rõ." : "Đang chờ WBS…"}</Pending>
          )}
        </Tile>

        <Tile title="Đáp ứng yêu cầu" tab="requirements" onOpen={onOpen}>
          {counts ? (
            <p className="flex flex-wrap gap-1.5">
              {counts.map(([c, n]) => (
                <Badge key={c} tone={COVERAGE_TONE[c]}>
                  {COVERAGE_LABELS[c]}: {n}
                </Badge>
              ))}
            </p>
          ) : requirements?.skipped ? (
            <Pending>Không có file requirement của khách.</Pending>
          ) : (
            <Pending />
          )}
        </Tile>

        <Tile title="Câu hỏi cần khách xác nhận" tab="input" onOpen={onOpen}>
          {gaps ? (
            gaps.questions.length ? (
              <ol className="list-decimal space-y-0.5 pl-5 text-fg">
                {gaps.questions.slice(0, 3).map((q) => (
                  <li key={q.id}>
                    {q.question} {q.blocking && <Badge tone="danger">Bắt buộc</Badge>}
                  </li>
                ))}
                {gaps.questions.length > 3 && <li className="list-none text-sm text-subtle">… và {gaps.questions.length - 3} câu khác</li>}
              </ol>
            ) : (
              <Pending>Không có câu hỏi nào.</Pending>
            )
          ) : (
            <Pending />
          )}
        </Tile>
      </div>
    </div>
  );
}
