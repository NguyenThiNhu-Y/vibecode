import { useState } from "react";
import { downloadUrl } from "../api";
import { STEP_LABELS } from "../labels";
import { STEPS, type RunStatus, type StepName } from "../types";
import { IconCheck, IconDownload, IconRefresh, IconX } from "./icons";
import { Badge, ErrorBox, Spinner, buttonClass } from "./ui";

/** Review controls for the run header: approve, request changes, re-run with feedback. */
export default function ReviewActions({
  status,
  reviewerNote,
  downloadHref,
  onReview,
  onRerun,
}: {
  status: RunStatus | null;
  reviewerNote: string | null;
  downloadHref?: string;
  onReview: (approved: boolean, note: string | null) => Promise<void>;
  onRerun?: (fromStep: StepName, feedback: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [fromStep, setFromStep] = useState<StepName>("architecture");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác không thành công.");
    } finally {
      setBusy(false);
    }
  };

  const reviewable = status === "done" || status === "rejected" || status === "approved";
  if (!reviewable) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {downloadHref && (
          <button
            type="button"
            disabled={downloading}
            onClick={() => {
              setDownloading(true);
              setError(null);
              downloadUrl(downloadHref)
                .catch((e) => setError(e instanceof Error ? e.message : "Không tải được hồ sơ."))
                .finally(() => setDownloading(false));
            }}
            className={buttonClass.secondary}
          >
            {downloading ? <Spinner /> : <IconDownload />}
            Tải trọn bộ hồ sơ
          </button>
        )}
        {status === "approved" && (
          <Badge tone="success">
            <IconCheck /> Đã duyệt{reviewerNote ? ` · ${reviewerNote}` : ""}
          </Badge>
        )}
        {status === "rejected" && (
          <Badge tone="danger">
            <IconRefresh /> Đã yêu cầu sửa{reviewerNote ? ` · ${reviewerNote}` : ""}
          </Badge>
        )}
        {status === "rejected" && onRerun && !open && (
          <button type="button" onClick={() => setOpen(true)} className={buttonClass.secondary}>
            <IconRefresh />
            Chạy lại theo góp ý
          </button>
        )}
        {status === "done" && (
          <>
            <button type="button" disabled={busy} onClick={() => setOpen((o) => !o)} className={buttonClass.secondary}>
              <IconRefresh />
              Yêu cầu sửa
            </button>
            <button type="button" disabled={busy} onClick={() => act(() => onReview(true, null))} className={buttonClass.primary}>
              {busy ? <Spinner /> : <IconCheck />}
              Duyệt
            </button>
          </>
        )}
      </div>

      {!open && error && (
        <div className="w-full">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}

      {open && (
        <div className="fade-up w-full rounded-lg border border-line bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold text-fg">Góp ý của AI dev</p>
            <button type="button" aria-label="Đóng" onClick={() => setOpen(false)} className={buttonClass.ghost}>
              <IconX />
            </button>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Ví dụ: Khách đã đồng ý dùng cloud, tính lại effort không có hệ số on-prem."
            aria-label="Góp ý"
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {onRerun && (
              <>
                <label className="flex items-center gap-2 text-sm text-muted">
                  Chạy lại từ bước
                  <select
                    value={fromStep}
                    onChange={(e) => setFromStep(e.target.value as StepName)}
                    className="rounded-md border border-line bg-surface px-2 py-1 text-fg focus:border-accent focus:outline-none"
                  >
                    {STEPS.map((s, i) => (
                      <option key={s} value={s}>
                        {i + 1}. {STEP_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy || note.trim().length < 5}
                  onClick={() => act(() => onRerun(fromStep, note.trim()))}
                  className={buttonClass.primary}
                >
                  {busy ? <Spinner /> : <IconRefresh />}
                  Chạy lại từ bước {STEPS.indexOf(fromStep) + 1}
                </button>
              </>
            )}
            {status === "done" && (
              <button type="button" disabled={busy} onClick={() => act(() => onReview(false, note.trim() || null))} className={buttonClass.danger}>
                Chỉ ghi nhận yêu cầu sửa
              </button>
            )}
          </div>
          {error && (
            <div className="mt-2">
              <ErrorBox>{error}</ErrorBox>
            </div>
          )}
        </div>
      )}
    </>
  );
}
