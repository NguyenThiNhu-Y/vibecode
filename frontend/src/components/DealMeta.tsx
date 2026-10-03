import { useState } from "react";
import type { RunMeta } from "../api";
import { DEAL_STAGES, DEAL_STAGE_LABELS, DEAL_STAGE_TONE, daysUntil } from "../labels";
import type { DealStage } from "../types";
import { ErrorBox, Spinner, TONE, buttonClass } from "./ui";

export function DueBadge({ due }: { due: string | null }) {
  if (!due) return null;
  const days = daysUntil(due);
  const tone = days < 0 ? TONE.danger : days <= 3 ? TONE.warning : TONE.neutral;
  const label = days < 0 ? `quá hạn ${-days} ngày` : days === 0 ? "hạn hôm nay" : `còn ${days} ngày`;
  return (
    <span className={`rounded-md px-2 py-0.5 text-sm font-medium whitespace-nowrap ${tone}`}>
      Hạn nộp {new Date(`${due}T00:00:00`).toLocaleDateString("vi-VN")} · {label}
    </span>
  );
}

export function StageSelect({ stage, onChange, disabled }: { stage: DealStage; onChange?: (s: DealStage) => void; disabled?: boolean }) {
  if (!onChange) return <span className={`rounded-md px-2 py-0.5 text-sm font-medium ${TONE[DEAL_STAGE_TONE[stage]]}`}>{DEAL_STAGE_LABELS[stage]}</span>;
  return (
    <select
      value={stage}
      disabled={disabled}
      aria-label="Giai đoạn deal"
      onChange={(e) => onChange(e.target.value as DealStage)}
      className={`rounded-md border-0 px-2 py-0.5 text-sm font-medium focus:ring-2 focus:ring-accent focus:outline-none ${TONE[DEAL_STAGE_TONE[stage]]}`}
    >
      {DEAL_STAGES.map((s) => (
        <option key={s} value={s} className="bg-surface text-fg">
          {DEAL_STAGE_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

/** Inline editor for project name, customer and deadline. */
export function DealEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: { project_name: string | null; client_name: string | null; due_date: string | null };
  onSave: (meta: RunMeta) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    project_name: initial.project_name ?? "",
    client_name: initial.client_name ?? "",
    due_date: initial.due_date ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = "rounded-md border border-line bg-surface px-2.5 py-1.5 text-fg placeholder:text-subtle focus:border-accent focus:outline-none";
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <input className={`${input} min-w-56 flex-1`} placeholder="Tên dự án" aria-label="Tên dự án" value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
      <input className={`${input} min-w-44`} placeholder="Khách hàng" aria-label="Khách hàng" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
      <input type="date" className={input} aria-label="Hạn nộp proposal" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onSave({ project_name: form.project_name, client_name: form.client_name, due_date: form.due_date || null });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Không lưu được.");
          } finally {
            setBusy(false);
          }
        }}
        className={buttonClass.primary}
      >
        {busy ? <Spinner /> : "Lưu"}
      </button>
      <button type="button" onClick={onCancel} className={buttonClass.ghost}>
        Hủy
      </button>
      {error && (
        <div className="w-full">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
    </div>
  );
}
