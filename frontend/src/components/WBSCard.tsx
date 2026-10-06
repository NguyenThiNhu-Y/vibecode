import { useMemo, useState } from "react";
import { downloadUrl } from "../api";
import { PHASE_LABELS } from "../labels";
import type { Phase, Priority, ScheduleConfig, ScheduleResult, WbsItem, WbsResult, WorkType } from "../types";
import { input } from "./form";
import { IconChevronRight, IconDownload, IconRefresh } from "./icons";
import { Badge, Card, ErrorBox, Spinner, buttonClass } from "./ui";

const PHASES: Phase[] = ["poc", "mvp", "production"];
const PHASE_COLOR: Record<Phase, string> = { poc: "var(--phase-poc)", mvp: "var(--phase-mvp)", production: "var(--phase-production)" };
const TYPES: WorkType[] = ["PM", "BA", "DATA", "AI", "BE", "FE", "DESIGN", "INFRA", "QA"];
const TYPE_LABEL: Record<WorkType, string> = {
  PM: "PM",
  BA: "BA",
  DATA: "Data",
  AI: "AI",
  BE: "Backend",
  FE: "Frontend",
  DESIGN: "Thiết kế",
  INFRA: "Hạ tầng",
  QA: "QA",
};
const TYPE_COLOR: Record<WorkType, string> = {
  PM: "#6366f1",
  BA: "#0ea5e9",
  DATA: "#10b981",
  AI: "#f26f21",
  BE: "#8b5cf6",
  FE: "#ec4899",
  DESIGN: "#f59e0b",
  INFRA: "#64748b",
  QA: "#ef4444",
};
const PRIORITY_LABEL: Record<Priority, string> = { high: "Cao", mid: "Vừa", low: "Thấp" };
const DAY = 86_400_000;

const md = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("vi-VN", { maximumFractionDigits: 2 }));
const day = (iso: string) => new Date(`${iso}T00:00:00`);
const ddmm = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const ddmmyyyy = (iso: string) => `${ddmm(iso)}/${iso.slice(0, 4)}`;
const monday = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
const parentOf = (id: string) => (id.includes(".") ? id.slice(0, id.lastIndexOf(".")) : null);

function TypeChip({ type }: { type: WorkType }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-fg">
      <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLOR[type] }} />
      {TYPE_LABEL[type]}
    </span>
  );
}

