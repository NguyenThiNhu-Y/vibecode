import { STEP_LABELS } from "../labels";
import { STEPS, type StepName } from "../types";
import { IconCheck } from "./icons";
import { Spinner } from "./ui";

export type StepState = "pending" | "running" | "done" | "error";

/** Compact horizontal pipeline progress. Clicking a finished step opens the tab that shows it. */
export default function Stepper({
  states,
  latency,
  liveMs,
  onSelect,
}: {
  states: Record<StepName, StepState>;
  latency: Partial<Record<StepName, number>>;
  liveMs: number;
  onSelect: (step: StepName) => void;
}) {
  return (
    <nav aria-label="Tiến trình phân tích" className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1">
        {STEPS.map((step, i) => {
          const state = states[step];
          const dot = {
            pending: "border border-line bg-surface text-subtle",
            running: "bg-accent-soft text-accent-strong",
            done: "bg-success-soft text-success",
            error: "bg-danger-soft text-danger",
          }[state];
          return (
            <li key={step} className="flex items-center gap-1">
              <button
                type="button"
                disabled={state === "pending"}
                onClick={() => onSelect(step)}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
                title={state === "done" && latency[step] !== undefined ? `${(latency[step]! / 1000).toFixed(1)}s` : undefined}
              >
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-semibold ${dot}`}>
                  {state === "done" ? <IconCheck strokeWidth={3} /> : state === "running" ? <Spinner className="h-3 w-3" /> : state === "error" ? "!" : i + 1}
                </span>
                <span className={`text-sm whitespace-nowrap ${state === "pending" ? "text-subtle" : "text-fg"}`}>
                  {STEP_LABELS[step]}
                  {state === "running" && <span className="ml-1 font-mono text-accent-strong tabular-nums">{(liveMs / 1000).toFixed(1)}s</span>}
                </span>
              </button>
              {i < STEPS.length - 1 && <span className={`h-px w-4 ${state === "done" ? "bg-success" : "bg-line"}`} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
