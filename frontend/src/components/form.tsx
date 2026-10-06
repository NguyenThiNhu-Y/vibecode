import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { IconCheck } from "./icons";
import { ErrorBox, Spinner, buttonClass } from "./ui";

export const input =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-fg placeholder:text-subtle focus:border-accent focus:outline-none";
export const num = `${input} text-right tabular-nums`;
export const section = "rounded-lg border border-line bg-surface p-5";

const SYMBOLS = { VND: "₫", JPY: "¥", USD: "$" } as const;
const groupDigits = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

/** Whole-number money field shown as "4.000.000 ₫": thousands separators are inserted while
 * typing and the caret stays after the same digit. `nullable`: an empty field gives null. */
export function MoneyInput({
  value,
  onChange,
  currency = "VND",
  placeholder,
  nullable = false,
  ariaLabel,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  currency?: keyof typeof SYMBOLS;
  placeholder?: number;
  nullable?: boolean;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value == null ? "" : groupDigits(value));

  useEffect(() => {
    // follow outside changes (e.g. after save) but never rewrite the field while it is being typed in
    if (document.activeElement !== ref.current) setText(value == null ? "" : groupDigits(value));
  }, [value]);

  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const caret = e.target.selectionStart ?? raw.length;
    const digitsBefore = raw.slice(0, caret).replace(/\D/g, "").length;
    const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 15);
    if (!digits) {
      setText("");
      onChange(nullable ? null : 0);
      return;
    }
    const next = groupDigits(Number(digits));
    setText(next);
    onChange(Number(digits));
    requestAnimationFrame(() => {
      let pos = 0;
      for (let seen = 0; pos < next.length && seen < digitsBefore; pos++) if (/\d/.test(next[pos])) seen++;
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  return (
    <span className="relative block">
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={num}
        style={{ paddingRight: "1.9rem" }}
        value={text}
        placeholder={placeholder != null ? groupDigits(placeholder) : undefined}
        onChange={handle}
        onBlur={() => setText(value == null ? "" : groupDigits(value))}
        aria-label={ariaLabel}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-subtle">{SYMBOLS[currency]}</span>
    </span>
  );
}

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