/** Man-days per phase x work type, computed by code (BIDDING_SPEC 3.1). */
function TypeMatrix({ wbs }: { wbs: WbsResult }) {
  const types = TYPES.filter((t) => wbs.totals.some((p) => p.by_type[t]));
  const column = (t: WorkType) => wbs.totals.reduce((s, p) => s + (p.by_type[t] ?? 0), 0);
  const total = wbs.totals.reduce((s, p) => s + p.total_md, 0);
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[560px] border-collapse text-right text-sm tabular-nums">
        <thead className="bg-surface-2 text-subtle">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Man-day</th>
            {types.map((t) => (
              <th key={t} className="px-2 py-2 font-medium">
                <TypeChip type={t} />
              </th>
            ))}
            <th className="px-3 py-2 font-medium">Tổng</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {wbs.totals.map((p) => (
            <tr key={p.phase}>
              <td className="px-3 py-1.5 text-left font-medium text-fg">{PHASE_LABELS[p.phase]}</td>
              {types.map((t) => (
                <td key={t} className="px-2 py-1.5 text-muted">
                  {p.by_type[t] ? md(p.by_type[t]) : "—"}
                </td>
              ))}
              <td className="px-3 py-1.5 font-semibold text-fg">{md(p.total_md)}</td>
            </tr>
          ))}
          <tr className="bg-surface-2/60">
            <td className="px-3 py-1.5 text-left font-semibold text-fg">Tổng</td>
            {types.map((t) => (
              <td key={t} className="px-2 py-1.5 font-medium text-fg">
                {md(column(t))}
              </td>
            ))}
            <td className="px-3 py-1.5 font-semibold text-fg">{md(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Master schedule by week; bars for level-2 tasks, diamonds for milestones. */
function Gantt({ wbs, schedule }: { wbs: WbsResult; schedule: ScheduleResult }) {
  const [hover, setHover] = useState<string | null>(null);
  const items = useMemo(() => Object.fromEntries(wbs.items.map((i) => [i.id, i])), [wbs]);
  const first = monday(day(schedule.phases[0].start));
  const last = [...schedule.phases.map((p) => p.end), ...schedule.milestones.map((m) => m.date)].map(day).reduce((a, b) => (a > b ? a : b));
  const weeks = Math.round((monday(last).getTime() - first.getTime()) / (7 * DAY)) + 1;
  const span = weeks * 7 * DAY;
  const pct = (iso: string, plusDay = false) => ((day(iso).getTime() + (plusDay ? DAY : 0) - first.getTime()) / span) * 100;
  const step = Math.max(1, Math.ceil(weeks / 14));
  const hovered = schedule.tasks.find((t) => t.wbs_id === hover);
  const hoveredItem = hovered ? items[hovered.wbs_id] : null;

  return (
    <div className="relative">
      <div className="mb-1 grid grid-cols-[minmax(0,15rem)_1fr] gap-3 text-xs text-subtle">
        <span />
        <div className="relative h-4">
          {Array.from({ length: Math.ceil(weeks / step) }, (_, i) => i * step).map((w) => {
            const d = new Date(first.getTime() + w * 7 * DAY);
            return (
              <span key={w} className="absolute tabular-nums" style={{ left: `${(w / weeks) * 100}%` }}>
                {String(d.getDate()).padStart(2, "0")}/{String(d.getMonth() + 1).padStart(2, "0")}
              </span>
            );
          })}
        </div>
      </div>
      <ul onMouseLeave={() => setHover(null)}>
        {schedule.tasks.map((task) => {
          const item = items[task.wbs_id];
          if (!item) return null;
          return (
            <li key={task.wbs_id} className="grid grid-cols-[minmax(0,15rem)_1fr] items-center gap-3 border-t border-line/60 py-1">
              <span className="truncate text-sm text-muted" title={item.name}>
                <span className="font-mono text-subtle">{task.wbs_id}</span> {item.name}
              </span>
              <div className="relative h-4">
                <div
                  onMouseEnter={() => setHover(task.wbs_id)}
                  className="bar-grow absolute inset-y-0.5 rounded-sm"
                  style={{
                    left: `${pct(task.start)}%`,
                    width: `max(4px, ${pct(task.end, true) - pct(task.start)}%)`,
                    background: PHASE_COLOR[item.phase],
                    opacity: hover && hover !== task.wbs_id ? 0.4 : 1,
                  }}
                />
              </div>
            </li>
          );
        })}
        <li className="grid grid-cols-[minmax(0,15rem)_1fr] items-center gap-3 border-t border-line py-1.5">
          <span className="text-sm font-medium text-fg">Milestone</span>
          <div className="relative h-9">
            {schedule.milestones.map((m) => (
              <div key={m.id} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${pct(m.date) + 100 / span * DAY / 2}%` }}>
                <span className="h-3 w-3 rotate-45 bg-fg" title={`${m.id} ${m.name} · ${ddmmyyyy(m.date)}`} />
                <span className="mt-1 text-[11px] whitespace-nowrap text-subtle tabular-nums">
                  {m.id}
                  {m.payment_percent ? ` · ${m.payment_percent}%` : ""}
                </span>
              </div>
            ))}
          </div>
        </li>
      </ul>
      {hovered && hoveredItem && (
        <div className="pointer-events-none absolute top-0 right-0 z-10 w-64 rounded-md border border-line bg-surface p-3 text-sm shadow-lg">
          <p className="font-semibold text-fg">
            {hovered.wbs_id} · {hoveredItem.name}
          </p>
          <p className="mt-1 text-muted">
            {PHASE_LABELS[hoveredItem.phase]} · <b className="text-fg">{md(hoveredItem.estimate_md)} man-day</b>
          </p>
          <p className="text-muted tabular-nums">
            {ddmmyyyy(hovered.start)} → {ddmmyyyy(hovered.end)}
          </p>
          {hoveredItem.depends_on.length > 0 && <p className="text-subtle">Sau: {hoveredItem.depends_on.join(", ")}</p>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted">
        {schedule.phases.map((p) => (
          <span key={p.phase} className="flex items-center gap-1.5 tabular-nums">
            <span className="h-2 w-4 rounded-sm" style={{ background: PHASE_COLOR[p.phase] }} />
            {PHASE_LABELS[p.phase]} {ddmm(p.start)}–{ddmm(p.end)} ({p.working_days} ngày)
          </span>
        ))}
      </div>
    </div>
  );
}

function ScheduleForm({
  config,
  types,
  onSubmit,
}: {
  config: ScheduleConfig;
  types: WorkType[];
  onSubmit: (config: ScheduleConfig) => Promise<void>;
}) {
  const [start, setStart] = useState(config.start_date);
  const [buffer, setBuffer] = useState(Math.round(config.buffer_ratio * 100));
  const [headcount, setHeadcount] = useState(config.headcount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ ...config, start_date: start, buffer_ratio: buffer / 100, headcount });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tính lại được lịch.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-line bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-muted">
          Ngày bắt đầu
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={`${input} mt-1 block w-40`} />
        </label>
        <label className="text-sm text-muted">
          Buffer %
          <input
            type="number"
            min={0}
            max={100}
            value={buffer}
            onChange={(e) => setBuffer(Number(e.target.value))}
            className={`${input} mt-1 block w-20 text-right`}
          />
        </label>
        {types.map((t) => (
          <label key={t} className="text-sm text-muted">
            <TypeChip type={t} />
            <input
              type="number"
              min={0}
              max={50}
              value={headcount[t] ?? 1}
              onChange={(e) => setHeadcount((h) => ({ ...h, [t]: Number(e.target.value) }))}
              aria-label={`Số người ${TYPE_LABEL[t]}`}
              className={`${input} mt-1 block w-16 text-right`}
            />
          </label>
        ))}
        <button type="button" disabled={busy || !start} onClick={submit} className={buttonClass.secondary}>
          {busy ? <Spinner /> : <IconRefresh />}
          Tính lại lịch
        </button>
      </div>
      <p className="mt-2 text-xs text-subtle">
        Tính bằng code, không gọi LLM: mỗi task = man-day theo loại ÷ số người; giai đoạn = max(đường găng, tổng man-day ÷ số người) + buffer. Lịch
        sơ bộ, chưa cân bằng nguồn lực từng ngày.
      </p>
      {error && (
        <div className="mt-2">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
    </div>
  );
}

const MAX_LEAF_MD = 10;

/** Collapsible WBS tree with phase tabs and Type / Priority filters. With `onSave`, leaf man-days
 * are editable: parent sums update while typing, the server recomputes everything on save. */
function WbsTree({ wbs, onSave }: { wbs: WbsResult; onSave?: (estimates: Record<string, number>) => Promise<void> }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase | "all">("all");
  const [type, setType] = useState<WorkType | "all">("all");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const parents = useMemo(() => new Set(wbs.items.map((i) => parentOf(i.id)).filter((p): p is string => p !== null)), [wbs]);
  const phases = PHASES.filter((p) => wbs.items.some((i) => i.phase === p));
  const types = TYPES.filter((t) => wbs.items.some((i) => i.type === t));

  const original = useMemo(() => Object.fromEntries(wbs.items.map((i) => [i.id, i.estimate_md ?? 0])), [wbs]);
  const parsed = (id: string): number | null => {
    const raw = draft[id];
    if (raw === undefined) return original[id];
    const value = Number(raw.replace(",", "."));
    return raw.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= MAX_LEAF_MD ? value : null;
  };
  const changed = Object.keys(draft).filter((id) => parsed(id) !== original[id]);
  const invalid = Object.keys(draft).filter((id) => parsed(id) === null);
  // live sums: a parent shows the sum of its (possibly edited) children; ~150 rows, so no memo
  const kids: Record<string, string[]> = {};
  for (const i of wbs.items) {
    const p = parentOf(i.id);
    if (p) (kids[p] ??= []).push(i.id);
  }
  const sums: Record<string, number> = {};
  const sumOf = (id: string): number => {
    if (sums[id] === undefined) {
      const value = kids[id] ? kids[id].reduce((s, c) => s + sumOf(c), 0) : (parsed(id) ?? original[id]);
      sums[id] = Math.round(value * 100) / 100;
    }
    return sums[id];
  };
  wbs.items.forEach((i) => sumOf(i.id));
  const totalBefore = wbs.totals.reduce((s, t) => s + t.total_md, 0);
  const totalAfter = wbs.items.filter((i) => i.level === 1).reduce((s, i) => s + sums[i.id], 0);

  const save = async () => {
    if (!onSave || invalid.length || !changed.length) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(Object.fromEntries(changed.map((id) => [id, parsed(id) as number])));
      setDraft({});
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Không lưu được WBS.");
    } finally {
      setSaving(false);
    }
  };

  const rows = useMemo(() => {
    const inPhase = wbs.items.filter((i) => phase === "all" || i.phase === phase);
    const filtering = type !== "all" || priority !== "all";
    let shown: WbsItem[] = inPhase;
    if (filtering) {
      const keep = new Set<string>();
      for (const i of inPhase) {
        if (parents.has(i.id) || (type !== "all" && i.type !== type) || (priority !== "all" && i.priority !== priority)) continue;
        for (let id: string | null = i.id; id; id = parentOf(id)) keep.add(id);
      }
      shown = inPhase.filter((i) => keep.has(i.id));
    }
    return shown.filter((i) => {
      for (let id = parentOf(i.id); id; id = parentOf(id)) if (collapsed.has(id)) return false;
      return true;
    });
  }, [wbs, phase, type, priority, collapsed, parents]);

  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const select = "rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {(["all", ...phases] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p)}
            className={`rounded-md px-2.5 py-1 text-sm font-medium ${phase === p ? "bg-accent text-white" : "bg-surface-2 text-muted hover:text-fg"}`}
          >
            {p === "all" ? "Tất cả" : PHASE_LABELS[p]}
          </button>
        ))}
        <select value={type} onChange={(e) => setType(e.target.value as WorkType | "all")} className={select} aria-label="Lọc theo loại">
          <option value="all">Mọi loại</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | "all")} className={select} aria-label="Lọc theo ưu tiên">
          <option value="all">Mọi mức ưu tiên</option>
          {(["high", "mid", "low"] as const).map((p) => (
            <option key={p} value={p}>
              Ưu tiên {PRIORITY_LABEL[p].toLowerCase()}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setCollapsed(new Set(wbs.items.filter((i) => i.level === 1).map((i) => i.id)))} className={buttonClass.ghost}>
          Thu gọn
        </button>
        <button type="button" onClick={() => setCollapsed(new Set())} className={buttonClass.ghost}>
          Mở hết
        </button>
      </div>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="bg-surface-2 text-subtle">
            <tr>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-2 py-2 font-medium">Loại</th>
              <th className="px-2 py-2 font-medium">Ưu tiên</th>
              <th className="px-2 py-2 text-right font-medium">Man-day</th>
              <th className="px-2 py-2 font-medium">Sau</th>
              <th className="px-3 py-2 font-medium">Bàn giao</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((i) => {
              const isParent = parents.has(i.id);
              return (
                <tr key={i.id} className={i.level === 1 ? "bg-surface-2/50" : ""}>
                  <td className="px-3 py-1.5" style={{ paddingLeft: `${0.75 + (i.level - 1) * 1.25}rem` }}>
                    <span className="flex items-start gap-1">
                      {isParent ? (
                        <button
                          type="button"
                          onClick={() => toggle(i.id)}
                          aria-label={collapsed.has(i.id) ? "Mở" : "Thu gọn"}
                          className="mt-0.5 shrink-0 text-subtle hover:text-fg"
                        >
                          <IconChevronRight className={`transition-transform ${collapsed.has(i.id) ? "" : "rotate-90"}`} />
                        </button>
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <span className="font-mono text-subtle">{i.id}</span>
                      <span className={i.level === 1 ? "font-semibold text-fg" : "text-fg"}>{i.name}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5">{i.type && !isParent && <TypeChip type={i.type} />}</td>
                  <td className="px-2 py-1.5 text-muted">
                    {!isParent && (i.priority === "high" ? <Badge tone="danger">Cao</Badge> : PRIORITY_LABEL[i.priority])}
                  </td>
                  <td className={`px-2 py-1 text-right tabular-nums ${isParent ? "font-semibold text-fg" : "text-muted"}`}>
                    {isParent || !onSave ? (
                      <span className={isParent && changed.length ? "text-accent-strong" : ""}>{md(isParent ? sums[i.id] : i.estimate_md)}</span>
                    ) : (
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={MAX_LEAF_MD}
                        step={0.5}
                        value={draft[i.id] ?? String(i.estimate_md ?? 0)}
                        onChange={(e) => setDraft((d) => ({ ...d, [i.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") save();
                          if (e.key === "Escape") setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== i.id)));
                        }}
                        aria-label={`Man-day ${i.id}`}
                        aria-invalid={parsed(i.id) === null}
                        className={`w-20 rounded border px-1.5 py-0.5 text-right tabular-nums text-fg focus:outline-none ${
                          parsed(i.id) === null
                            ? "border-danger bg-danger/10"
                            : changed.includes(i.id)
                              ? "border-accent bg-accent/10"
                              : "border-line bg-surface focus:border-accent"
                        }`}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs text-subtle">{i.depends_on.join(", ") || "—"}</td>
                  <td className="max-w-64 truncate px-3 py-1.5 text-muted" title={i.deliverable ?? ""}>
                    {i.deliverable ?? ""}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-center text-subtle">
                  Không có task phù hợp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {onSave && (changed.length > 0 || invalid.length > 0) && (
        <div className="sticky bottom-0 mt-2 flex flex-wrap items-center gap-3 rounded-md border border-accent/40 bg-surface p-3 shadow-sm">
          <span className="text-sm text-fg">
            <b>{changed.length}</b> task đã sửa · tổng{" "}
            <span className="tabular-nums">
              {md(totalBefore)} → <b>{md(totalAfter)}</b> man-day
            </span>
          </span>
          {invalid.length > 0 && <span className="text-sm text-danger">Mỗi task từ 0 đến {MAX_LEAF_MD} man-day; task lớn hơn cần tách nhỏ.</span>}
          <span className="ml-auto flex gap-2">
            <button type="button" disabled={saving} onClick={() => setDraft({})} className={buttonClass.ghost}>
              Hủy
            </button>
            <button type="button" disabled={saving || invalid.length > 0 || changed.length === 0} onClick={save} className={buttonClass.primary}>
              {saving ? <Spinner /> : <IconRefresh />}
              Lưu & tính lại
            </button>
          </span>
          <p className="w-full text-xs text-subtle">Khi lưu, code cộng lại tổng, tính lại master schedule và báo giá (không gọi LLM).</p>
          {saveError && (
            <div className="w-full">
              <ErrorBox>{saveError}</ErrorBox>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WBSCard({
  data,
  schedule,
  downloadHref,
  onScheduleChange,
  edited = false,
  onEstimatesSave,
  lockReason = null,
}: {
  data: WbsResult;
  schedule: ScheduleResult | null;
  downloadHref?: string;
  onScheduleChange?: (config: ScheduleConfig) => Promise<void>;
  edited?: boolean;
  onEstimatesSave?: (estimates: Record<string, number>) => Promise<void>;
  lockReason?: string | null;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tasks = data.items.filter((i) => i.level === 2).length;
  const total = data.totals.reduce((s, p) => s + p.total_md, 0);
  const types = TYPES.filter((t) => data.items.some((i) => i.type === t));
  const end = schedule?.phases[schedule.phases.length - 1]?.end;
  const subtitle = `${tasks} task · ${md(total)} man-day${schedule && end ? ` · ${ddmmyyyy(schedule.phases[0].start)} → ${ddmmyyyy(end)}` : ""}`;

  const download = () => {
    if (!downloadHref) return;
    setDownloading(true);
    setError(null);
    downloadUrl(downloadHref)
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được file."))
      .finally(() => setDownloading(false));
  };

  return (
    <Card
      step="wbs"
      title="WBS & master schedule"
      subtitle={subtitle}
      actions={
        downloadHref && (
          <button type="button" disabled={downloading} onClick={download} className={buttonClass.secondary}>
            {downloading ? <Spinner /> : <IconDownload />}
            Tải bộ bidding (.xlsx)
          </button>
        )
      }
    >
      {error && (
        <div className="mb-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      <TypeMatrix wbs={data} />
      {data.totals
        .filter((p) => p.adjustment_note)
        .map((p) => (
          <p key={p.phase} className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-fg">
            <b>{PHASE_LABELS[p.phase]} lệch khỏi effort chuẩn:</b> {p.adjustment_note}
          </p>
        ))}
      <p className="mt-2 text-sm text-subtle">Man-day node cha và tổng giai đoạn do code cộng; mỗi task lá tối đa 10 man-day.</p>

      {schedule && (
        <div className="mt-5 space-y-3">
          <h3 className="text-sm font-semibold text-muted">Master schedule</h3>
          {onScheduleChange && <ScheduleForm key={JSON.stringify(schedule.config)} config={schedule.config} types={types} onSubmit={onScheduleChange} />}
          <Gantt wbs={data} schedule={schedule} />
        </div>
      )}

      <div className="mt-5">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-muted">Bảng WBS</h3>
          {onEstimatesSave && <span className="text-xs text-subtle">Sửa trực tiếp man-day của task lá; node cha tự cộng.</span>}
          {edited && <Badge tone="info">Đã sửa tay</Badge>}
        </div>
        {lockReason && (
          <p className="mb-2 rounded-md border border-line bg-surface-2/50 px-3 py-2 text-sm text-muted">
            <b className="text-fg">Không sửa được man-day:</b> {lockReason}
          </p>
        )}
        {edited && (
          <p className="mb-2 rounded-md border border-line bg-surface-2/50 px-3 py-2 text-sm text-muted">
            Bảng tổng, lịch, báo giá, slide và file Excel đã theo số mới. Nội dung proposal do LLM viết trước khi sửa có thể còn nhắc số cũ: kiểm
            tra lại hoặc chạy lại từ bước proposal.
          </p>
        )}
        <WbsTree wbs={data} onSave={onEstimatesSave} />
      </div>

      {(data.assumptions.length > 0 || data.out_of_scope.length > 0) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {data.assumptions.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-muted">Giả định</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
                {data.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {data.out_of_scope.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-muted">Ngoài phạm vi</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
                {data.out_of_scope.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
