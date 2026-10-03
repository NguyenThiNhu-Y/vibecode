import { useEffect, useState } from "react";
import { getEvalReport, listEvalReports } from "../api";
import EvalTrendChart, { reportLabel } from "../components/EvalTrendChart";
import { IconAlert, IconCheck, IconX } from "../components/icons";
import { ErrorBox, Spinner, eyebrow } from "../components/ui";
import { PATTERN_LABELS } from "../labels";
import type { EvalReport, EvalReportInfo } from "../types";

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <p className={eyebrow}>{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-fg tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-sm text-subtle">{hint}</p>}
    </div>
  );
}

function Mark({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="text-subtle">—</span>;
  return ok ? (
    <span className="inline-flex items-center gap-1 text-success">
      <IconCheck /> Đúng
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-danger">
      <IconX /> Sai
    </span>
  );
}

export default function Eval() {
  const [reports, setReports] = useState<EvalReportInfo[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<EvalReport | null>(null);
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEvalReports()
      .then((list) => {
        setReports(list);
        if (list.length) setSelected(list[list.length - 1].name);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được report."));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setDetail(null);
    getEvalReport(selected)
      .then(setDetail)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được report."));
  }, [selected]);

  const latest = reports?.[reports.length - 1];
  const allMock = reports?.every((r) => r.provider === "mock");
  const cases = detail?.cases.filter((c) => !onlyWrong || !c.pattern_ok) ?? [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-semibold text-fg">Đánh giá chất lượng agent</h1>
      <p className="mt-0.5 max-w-3xl text-muted">
        Mỗi lần chạy <code className="rounded bg-surface-2 px-1.5 font-mono text-sm">python -m eval.run_eval --label "…"</code>{" "}
        tạo một report trong <code className="rounded bg-surface-2 px-1.5 font-mono text-sm">backend/eval/reports/</code>.
      </p>

      {error && (
        <div className="mt-6">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      {!reports && !error && (
        <p className="mt-6 flex items-center gap-2 text-muted">
          <Spinner /> Đang tải…
        </p>
      )}
      {reports && reports.length === 0 && (
        <div className="rounded-lg border border-line bg-surface mt-6 p-8 text-center text-muted">
          Chưa có report nào. Chạy <code className="font-mono">python -m eval.run_eval</code> trong thư mục backend.
        </div>
      )}

      {latest && (
        <>
          {allMock && (
            <div className="mt-5 flex gap-2.5 rounded-md bg-warning-soft px-4 py-3 text-fg">
              <IconAlert className="mt-0.5 shrink-0 text-warning" />
              <span>
                Tất cả report hiện chạy bằng <b>LLM_PROVIDER=mock</b>: số liệu chỉ chứng minh script chạy đúng,
                không phản ánh chất lượng agent. Hãy chạy lại với LLM thật.
              </span>
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Tile label="Pattern accuracy" value={pct(latest.summary.pattern_accuracy)} hint={latest.summary.pattern_correct} />
            <Tile label="Topic recall" value={pct(latest.summary.topic_recall)} hint="câu hỏi đúng chủ đề" />
            <Tile label="Estimate in range" value={latest.summary.estimate_in_range} hint="effort MVP hợp lý" />
            <Tile label="Schema success" value={pct(latest.summary.schema_success_rate)} hint="không cần retry" />
            <Tile label="Latency TB" value={`${latest.summary.avg_latency_s}s`} hint="mỗi run" />
          </div>

          <section className="rounded-lg border border-line bg-surface mt-6 p-5">
            <h2 className="mb-4 font-bold text-fg">Xu hướng qua {reports!.length} lần chạy</h2>
            <EvalTrendChart reports={reports!} />
            {reports!.length === 1 && (
              <p className="mt-2 text-sm text-subtle">Chạy thêm eval sau mỗi lần chỉnh prompt để thấy xu hướng.</p>
            )}
          </section>

          <section className="rounded-lg border border-line bg-surface mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <caption className="px-5 pt-5 text-left font-bold text-fg">Các lần chạy</caption>
              <thead>
                <tr className="border-b border-line text-sm text-subtle">
                  <th className="px-5 py-3 font-semibold">Report</th>
                  <th className="px-5 py-3 font-semibold">LLM</th>
                  <th className="px-5 py-3 font-semibold">Pattern</th>
                  <th className="px-5 py-3 font-semibold">Topic</th>
                  <th className="px-5 py-3 font-semibold">Estimate</th>
                  <th className="px-5 py-3 font-semibold">Schema</th>
                  <th className="px-5 py-3 font-semibold">Latency</th>
                </tr>
              </thead>
              <tbody>
                {[...reports!].reverse().map((r) => (
                  <tr
                    key={r.name}
                    tabIndex={0}
                    onClick={() => setSelected(r.name)}
                    onKeyDown={(e) => e.key === "Enter" && setSelected(r.name)}
                    className={`cursor-pointer border-b border-line/60 last:border-0 hover:bg-surface-2 ${
                      selected === r.name ? "bg-accent/[0.08]" : ""
                    }`}
                  >
                    <td className="px-5 py-3">
                      <span className="font-medium text-fg">{reportLabel(r)}</span>
                      <span className="ml-2 font-mono text-sm text-subtle">{r.name}</span>
                    </td>
                    <td className="px-5 py-3 font-mono text-muted">{r.provider}</td>
                    <td className="px-5 py-3 text-fg tabular-nums">{r.summary.pattern_correct}</td>
                    <td className="px-5 py-3 text-fg tabular-nums">{pct(r.summary.topic_recall)}</td>
                    <td className="px-5 py-3 text-fg tabular-nums">{r.summary.estimate_in_range}</td>
                    <td className="px-5 py-3 text-fg tabular-nums">{pct(r.summary.schema_success_rate)}</td>
                    <td className="px-5 py-3 text-fg tabular-nums">{r.summary.avg_latency_s}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-lg border border-line bg-surface mt-6 overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
              <h2 className="font-bold text-fg">Chi tiết từng case · {selected}</h2>
              <label className="flex cursor-pointer items-center gap-2 text-muted">
                <input
                  type="checkbox"
                  checked={onlyWrong}
                  onChange={(e) => setOnlyWrong(e.target.checked)}
                  className="h-4 w-4 accent-[#ff7a2f]"
                />
                Chỉ hiện case sai pattern
              </label>
            </div>
            {!detail ? (
              <p className="flex items-center gap-2 px-5 py-6 text-muted">
                <Spinner /> Đang tải…
              </p>
            ) : (
              <table className="mt-3 w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line text-sm text-subtle">
                    <th className="px-5 py-3 font-semibold">Case</th>
                    <th className="px-5 py-3 font-semibold">Kỳ vọng</th>
                    <th className="px-5 py-3 font-semibold">Agent chọn</th>
                    <th className="px-5 py-3 font-semibold">Pattern</th>
                    <th className="px-5 py-3 font-semibold">Topic</th>
                    <th className="px-5 py-3 font-semibold">MVP</th>
                    <th className="px-5 py-3 font-semibold">Estimate</th>
                    <th className="px-5 py-3 font-semibold">Bước 1 lần</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.id} className="border-b border-line/60 last:border-0">
                      <td className="px-5 py-3 font-mono text-fg">{c.id}</td>
                      <td className="px-5 py-3 text-muted">{PATTERN_LABELS[c.expected] ?? c.expected}</td>
                      <td className="px-5 py-3 text-fg">{PATTERN_LABELS[c.got] ?? c.got}</td>
                      <td className="px-5 py-3">
                        <Mark ok={c.pattern_ok} />
                      </td>
                      <td className="px-5 py-3 text-fg tabular-nums">{pct(c.topic_recall)}</td>
                      <td className="px-5 py-3 text-fg tabular-nums">{c.mvp ? `${c.mvp[0]}–${c.mvp[1]}` : "—"}</td>
                      <td className="px-5 py-3">
                        <Mark ok={c.estimate_ok} />
                      </td>
                      <td className="px-5 py-3 text-muted tabular-nums">
                        {c.steps_first_try}/{c.steps_run}
                        {c.error && <span className="ml-2 text-danger">lỗi</span>}
                      </td>
                    </tr>
                  ))}
                  {cases.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-6 text-center text-muted">
                        Không có case nào sai pattern.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  );
}
