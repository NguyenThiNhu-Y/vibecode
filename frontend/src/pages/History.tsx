import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getStats, listRuns } from "../api";
import { DueBadge } from "../components/DealMeta";
import { IconPlus } from "../components/icons";
import { Badge, ErrorBox, PageHeader, Spinner, Stat, StatusPill, buttonClass } from "../components/ui";
import { DEAL_STAGES, DEAL_STAGE_LABELS, DEAL_STAGE_TONE, PATTERN_LABELS, formatDateTime, formatMoney } from "../labels";
import type { DealStage, RunSummary, SolutionPattern, Stats } from "../types";

type SortKey = "created" | "due";

export default function History() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<DealStage | "all">("all");
  const [pattern, setPattern] = useState<SolutionPattern | "all">("all");
  const [sort, setSort] = useState<SortKey>("created");

  useEffect(() => {
    listRuns(200)
      .then(setRuns)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được lịch sử."));
    getStats().then(setStats).catch(() => setStats(null));
  }, []);

  const toggle = (id: string) =>
    setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(-2)));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (runs ?? []).filter(
      (r) =>
        (stage === "all" || r.deal_stage === stage) &&
        (pattern === "all" || r.pattern === pattern) &&
        (!q || [r.id, r.project_name, r.client_name, r.business_goal].some((v) => v?.toLowerCase().includes(q))),
    );
    if (sort === "due") {
      return [...list].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
    }
    return list;
  }, [runs, query, stage, pattern, sort]);

  const patterns = useMemo(
    () => [...new Set((runs ?? []).map((r) => r.pattern).filter((p): p is SolutionPattern => Boolean(p)))],
    [runs],
  );
  const select = "rounded-md border border-line bg-surface px-2.5 py-1.5 text-fg focus:border-accent focus:outline-none";

  return (
    <main className="mx-auto max-w-7xl px-6 py-6">
      <PageHeader
        title="Hồ sơ presales"
        subtitle="Theo dõi hạn nộp, giai đoạn deal và kết quả phân tích của từng hồ sơ."
        actions={
          <>
            <button
              type="button"
              disabled={selected.length !== 2}
              onClick={() => navigate(`/compare?a=${selected[0]}&b=${selected[1]}`)}
              className={buttonClass.secondary}
              title="Chọn 2 hồ sơ trong bảng để so sánh"
            >
              So sánh {selected.length}/2
            </button>
            <Link to="/" className={buttonClass.primary}>
              <IconPlus />
              Tạo hồ sơ
            </Link>
          </>
        }
      />

      {stats && stats.runs > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Tổng hồ sơ" value={stats.runs} hint={`${stats.finished} đã có proposal`} />
          <Stat label="Đang hỏi khách" value={stats.stages.clarifying} />
          <Stat label="Chờ duyệt" value={stats.stages.reviewing} hint={`${stats.stages.ready} sẵn sàng gửi`} />
          <Stat
            label="Tỉ lệ thắng"
            value={stats.win_rate === null ? "—" : `${Math.round(stats.win_rate * 100)}%`}
            hint={`${stats.stages.won} thắng · ${stats.stages.lost} thua`}
          />
          <Stat label="Giờ tiết kiệm (ước tính)" value={`≈ ${stats.hours_saved}`} hint={`so với ${stats.manual_hours_per_proposal} giờ/hồ sơ làm tay`} tone="success" />
        </div>
      )}

      {runs && runs.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo dự án, khách hàng, mục tiêu, mã…"
            aria-label="Tìm kiếm hồ sơ"
            className="min-w-60 flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-fg placeholder:text-subtle focus:border-accent focus:outline-none"
          />
          <select value={stage} onChange={(e) => setStage(e.target.value as DealStage | "all")} aria-label="Lọc giai đoạn" className={select}>
            <option value="all">Mọi giai đoạn</option>
            {DEAL_STAGES.map((s) => (
              <option key={s} value={s}>
                {DEAL_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          <select value={pattern} onChange={(e) => setPattern(e.target.value as SolutionPattern | "all")} aria-label="Lọc hướng giải pháp" className={select}>
            <option value="all">Mọi hướng giải pháp</option>
            {patterns.map((p) => (
              <option key={p} value={p}>
                {PATTERN_LABELS[p]}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sắp xếp" className={select}>
            <option value="created">Mới nhất trước</option>
            <option value="due">Hạn nộp gần nhất</option>
          </select>
        </div>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}
      {!runs && !error && (
        <p className="flex items-center gap-2 text-muted">
          <Spinner /> Đang tải…
        </p>
      )}
      {runs && runs.length === 0 && (
        <div className="rounded-lg border border-dashed border-line bg-surface p-10 text-center text-muted">
          Chưa có hồ sơ nào.{" "}
          <Link to="/" className="font-medium text-accent-strong underline">
            Tạo hồ sơ đầu tiên
          </Link>
        </div>
      )}
      {runs && runs.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead className="bg-surface-2 text-sm text-subtle">
              <tr>
                <th className="w-10 py-2 pl-4">
                  <span className="sr-only">Chọn để so sánh</span>
                </th>
                <th className="px-3 py-2 font-medium">Dự án / khách hàng</th>
                <th className="px-3 py-2 font-medium">Mục tiêu</th>
                <th className="px-3 py-2 font-medium">Hướng giải pháp</th>
                <th className="px-3 py-2 text-right font-medium">Báo giá</th>
                <th className="px-3 py-2 font-medium">Hạn nộp</th>
                <th className="px-3 py-2 font-medium">Giai đoạn</th>
                <th className="px-3 py-2 font-medium">Phân tích</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((run) => (
                <tr
                  key={run.id}
                  tabIndex={0}
                  onClick={() => navigate(`/runs/${run.id}`)}
                  onKeyDown={(e) => e.key === "Enter" && navigate(`/runs/${run.id}`)}
                  className="cursor-pointer align-top hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
                >
                  <td className="py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Chọn hồ sơ ${run.id} để so sánh`}
                      checked={selected.includes(run.id)}
                      onChange={() => toggle(run.id)}
                      className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block font-medium text-fg">{run.project_name || <span className="font-normal text-subtle italic">Chưa đặt tên</span>}</span>
                    <span className="block text-sm text-muted">{run.client_name ?? "—"}</span>
                    <span className="font-mono text-xs text-subtle">
                      #{run.id} · {formatDateTime(run.created_at)}
                    </span>
                  </td>
                  <td className="max-w-sm px-3 py-2.5 text-muted">
                    <span className="line-clamp-2">{run.business_goal ?? <span className="text-subtle italic">Chưa rõ</span>}</span>
                  </td>
                  <td className="px-3 py-2.5 text-fg">{run.pattern ? PATTERN_LABELS[run.pattern].split(" –")[0] : <span className="text-subtle">—</span>}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap text-fg tabular-nums">
                    {run.quote_total !== null && run.quote_currency ? formatMoney(run.quote_total, run.quote_currency) : "—"}
                  </td>
                  <td className="px-3 py-2.5">{run.due_date ? <DueBadge due={run.due_date} /> : <span className="text-subtle">—</span>}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={DEAL_STAGE_TONE[run.deal_stage]}>{DEAL_STAGE_LABELS[run.deal_stage]}</Badge>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <StatusPill status={run.status} />
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">
                    Không có hồ sơ khớp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
