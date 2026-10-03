import { useState, type ReactNode } from "react";
import { STATUS_LABELS } from "../labels";
import { STEPS, type RunStatus, type StepName } from "../types";
import { IconAlert, IconCheck, IconCopy, STEP_ICONS } from "./icons";

export const eyebrow = "text-xs font-semibold tracking-wide text-subtle uppercase";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "violet";

export const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent-strong",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  violet: "bg-violet-soft text-violet",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-medium whitespace-nowrap ${TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<RunStatus, Tone> = {
  created: "neutral",
  running: "accent",
  waiting_clarification: "warning",
  done: "info",
  failed: "danger",
  approved: "success",
  rejected: "danger",
};

export function StatusPill({ status }: { status: RunStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${status === "running" ? "animate-pulse" : ""}`} />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

/** A content block: title row with optional actions, then body. */
export function Panel({
  id,
  title,
  subtitle,
  icon,
  actions,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  id?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section id={id} className={`fade-up scroll-mt-28 rounded-lg border border-line bg-surface ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3">
          {icon && <span className="text-lg text-subtle">{icon}</span>}
          <div className="min-w-0 flex-1">
            {title && <h2 className="font-semibold text-fg">{title}</h2>}
            {subtitle && <div className="text-sm text-subtle">{subtitle}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Panel for one pipeline step (keeps the `step-<name>` anchor used by the stepper). */
export function Card({
  step,
  title,
  subtitle,
  actions,
  children,
}: {
  step: StepName;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const Icon = STEP_ICONS[step];
  return (
    <Panel
      id={`step-${step}`}
      icon={<Icon />}
      title={
        <span className="flex items-baseline gap-2">
          {title}
          <span className="text-xs font-normal text-subtle">Bước {STEPS.indexOf(step) + 1}</span>
        </span>
      }
      subtitle={subtitle}
      actions={actions}
    >
      {children}
    </Panel>
  );
}

export function Chip({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "muted" | "accent" }) {
  const styles = {
    default: "border-line bg-surface-2 text-fg",
    muted: "border-dashed border-line bg-transparent text-subtle italic",
    accent: "border-transparent bg-accent-soft text-accent-strong",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 ${styles[tone]}`}>{children}</span>;
}

export function Spinner({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <span
      aria-label="Đang chạy"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const buttonClass = {
  primary: `${base} bg-accent text-on-accent hover:brightness-105`,
  secondary: `${base} border border-line bg-surface text-fg hover:bg-surface-2`,
  ghost: `${base} text-muted hover:bg-surface-2 hover:text-fg`,
  danger: `${base} border border-line bg-surface text-danger hover:bg-danger-soft`,
  success: `${base} bg-success text-white hover:brightness-110 dark:text-[#0b1f17]`,
};

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" onClick={copy} className={buttonClass.secondary}>
      {copied ? <IconCheck className="text-success" /> : <IconCopy />}
      {copied ? "Đã copy" : label}
    </button>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="fade-up flex gap-2.5 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-fg">
      <IconAlert className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Callout({ tone = "info", icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={`flex gap-2.5 rounded-md px-4 py-3 ${TONE[tone]}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 text-fg">{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-sm text-subtle">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${tone ? TONE[tone].split(" ")[1] : "text-fg"}`}>{value}</p>
      {hint && <p className="text-sm text-subtle">{hint}</p>}
    </div>
  );
}

export function ThinkingCard({
  step,
  label,
  activity,
  elapsedMs,
}: {
  step: StepName;
  label: string;
  activity: string;
  elapsedMs: number;
}) {
  return (
    <div className="fade-up rounded-lg border border-accent/40 bg-surface p-4" id={`step-${step}`}>
      <div className="flex items-center gap-3">
        <Spinner className="h-4 w-4 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fg">
            {label} <span className="font-normal text-subtle">· Bước {STEPS.indexOf(step) + 1} · Agent đang làm việc</span>
          </p>
          <p className="text-muted">{activity}</p>
        </div>
        <span className="font-mono text-accent-strong tabular-nums">{(elapsedMs / 1000).toFixed(1)}s</span>
      </div>
      <div className="mt-3 space-y-2">
        <div className="shimmer h-2.5 w-11/12 rounded" />
        <div className="shimmer h-2.5 w-2/3 rounded" />
      </div>
    </div>
  );
}
