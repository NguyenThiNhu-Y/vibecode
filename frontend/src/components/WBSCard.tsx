import { useMemo, useState } from "react";
import { downloadUrl } from "../api";
import { PHASE_LABELS } from "../labels";
import type { Phase, Priority, ScheduleConfig, ScheduleResult, WbsItem, WbsResult, WorkType } from "../types";
import { input } from "./form";
import { IconChevronRight, IconDownload, IconPlus, IconRefresh, IconSparkles, IconTrash } from "./icons";
import { Badge, Card, ErrorBox, HoverTip, Spinner, buttonClass } from "./ui";

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
  BA: "#06b6d4",
  DATA: "#10b981",
  AI: "#3b78c2",
  BE: "#8b5cf6",
  FE: "#ec4899",
  DESIGN: "#eab308",
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
  const details = (task: ScheduleResult["tasks"][number], item: WbsItem) => (
    <>
      <p className="font-semibold text-fg">
        {task.wbs_id} · {item.name}
      </p>
      <p className="mt-1 text-muted">
        {PHASE_LABELS[item.phase]} · <b className="text-fg">{md(item.estimate_md)} man-day</b>
      </p>
      <p className="text-muted tabular-nums">
        {ddmmyyyy(task.start)} → {ddmmyyyy(task.end)}
      </p>
      {item.depends_on.length > 0 && <p className="text-subtle">Sau: {item.depends_on.join(", ")}</p>}
    </>
  );

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
            <li
              key={task.wbs_id}
              onMouseEnter={() => setHover(task.wbs_id)}
              className="grid grid-cols-[minmax(0,15rem)_1fr] items-center gap-3 border-t border-line/60 py-1"
            >
              <HoverTip content={details(task, item)} className="block cursor-default truncate text-sm text-muted">
                <span className="font-mono text-subtle">{task.wbs_id}</span> {item.name}
              </HoverTip>
              <div className="relative h-4">
                <HoverTip
                  content={details(task, item)}
                  className="bar-grow absolute inset-y-0.5 rounded-sm"
                  style={{
                    left: `${pct(task.start)}%`,
                    width: `max(4px, ${pct(task.end, true) - pct(task.start)}%)`,
                    background: PHASE_COLOR[item.phase],
                    opacity: hover && hover !== task.wbs_id ? 0.4 : 1,
                  }}
                >
                  {null}
                </HoverTip>
              </div>
            </li>
          );
        })}
        <li className="grid grid-cols-[minmax(0,15rem)_1fr] items-center gap-3 border-t border-line py-1.5">
          <span className="text-sm font-medium text-fg">Milestone</span>
          <div className="relative h-9">
            {schedule.milestones.map((m) => (
              <div key={m.id} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${pct(m.date) + 100 / span * DAY / 2}%` }}>
                <HoverTip
                  content={
                    <>
                      <b>{m.id}</b> {m.name} · {ddmmyyyy(m.date)}
                      {m.payment_percent ? ` · thanh toán ${m.payment_percent}%` : ""}
                    </>
                  }
                  className="block h-3 w-3 rotate-45 bg-fg"
                >
                  {null}
                </HoverTip>
                <span className="mt-1 text-[11px] whitespace-nowrap text-subtle tabular-nums">
                  {m.id}
                  {m.payment_percent ? ` · ${m.payment_percent}%` : ""}
                </span>
              </div>
            ))}
          </div>
        </li>
      </ul>
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
  onSuggest,
}: {
  config: ScheduleConfig;
  types: WorkType[];
  onSubmit: (config: ScheduleConfig) => Promise<void>;
  onSuggest?: () => Promise<ScheduleConfig>;
}) {
  const [start, setStart] = useState(config.start_date);
  const [buffer, setBuffer] = useState(Math.round(config.buffer_ratio * 100));
  const [headcount, setHeadcount] = useState(config.headcount);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggest = async () => {
    if (!onSuggest) return;
    setSuggesting(true);
    setError(null);
    try {
      const s = await onSuggest();
      setHeadcount(s.headcount);
      setSuggested(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lấy được số người gợi ý.");
    } finally {
      setSuggesting(false);
    }
  };

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
        {onSuggest && (
          <button
            type="button"
            disabled={busy || suggesting}
            onClick={suggest}
            className={buttonClass.soft}
            title="Số người mỗi loại để PoC ~3 tháng, phát triển ~6 tháng, triển khai ~2 tháng (đã gồm buffer)"
          >
            {suggesting ? <Spinner /> : <IconSparkles />}
            Gợi ý theo effort
          </button>
        )}
      </div>
      {suggested && (
        <p className="mt-2 text-sm text-fg">Đã điền số người gợi ý theo effort của WBS. Bấm <b>Tính lại lịch</b> để áp dụng.</p>
      )}
      <p className="mt-2 text-xs text-subtle">
        Tính bằng code, không gọi LLM: mỗi task = man-day theo loại ÷ số người; giai đoạn = max(đường găng, tổng man-day ÷ số người) + buffer. Số
        người mặc định được gợi ý theo effort (PoC ~3 tháng, phát triển ~6 tháng, triển khai ~2 tháng; 1 PM). Lịch sơ bộ, chưa cân bằng nguồn lực
        từng ngày.
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
/** Natural order of hierarchical ids: 1.2 < 1.10 < 2. */
const idCompare = (a: string, b: string) => {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let k = 0; k < Math.max(x.length, y.length); k++) if ((x[k] ?? -1) !== (y[k] ?? -1)) return (x[k] ?? -1) - (y[k] ?? -1);
  return 0;
};
const NEW_TASK = { priority: "mid" as Priority, depends_on: [] as string[], deliverable: null, tags: [] as WbsItem["tags"], note: null };

const cellInput =
  "w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-fg hover:border-line focus:border-accent focus:bg-surface focus:outline-none";
const cellSelect =
  "rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-fg hover:border-line focus:border-accent focus:bg-surface focus:outline-none";

const childNumber = (items: WbsItem[], parent: string | null) =>
  Math.max(
    0,
    ...items.filter((i) => parentOf(i.id) === parent).map((i) => Number(i.id.split(".").pop()) || 0),
  ) + 1;
const descendantsOf = (items: WbsItem[], id: string) => items.filter((i) => i.id.startsWith(`${id}.`)).map((i) => i.id);
const parseDeps = (text: string) =>
  text
    .split(/[\s,;]+/)
    .map((d) => d.trim())
    .filter(Boolean);

/** Collapsible WBS tree with phase tabs and Type / Priority filters. With `onSave` it is an
 * inline editor: every field of a task, add group / task / sub-task, delete; parent sums update
 * while typing; on save the server checks the tree, renumbers ids and recomputes schedule and
 * quotation (no LLM). */
function WbsTree({ wbs, onSave }: { wbs: WbsResult; onSave?: (items: WbsItem[]) => Promise<void> }) {
  const editable = Boolean(onSave);
  const [draft, setDraft] = useState<WbsItem[] | null>(null);
  const [mdText, setMdText] = useState<Record<string, string>>({});
  const [depText, setDepText] = useState<Record<string, string>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [newGroupPhase, setNewGroupPhase] = useState<Phase>("mvp");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase | "all">("all");
  const [type, setType] = useState<WorkType | "all">("all");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const items = draft ?? wbs.items;
  const parents = useMemo(() => new Set(items.map((i) => parentOf(i.id)).filter((p): p is string => p !== null)), [items]);
  const ordered = useMemo(
    () => [...items].sort((a, b) => PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase) || idCompare(a.id, b.id)),
    [items],
  );
  const phases = PHASES.filter((p) => items.some((i) => i.phase === p));
  const types = TYPES.filter((t) => items.some((i) => i.type === t));

  // ---- draft helpers ----
  const edit = (fn: (current: WbsItem[]) => WbsItem[]) => setDraft((d) => fn(d ?? wbs.items));
  const update = (id: string, patch: Partial<WbsItem>) => edit((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const mdOf = (i: WbsItem): number | null => {
    const raw = mdText[i.id];
    if (raw === undefined) return i.estimate_md ?? 0;
    const value = Number(raw.replace(",", "."));
    return raw.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= MAX_LEAF_MD ? value : null;
  };
  const ids = new Set(items.map((i) => i.id));
  const depsOf = (i: WbsItem) => (depText[i.id] !== undefined ? parseDeps(depText[i.id]) : i.depends_on);
  const errors = {
    name: items.filter((i) => !i.name.trim()).map((i) => i.id),
    md: items.filter((i) => !parents.has(i.id) && mdOf(i) === null).map((i) => i.id),
    deps: items.filter((i) => depsOf(i).some((d) => !ids.has(d) || d === i.id)).map((i) => i.id),
  };
  const invalid = new Set([...errors.name, ...errors.md, ...errors.deps]);

  const addChild = (parent: WbsItem) => {
    edit((cur) => {
      const id = `${parent.id}.${childNumber(cur, parent.id)}`;
      const wasLeaf = !cur.some((i) => parentOf(i.id) === parent.id);
      const lastChild = cur.filter((i) => parentOf(i.id) === parent.id).pop();
      const child: WbsItem = {
        ...NEW_TASK,
        id,
        phase: parent.phase,
        level: (parent.level + 1) as WbsItem["level"],
        name: "",
        type: wasLeaf && parent.level === 2 ? (parent.type ?? "BE") : (lastChild?.type ?? "BE"),
        priority: wasLeaf && parent.level === 2 ? parent.priority : "mid",
        // the first sub-task takes over the task's estimate, so totals do not jump
        estimate_md: wasLeaf && parent.level === 2 ? (mdOf(parent) ?? parent.estimate_md ?? 1) : 1,
      };
      return [...cur.map((i) => (i.id === parent.id && wasLeaf ? { ...i, estimate_md: null } : i)), child];
    });
    setCollapsed((c) => {
      const next = new Set(c);
      next.delete(parent.id);
      return next;
    });
    setFocusId(`${parent.id}.${childNumber(items, parent.id)}`);
  };

  const addGroup = () => {
    const n = childNumber(items, null);
    edit((cur) => [
      ...cur,
      { ...NEW_TASK, id: String(n), phase: newGroupPhase, level: 1, name: "", type: null, estimate_md: null },
      { ...NEW_TASK, id: `${n}.1`, phase: newGroupPhase, level: 2, name: "Task mới", type: "BE", estimate_md: 1 },
    ]);
    setPhase("all");
    setFocusId(String(n));
  };

  const remove = (item: WbsItem) => {
    const gone = new Set([item.id, ...descendantsOf(items, item.id)]);
    if (gone.size > 1 && !window.confirm(`Xóa "${item.name || item.id}" và ${gone.size - 1} task con?`)) return;
    edit((cur) => {
      let next = cur.filter((i) => !gone.has(i.id));
      const parent = parentOf(item.id);
      if (parent && !next.some((i) => parentOf(i.id) === parent)) {
        if (!parent.includes(".")) {
          next = next.filter((i) => i.id !== parent); // an empty group cannot stay
          gone.add(parent);
        } else {
          // the task has no sub-task left: it becomes a task again, with 0 man-day to fill in
          next = next.map((i) => (i.id === parent ? { ...i, type: item.type ?? "BE", priority: item.priority, estimate_md: 0 } : i));
        }
      }
      return next.map((i) => (i.depends_on.some((d) => gone.has(d)) ? { ...i, depends_on: i.depends_on.filter((d) => !gone.has(d)) } : i));
    });
    setDepText((t) => Object.fromEntries(Object.entries(t).filter(([k]) => !gone.has(k))));
  };

  const reset = () => {
    setDraft(null);
    setMdText({});
    setDepText({});
    setSaveError(null);
  };

  // ---- change summary ----
  // a row counts as modified when a field a person can edit changed (parent sums are derived)
  const signature = (i: WbsItem, isParent: boolean) =>
    JSON.stringify([i.name.trim(), i.phase, isParent ? null : i.type, isParent ? null : i.priority,
      isParent ? null : i.estimate_md, i.depends_on, i.deliverable ?? null]); // prettier-ignore
  const original = useMemo(() => {
    const had = new Set(wbs.items.map((i) => parentOf(i.id)));
    return new Map(wbs.items.map((i) => [i.id, signature(i, had.has(i.id))]));
  }, [wbs]); // eslint-disable-line react-hooks/exhaustive-deps
  const finalItems = (): WbsItem[] =>
    items.map((i) => ({ ...i, name: i.name.trim(), estimate_md: parents.has(i.id) ? null : mdOf(i), depends_on: depsOf(i) }));
  const added = items.filter((i) => !original.has(i.id)).length;
  const removed = [...original.keys()].filter((id) => !ids.has(id)).length;
  const changedRows = draft || Object.keys(mdText).length || Object.keys(depText).length ? finalItems() : [];
  const modified = changedRows.filter((i) => original.has(i.id) && original.get(i.id) !== signature(i, parents.has(i.id))).length;
  const dirty = added + removed + modified > 0;

  // live sums: a parent shows the sum of its (possibly edited) children
  const kids: Record<string, string[]> = {};
  for (const i of items) {
    const p = parentOf(i.id);
    if (p) (kids[p] ??= []).push(i.id);
  }
  const byDraftId = Object.fromEntries(items.map((i) => [i.id, i]));
  const sums: Record<string, number> = {};
  const sumOf = (id: string): number => {
    if (sums[id] === undefined) {
      const value = kids[id] ? kids[id].reduce((s, c) => s + sumOf(c), 0) : (mdOf(byDraftId[id]) ?? 0);
      sums[id] = Math.round(value * 100) / 100;
    }
    return sums[id];
  };
  items.forEach((i) => sumOf(i.id));
  const totalBefore = wbs.totals.reduce((s, t) => s + t.total_md, 0);
  const totalAfter = items.filter((i) => !i.id.includes(".")).reduce((s, i) => s + sums[i.id], 0);

  const save = async () => {
    if (!onSave || !dirty || invalid.size) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(finalItems());
      reset();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Không lưu được WBS.");
    } finally {
      setSaving(false);
    }
  };

  const rows = useMemo(() => {
    const inPhase = ordered.filter((i) => phase === "all" || i.phase === phase);
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
  }, [ordered, phase, type, priority, collapsed, parents]);

  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const select = "rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none";
  const bad = "!border-danger bg-danger/10";

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
        <button type="button" onClick={() => setCollapsed(new Set(items.filter((i) => i.level === 1).map((i) => i.id)))} className={buttonClass.ghost}>
          Thu gọn
        </button>
        <button type="button" onClick={() => setCollapsed(new Set())} className={buttonClass.ghost}>
          Mở hết
        </button>
      </div>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className={`w-full ${editable ? "min-w-[1040px]" : "min-w-[720px]"} border-collapse text-left text-sm`}>
          <thead className="bg-surface-2 text-subtle">
            <tr>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-2 py-2 font-medium">Loại</th>
              <th className="px-2 py-2 font-medium">Ưu tiên</th>
              <th className="px-2 py-2 text-right font-medium">Man-day</th>
              <th className="px-2 py-2 font-medium">Sau</th>
              <th className="px-3 py-2 font-medium">Bàn giao</th>
              {editable && <th className="w-24 px-2 py-2" aria-label="Thao tác" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((i) => {
              const isParent = parents.has(i.id);
              const isNew = !original.has(i.id);
              return (
                <tr key={i.id} className={`group ${i.level === 1 ? "bg-surface-2/50" : ""} ${isNew ? "bg-accent-soft/60" : ""}`}>
                  <td className="px-3 py-1" style={{ paddingLeft: `${0.75 + (i.level - 1) * 1.25}rem` }}>
                    <span className="flex items-center gap-1">
                      {isParent ? (
                        <button
                          type="button"
                          onClick={() => toggle(i.id)}
                          aria-label={collapsed.has(i.id) ? "Mở" : "Thu gọn"}
                          className="shrink-0 text-subtle hover:text-fg"
                        >
                          <IconChevronRight className={`transition-transform ${collapsed.has(i.id) ? "" : "rotate-90"}`} />
                        </button>
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <span className="shrink-0 font-mono text-subtle">{isNew ? "mới" : i.id}</span>
                      {editable ? (
                        <input
                          value={i.name}
                          autoFocus={focusId === i.id}
                          placeholder={i.level === 1 ? "Tên nhóm" : i.level === 2 ? "Tên task" : "Tên sub-task"}
                          onChange={(e) => update(i.id, { name: e.target.value })}
                          aria-label={`Tên ${i.id}`}
                          aria-invalid={errors.name.includes(i.id)}
                          className={`${cellInput} min-w-[16rem] ${i.level === 1 ? "font-semibold" : ""} ${errors.name.includes(i.id) ? bad : ""}`}
                        />
                      ) : (
                        <span className={i.level === 1 ? "font-semibold text-fg" : "text-fg"}>{i.name}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    {!isParent &&
                      i.type &&
                      (editable ? (
                        <select value={i.type} onChange={(e) => update(i.id, { type: e.target.value as WorkType })} aria-label={`Loại ${i.id}`} className={cellSelect}>
                          {TYPES.map((t) => (
                            <option key={t} value={t}>
                              {TYPE_LABEL[t]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <TypeChip type={i.type} />
                      ))}
                  </td>
                  <td className="px-2 py-1 text-muted">
                    {!isParent &&
                      (editable ? (
                        <select
                          value={i.priority}
                          onChange={(e) => update(i.id, { priority: e.target.value as Priority })}
                          aria-label={`Ưu tiên ${i.id}`}
                          className={`${cellSelect} ${i.priority === "high" ? "text-danger" : ""}`}
                        >
                          {(["high", "mid", "low"] as const).map((p) => (
                            <option key={p} value={p}>
                              {PRIORITY_LABEL[p]}
                            </option>
                          ))}
                        </select>
                      ) : i.priority === "high" ? (
                        <Badge tone="danger">Cao</Badge>
                      ) : (
                        PRIORITY_LABEL[i.priority]
                      ))}
                  </td>
                  <td className={`px-2 py-1 text-right tabular-nums ${isParent ? "font-semibold text-fg" : "text-muted"}`}>
                    {isParent || !editable ? (
                      <span className={isParent && dirty ? "text-accent-strong" : ""}>{md(isParent ? sums[i.id] : i.estimate_md)}</span>
                    ) : (
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={MAX_LEAF_MD}
                        step={0.5}
                        value={mdText[i.id] ?? String(i.estimate_md ?? 0)}
                        onChange={(e) => setMdText((d) => ({ ...d, [i.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && save()}
                        aria-label={`Man-day ${i.id}`}
                        aria-invalid={errors.md.includes(i.id)}
                        className={`w-20 rounded border border-line bg-surface px-1.5 py-0.5 text-right tabular-nums text-fg focus:border-accent focus:outline-none ${errors.md.includes(i.id) ? bad : ""}`}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1 font-mono text-xs text-subtle">
                    {editable ? (
                      <input
                        value={depText[i.id] ?? i.depends_on.join(", ")}
                        placeholder="—"
                        onChange={(e) => setDepText((d) => ({ ...d, [i.id]: e.target.value }))}
                        aria-label={`Phụ thuộc ${i.id}`}
                        aria-invalid={errors.deps.includes(i.id)}
                        title="Mã task phải xong trước, cách nhau bằng dấu phẩy, ví dụ 1.2, 1.3"
                        className={`${cellInput} w-24 font-mono text-xs ${errors.deps.includes(i.id) ? bad : ""}`}
                      />
                    ) : (
                      i.depends_on.join(", ") || "—"
                    )}
                  </td>
                  <td className="max-w-64 px-3 py-1 text-muted">
                    {editable ? (
                      <input
                        value={i.deliverable ?? ""}
                        placeholder="—"
                        onChange={(e) => update(i.id, { deliverable: e.target.value || null })}
                        aria-label={`Bàn giao ${i.id}`}
                        className={`${cellInput} min-w-[12rem] text-muted`}
                      />
                    ) : (
                      i.deliverable && (
                        <HoverTip onlyIfTruncated content={i.deliverable} className="block truncate">
                          {i.deliverable}
                        </HoverTip>
                      )
                    )}
                  </td>
                  {editable && (
                    <td className="px-2 py-1">
                      <span className="flex justify-end gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                        {i.level < 3 && (
                          <button
                            type="button"
                            onClick={() => addChild(i)}
                            title={i.level === 1 ? "Thêm task vào nhóm" : "Thêm sub-task"}
                            aria-label={i.level === 1 ? `Thêm task vào ${i.id}` : `Thêm sub-task vào ${i.id}`}
                            className="rounded p-1 text-subtle hover:bg-surface-2 hover:text-accent-strong"
                          >
                            <IconPlus />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => remove(i)}
                          title="Xóa"
                          aria-label={`Xóa ${i.id}`}
                          className="rounded p-1 text-subtle hover:bg-danger-soft hover:text-danger"
                        >
                          <IconTrash />
                        </button>
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={editable ? 7 : 6} className="px-3 py-3 text-center text-subtle">
                  Không có task phù hợp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={newGroupPhase} onChange={(e) => setNewGroupPhase(e.target.value as Phase)} className={select} aria-label="Giai đoạn của nhóm mới">
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {PHASE_LABELS[p]}
              </option>
            ))}
          </select>
          <button type="button" onClick={addGroup} className={buttonClass.secondary}>
            <IconPlus /> Thêm nhóm
          </button>
          <span className="text-xs text-subtle">Rê chuột vào một dòng để thêm task / sub-task hoặc xóa.</span>
        </div>
      )}
      {editable && (dirty || invalid.size > 0) && (
        <div className="sticky bottom-0 z-10 mt-2 flex flex-wrap items-center gap-3 rounded-md border border-accent/40 bg-surface p-3 shadow-sm">
          <span className="text-sm text-fg">
            {[modified && `${modified} sửa`, added && `${added} thêm`, removed && `${removed} xóa`].filter(Boolean).join(" · ") || "Có thay đổi"} · tổng{" "}
            <span className="tabular-nums">
              {md(totalBefore)} → <b>{md(totalAfter)}</b> man-day
            </span>
          </span>
          {invalid.size > 0 && (
            <span className="text-sm text-danger">
              {[
                errors.name.length && `${errors.name.length} task chưa có tên`,
                errors.md.length && `man-day mỗi task từ 0 đến ${MAX_LEAF_MD}`,
                errors.deps.length && `${errors.deps.length} ô "Sau" có mã task không tồn tại`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          <span className="ml-auto flex gap-2">
            <button type="button" disabled={saving} onClick={reset} className={buttonClass.ghost}>
              Hủy
            </button>
            <button type="button" disabled={saving || invalid.size > 0 || !dirty} onClick={save} className={buttonClass.primary}>
              {saving ? <Spinner /> : <IconRefresh />}
              Lưu & tính lại
            </button>
          </span>
          <p className="w-full text-xs text-subtle">
            Khi lưu, code kiểm tra cây WBS và phụ thuộc, đánh lại mã task, cộng lại tổng, tính lại master schedule và báo giá (không gọi LLM).
          </p>
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
  onScheduleSuggest,
  edited = false,
  warnings = [],
  onWbsSave,
  lockReason = null,
}: {
  data: WbsResult;
  schedule: ScheduleResult | null;
  downloadHref?: string;
  onScheduleChange?: (config: ScheduleConfig) => Promise<void>;
  onScheduleSuggest?: () => Promise<ScheduleConfig>;
  edited?: boolean;
  warnings?: string[];
  onWbsSave?: (items: WbsItem[]) => Promise<void>;
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
          {onScheduleChange && <ScheduleForm key={JSON.stringify(schedule.config)} config={schedule.config} types={types} onSubmit={onScheduleChange} onSuggest={onScheduleSuggest} />}
          <Gantt wbs={data} schedule={schedule} />
        </div>
      )}

      <div className="mt-5">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-muted">Bảng WBS</h3>
          {onWbsSave && <span className="text-xs text-subtle">Bấm vào ô để sửa; thêm / xóa task ở cuối mỗi dòng; node cha tự cộng.</span>}
          {edited && <Badge tone="info">Đã sửa tay</Badge>}
        </div>
        {lockReason && (
          <p className="mb-2 rounded-md border border-line bg-surface-2/50 px-3 py-2 text-sm text-muted">
            <b className="text-fg">Không sửa được WBS:</b> {lockReason}
          </p>
        )}
        {edited && (
          <p className="mb-2 rounded-md border border-line bg-surface-2/50 px-3 py-2 text-sm text-muted">
            Bảng tổng, lịch, báo giá, slide và file Excel đã theo số mới. Nội dung proposal do LLM viết trước khi sửa có thể còn nhắc số cũ: kiểm
            tra lại hoặc chạy lại từ bước proposal.
          </p>
        )}
        {warnings.length > 0 && (
          <div className="mb-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-fg">
            <b>WBS đã sửa không còn đạt một số quy tắc:</b>
            <ul className="mt-1 list-disc pl-5 text-muted">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <WbsTree wbs={data} onSave={onWbsSave} />
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
