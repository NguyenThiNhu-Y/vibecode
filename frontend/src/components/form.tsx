import { useState, type ReactNode } from "react";
import { IconCheck } from "./icons";
import { ErrorBox, Spinner, buttonClass } from "./ui";

export const input =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-fg placeholder:text-subtle focus:border-accent focus:outline-none";
export const num = `${input} text-right tabular-nums`;
export const section = "rounded-lg border border-line bg-surface p-5";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-subtle">{hint}</span>}
    </label>
  );
}

export function SaveBar({
  busy,
  saved,
  error,
  onSave,
  label = "Lưu thay đổi",
}: {
  busy: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
  label?: string;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy} onClick={onSave} className={buttonClass.primary}>
        {busy ? <Spinner /> : <IconCheck />}
        {label}
      </button>
      {saved && <span className="text-success">Đã lưu. Áp dụng cho các phiên và file xuất tiếp theo.</span>}
      {error && (
        <div className="w-full">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
    </div>
  );
}

export function useSaver() {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      await action();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, saved, error, run };
}

/** Left list + right editor layout used by the library-style settings tabs. */
export function ListPicker<T>({
  title,
  items,
  current,
  label,
  onPick,
  onAdd,
  addLabel,
}: {
  title: string;
  items: T[];
  current: number;
  label: (item: T) => ReactNode;
  onPick: (index: number) => void;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="mb-3 font-semibold text-fg">
        {title} ({items.length})
      </h2>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onPick(i)}
              className={`w-full rounded-md px-3 py-1.5 text-left text-sm ${current === i ? "bg-accent-soft text-accent-strong" : "text-muted hover:bg-surface-2"}`}
            >
              {label(item)}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onAdd} className={`${buttonClass.secondary} mt-3 w-full`}>
        + {addLabel}
      </button>
    </section>
  );
}
