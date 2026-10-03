import { useEffect, useState } from "react";
import { approvePricing, createVersion, getBid, markVersionSent, saveBid } from "../api";
import { BID_RECOMMENDATION, PATTERN_LABELS, formatDateTime, formatMoney } from "../labels";
import type { BidEvaluation, PricingApproval, ProposalVersion, Quotation, RunStatus, ScopingRun } from "../types";
import { IconArchive, IconCheck, IconChecklist, IconShield, IconX } from "./icons";
import { Badge, Callout, ErrorBox, Panel, Spinner, buttonClass } from "./ui";

type Choice = boolean | null;

function Verdict({ value }: { value: Choice }) {
  if (value === true) return <Badge tone="success">Đạt</Badge>;
  if (value === false) return <Badge tone="danger">Không đạt</Badge>;
  return <Badge>Chưa rõ</Badge>;
}

function TriState({ value, onChange, label }: { value: Choice; onChange: (v: Choice) => void; label: string }) {
  const options: { v: Choice; text: string }[] = [
    { v: true, text: "Đạt" },
    { v: false, text: "Không" },
    { v: null, text: "Theo gợi ý" },
  ];
  return (
    <div className="flex rounded-md border border-line p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
          className={`rounded px-2 py-0.5 text-sm whitespace-nowrap ${value === o.v ? "bg-surface-2 font-medium text-fg" : "text-subtle hover:text-fg"}`}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

function BidPanel({ runId, refreshKey, onDecided }: { runId: string; refreshKey: string; onDecided: () => void }) {
  const [data, setData] = useState<BidEvaluation | null>(null);
  const [checks, setChecks] = useState<Record<string, Choice>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (result: BidEvaluation) => {
    setData(result);
    setChecks(Object.fromEntries(result.criteria.map((c) => [c.id, c.value])));
    setNote(result.note ?? "");
  };

  useEffect(() => {
    getBid(runId)
      .then(apply)
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được Bid/No-bid."));
  }, [runId, refreshKey]);

  const submit = async (decision: "bid" | "no_bid" | null) => {
    setBusy(true);
    setError(null);
    try {
      apply(await saveBid(runId, { checks, decision, note: note.trim() || null }));
      onDecided();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được.");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <ErrorBox>{error}</ErrorBox> : <Spinner />;
  // Preview the score with unsaved choices so the presales sees the effect immediately.
  const total = data.criteria.reduce((s, c) => s + c.weight, 0) || 1;
  const effective = (id: string, suggested: Choice) => (checks[id] ?? null) !== null ? checks[id] : suggested;
  const met = data.criteria.reduce((s, c) => s + (effective(c.id, c.suggested) === true ? c.weight : 0), 0);
  const score = Math.round((met / total) * 100);
  const rec = BID_RECOMMENDATION[data.recommendation];
  const dirty = data.criteria.some((c) => (checks[c.id] ?? null) !== c.value) || (note.trim() || null) !== data.note;

  return (
    <Panel
      icon={<IconChecklist />}
      title={
        <span className="flex flex-wrap items-center gap-2">
          Bid / No-bid
          {data.decision && (
            <Badge tone={data.decision === "bid" ? "success" : "neutral"}>
              {data.decision === "bid" ? "Đã quyết định tham gia" : "Đã quyết định không tham gia"}
            </Badge>
          )}
        </span>
      }
      subtitle="Code gợi ý các tiêu chí đo được từ kết quả phân tích; presales xác nhận và tự đánh giá phần còn lại. Tiêu chí sửa ở Cài đặt."
      bodyClassName="p-0"
    >
      <div className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-3">
        <div className="min-w-[200px] flex-1">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-subtle">Điểm phù hợp (theo trọng số)</span>
            <span className="font-semibold text-fg tabular-nums">{score}/100</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`bar-grow h-full rounded-full ${score >= 70 ? "bg-success" : score >= 50 ? "bg-warning" : "bg-danger"}`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
        <div className="text-sm">
          <span className="text-subtle">Khuyến nghị (đã lưu): </span>
          <Badge tone={rec.tone}>{rec.label}</Badge>
          <span className="ml-2 text-subtle">đã đánh giá {data.answered}% trọng số</span>
        </div>
      </div>
      <ul className="divide-y divide-line">
        {data.criteria.map((c) => (
          <li key={c.id} className="grid gap-2 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <p className="font-medium text-fg">
                {c.label} <span className="text-sm font-normal text-subtle">· trọng số {c.weight}</span>
              </p>
              <p className="flex flex-wrap items-center gap-1.5 text-sm text-subtle">
                {c.auto ? (
                  <>
                    Gợi ý: <Verdict value={c.suggested} /> {c.reason}
                  </>
                ) : (
                  "Presales tự đánh giá"
                )}
              </p>
            </div>
            <TriState label={c.label} value={checks[c.id] ?? null} onChange={(v) => setChecks((s) => ({ ...s, [c.id]: v }))} />
          </li>
        ))}
      </ul>
      <div className="space-y-2 border-t border-line px-4 py-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Ghi chú quyết định (đối thủ, quan hệ khách hàng, nguồn lực…)"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg focus:border-accent focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => submit("bid")} className={buttonClass.success}>
            <IconCheck /> Tham gia (Bid)
          </button>
          <button type="button" disabled={busy} onClick={() => submit("no_bid")} className={buttonClass.danger}>
            <IconX /> Không tham gia
          </button>
          <button type="button" disabled={busy || !dirty} onClick={() => submit(data.decision)} className={buttonClass.secondary}>
            Lưu đánh giá
          </button>
          {busy && <Spinner />}
          {data.decided_at && <span className="text-sm text-subtle">Quyết định lúc {formatDateTime(data.decided_at)}</span>}
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Panel>
  );
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${done ? "bg-success text-white dark:text-[#0b1f17]" : "bg-surface-2 text-muted"}`}
      >
        {done ? <IconCheck /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-fg">{title}</p>
        <div className="text-sm text-muted">{children}</div>
      </div>
    </li>
  );
}

function ApprovalPanel({
  runId,
  status,
  reviewerNote,
  quotation,
  approval,
  onRun,
}: {
  runId: string;
  status: RunStatus | null;
  reviewerNote: string | null;
  quotation: Quotation | null;
  approval: PricingApproval | null;
  onRun: (run: ScopingRun) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const technical = status === "approved";
  const priced = !quotation || Boolean(approval?.approved);
  const finished = status === "done" || status === "approved" || status === "rejected";

  const decide = async (approved: boolean) => {
    setBusy(true);
    setError(null);
    try {
      onRun(await approvePricing(runId, approved, note.trim() || null));
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel icon={<IconShield />} title="Phê duyệt 2 cấp" subtitle="Hồ sơ chỉ chuyển sang “Sẵn sàng gửi” khi đủ cả duyệt kỹ thuật và duyệt giá.">
      <ol className="space-y-4">
        <Step n={1} done={technical} title="Duyệt kỹ thuật (AI dev)">
          {technical
            ? "Đã duyệt giải pháp, kiến trúc và effort."
            : status === "rejected"
              ? `Yêu cầu sửa: ${reviewerNote ?? ""}`
              : "Dùng nút Duyệt / Yêu cầu sửa ở đầu trang sau khi xem các tab."}
        </Step>
        <Step n={2} done={priced && Boolean(quotation)} title="Duyệt giá (Delivery manager)">
          {!quotation ? (
            "Hồ sơ không có báo giá nên không cần bước này."
          ) : approval ? (
            <p>
              {approval.approved ? "Đã duyệt giá" : "Yêu cầu sửa giá"} lúc {formatDateTime(approval.at)}
              {approval.note && <span className="text-subtle"> · {approval.note}</span>}
              <br />
              Tổng hiện tại: <b className="text-fg">{formatMoney(quotation.total, quotation.currency)}</b>
            </p>
          ) : (
            <p>
              Kiểm tra mô hình hợp đồng, đơn giá, overhead và dự phòng ở tab Kế hoạch & báo giá. Tổng:{" "}
              <b className="text-fg">{formatMoney(quotation.total, quotation.currency)}</b>
            </p>
          )}
          {quotation && finished && (
            <div className="mt-2 space-y-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={approval?.approved ? "Lý do hủy duyệt giá" : "Ghi chú (bắt buộc khi yêu cầu sửa giá)"}
                className="w-full max-w-lg rounded-md border border-line bg-surface px-3 py-1.5 text-fg focus:border-accent focus:outline-none"
              />
              <div className="flex flex-wrap gap-2">
                {!approval?.approved && (
                  <button type="button" disabled={busy} onClick={() => decide(true)} className={buttonClass.success}>
                    <IconCheck /> Duyệt giá
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy || !note.trim()}
                  onClick={() => decide(false)}
                  className={buttonClass.danger}
                >
                  {approval?.approved ? "Hủy duyệt giá" : "Yêu cầu sửa giá"}
                </button>
                {busy && <Spinner />}
              </div>
            </div>
          )}
        </Step>
        <Step n={3} done={technical && priced} title="Sẵn sàng gửi khách">
          {technical && priced ? "Chốt phiên bản bên dưới rồi gửi khách." : "Chờ đủ hai bước duyệt."}
        </Step>
      </ol>
      {error && (
        <div className="mt-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
    </Panel>
  );
}

function VersionsPanel({
  runId,
  versions,
  ready,
  onRun,
}: {
  runId: string;
  versions: ProposalVersion[];
  ready: boolean;
  onRun: (run: ScopingRun) => void;
}) {
  const [note, setNote] = useState("");
  const [major, setMajor] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = versions.at(-1)?.version;
  const [high, low] = (last ?? "0.0").split(".").map(Number);
  const next = !last ? "1.0" : major ? `${high + 1}.0` : `${high}.${low + 1}`;

  const run = async (action: () => Promise<ScopingRun>) => {
    setBusy(true);
    setError(null);
    try {
      onRun(await action());
      setNote("");
      setMajor(false);
      setSent(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      icon={<IconArchive />}
      title="Phiên bản gửi khách"
      subtitle={`Mỗi lần gửi khách nên chốt một phiên bản. Tên file xuất dùng phiên bản mới nhất (hiện tại: v${last ?? "0.1 – bản nháp"}).`}
      bodyClassName="p-0"
    >
      {versions.length > 0 && (
        <ul className="divide-y divide-line border-b border-line">
          {[...versions].reverse().map((v) => (
            <li key={v.version} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono font-semibold text-fg">v{v.version}</span>
                <span className="text-sm text-subtle">{formatDateTime(v.created_at)}</span>
                {v.pattern && <Badge tone="accent">{PATTERN_LABELS[v.pattern].split(" –")[0]}</Badge>}
                {v.total !== null && v.currency && <span className="text-sm text-fg tabular-nums">{formatMoney(v.total, v.currency)}</span>}
                <span className="ml-auto">
                  {v.sent ? (
                    <Badge tone="success">Đã gửi{v.sent_at ? ` ${formatDateTime(v.sent_at)}` : ""}</Badge>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => markVersionSent(runId, v.version, true))}
                      className={`${buttonClass.secondary} px-2 py-0.5 text-sm`}
                    >
                      Đánh dấu đã gửi
                    </button>
                  )}
                </span>
              </div>
              {v.note && <p className="mt-0.5 text-sm text-muted">{v.note}</p>}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2 px-4 py-3">
        {!ready && (
          <Callout tone="warning">Hồ sơ chưa đủ hai bước duyệt. Vẫn có thể chốt phiên bản nội bộ, nhưng chưa nên gửi khách.</Callout>
        )}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ghi chú phiên bản (ví dụ: cập nhật theo phản hồi ngày 05/10)"
          className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-fg focus:border-accent focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {last && (
            <label className="flex items-center gap-1.5 text-muted">
              <input type="checkbox" checked={major} onChange={(e) => setMajor(e.target.checked)} className="accent-[var(--accent)]" />
              Thay đổi lớn (lên v{high + 1}.0)
            </label>
          )}
          <label className="flex items-center gap-1.5 text-muted">
            <input type="checkbox" checked={sent} onChange={(e) => setSent(e.target.checked)} className="accent-[var(--accent)]" />
            Đã gửi khách
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => createVersion(runId, { note: note.trim() || null, major, sent }))}
            className={buttonClass.primary}
          >
            Chốt phiên bản v{next}
          </button>
          {busy && <Spinner />}
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Panel>
  );
}

export default function ProcessTab({
  runId,
  status,
  reviewerNote,
  quotation,
  approval,
  versions,
  hasProposal,
  refreshKey,
  onRun,
  onReload,
}: {
  runId: string;
  status: RunStatus | null;
  reviewerNote: string | null;
  quotation: Quotation | null;
  approval: PricingApproval | null;
  versions: ProposalVersion[];
  hasProposal: boolean;
  refreshKey: string;
  onRun: (run: ScopingRun) => void;
  onReload: () => void;
}) {
  const ready = status === "approved" && (!quotation || Boolean(approval?.approved));
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <BidPanel runId={runId} refreshKey={refreshKey} onDecided={onReload} />
      <div className="space-y-4">
        <ApprovalPanel
          runId={runId}
          status={status}
          reviewerNote={reviewerNote}
          quotation={quotation}
          approval={approval}
          onRun={onRun}
        />
        {hasProposal && <VersionsPanel runId={runId} versions={versions} ready={ready} onRun={onRun} />}
      </div>
    </div>
  );
}
