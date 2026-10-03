import { useState } from "react";
import { PHASE_LABELS } from "../labels";
import type { ArchitectureResult, Phase, Schedule, WBSResult } from "../types";
import { Badge, Card } from "./ui";

const PHASES: Phase[] = ["poc", "mvp", "production"];
const PHASE_COLOR: Record<Phase, string> = { poc: "var(--phase-poc)", mvp: "var(--phase-mvp)", production: "var(--phase-production)" };

function Gantt({ wbs, schedule }: { wbs: WBSResult; schedule: Schedule }) {
  const [hover, setHover] = useState<string | null>(null);
  const weeks = Math.max(1, Math.ceil(schedule.total_days / 5));
  const byId = Object.fromEntries(schedule.tasks.map((t) => [t.id, t]));
  const pct = (day: number) => (day / (weeks * 5)) * 100;
  const step = Math.max(1, Math.ceil(weeks / 16));
  const hovered = wbs.tasks.find((t) => t.id === hover);

  return (
    <div className="relative">
      <div className="mb-1 grid grid-cols-[minmax(0,15rem)_1fr] gap-3 text-xs text-subtle">
        <span />
        <div className="relative h-4">
          {Array.from({ length: Math.ceil(weeks / step) }, (_, i) => i * step).map((w) => (
            <span key={w} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${pct(w * 5)}%` }}>
              T{w + 1}
            </span>
          ))}
        </div>
      </div>
      <ul onMouseLeave={() => setHover(null)}>
        {wbs.tasks.map((task) => {
          const s = byId[task.id];
          if (!s) return null;
          return (
            <li key={task.id} className="grid grid-cols-[minmax(0,15rem)_1fr] items-center gap-3 border-t border-line/60 py-1">
              <span className="truncate text-sm text-muted" title={task.name}>
                <span className="font-mono text-subtle">{task.id}</span> {task.name}
              </span>
              <div className="relative h-4">
                <div
                  onMouseEnter={() => setHover(task.id)}
                  className="bar-grow absolute inset-y-0.5 rounded-sm"
                  style={{
                    left: `${pct(s.start_day)}%`,
                    width: `max(4px, ${pct(s.end_day - s.start_day)}%)`,
                    background: PHASE_COLOR[task.phase],
                    opacity: hover && hover !== task.id ? 0.4 : 1,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {hovered && byId[hovered.id] && (
        <div className="pointer-events-none absolute top-0 right-0 z-10 w-64 rounded-md border border-line bg-surface p-3 text-sm shadow-lg">
          <p className="font-semibold text-fg">
            {hovered.id} · {hovered.name}
          </p>
          <p className="mt-1 text-muted">
            {PHASE_LABELS[hovered.phase]} · {hovered.role} · <b className="text-fg">{hovered.person_days} ngày công</b>
          </p>
          <p className="text-muted">
            Ngày {byId[hovered.id].start_day + 1}–{byId[hovered.id].end_day} (tuần {Math.floor(byId[hovered.id].start_day / 5) + 1}–
            {Math.floor((byId[hovered.id].end_day - 1) / 5) + 1})
          </p>
          {hovered.depends_on.length > 0 && <p className="text-subtle">Sau: {hovered.depends_on.join(", ")}</p>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted">
        {PHASES.filter((p) => wbs.tasks.some((t) => t.phase === p)).map((p) => (
          <span key={p} className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm" style={{ background: PHASE_COLOR[p] }} />
            {PHASE_LABELS[p]}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function WBSCard({
  data,
  schedule,
  architecture,
}: {
  data: WBSResult;
  schedule: Schedule | null;
  architecture: ArchitectureResult | null;
}) {
  const total = data.tasks.reduce((sum, t) => sum + t.person_days, 0);
  const weeks = schedule ? Math.ceil(schedule.total_days / 5) : null;
  return (
    <Card step="wbs" title="WBS & timeline" subtitle={`${data.tasks.length} đầu việc · ${total} ngày công${weeks ? ` · khoảng ${weeks} tuần` : ""}`}>
      <div className="mb-4 flex flex-wrap gap-2">
        {PHASES.map((phase) => {
          const tasks = data.tasks.filter((t) => t.phase === phase);
          if (!tasks.length) return null;
          const sum = tasks.reduce((s, t) => s + t.person_days, 0);
          const est = architecture?.estimates.find((e) => e.phase === phase);
          const ok = est ? sum >= est.min_person_days && sum <= est.max_person_days : true;
          return (
            <Badge key={phase} tone={ok ? "success" : "warning"}>
              {PHASE_LABELS[phase]}: {sum} ngày công {est && (ok ? `✓ khớp ${est.min_person_days}–${est.max_person_days}` : "!")}
            </Badge>
          );
        })}
        <span className="text-sm text-subtle">Tổng ngày công mỗi giai đoạn được code đối chiếu với effort.</span>
      </div>

      {schedule && <Gantt wbs={data} schedule={schedule} />}

      <details className="mt-4 rounded-md border border-line">
        <summary className="cursor-pointer px-3 py-2 font-medium text-fg">Bảng WBS chi tiết</summary>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead className="bg-surface-2 text-sm text-subtle">
              <tr>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Giai đoạn</th>
                <th className="px-3 py-2 font-medium">Đầu việc</th>
                <th className="px-3 py-2 font-medium">Vai trò</th>
                <th className="px-3 py-2 text-right font-medium">Ngày công</th>
                <th className="px-3 py-2 font-medium">Phụ thuộc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.tasks.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-1.5 font-mono text-subtle">{t.id}</td>
                  <td className="px-3 py-1.5 text-muted">{PHASE_LABELS[t.phase]}</td>
                  <td className="px-3 py-1.5 text-fg">{t.name}</td>
                  <td className="px-3 py-1.5 text-muted">{t.role}</td>
                  <td className="px-3 py-1.5 text-right text-fg tabular-nums">{t.person_days}</td>
                  <td className="px-3 py-1.5 font-mono text-sm text-subtle">{t.depends_on.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
