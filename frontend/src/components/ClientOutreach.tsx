import { useRef, useState } from "react";
import { draftClientEmail, exportUrl, importAnswers } from "../api";
import type { ScopingRun } from "../types";
import { IconDownload, IconMail, IconUpload } from "./icons";
import { CopyButton, ErrorBox, Spinner, buttonClass } from "./ui";

/** Send the clarifying questions to the customer: email draft, Q&A sheet, import answers. */
export default function ClientOutreach({
  runId,
  waiting,
  onImported,
}: {
  runId: string;
  waiting: boolean;
  onImported: (run: ScopingRun) => void;
}) {
  const [sender, setSender] = useState("");
  const [email, setEmail] = useState<{ subject: string; body: string } | null>(null);
  const [busy, setBusy] = useState<"email" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const draft = async (regenerate = false) => {
    setBusy("email");
    setError(null);
    try {
      setEmail(await draftClientEmail(runId, sender.trim() || null, regenerate));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không soạn được email.");
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy("import");
    setError(null);
    try {
      onImported(await importAnswers(runId, file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đọc được file Q&A.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 font-medium text-fg">Gửi câu hỏi cho khách:</span>
        <button type="button" disabled={busy !== null} onClick={() => draft(false)} className={buttonClass.secondary}>
          {busy === "email" ? <Spinner /> : <IconMail />}
          Soạn email gửi khách
        </button>
        <a href={exportUrl(runId, "qa_sheet.xlsx")} className={buttonClass.secondary}>
          <IconDownload />
          Tải Q&A sheet (.xlsx)
        </a>
        {waiting && (
          <>
            <button type="button" disabled={busy !== null} onClick={() => fileInput.current?.click()} className={buttonClass.secondary}>
              {busy === "import" ? <Spinner /> : <IconUpload />}
              Nhập câu trả lời từ Q&A sheet
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx"
              aria-label="File Q&A khách đã điền"
              className="hidden"
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>
      <p className="mt-1.5 text-sm text-subtle">Email và Q&A sheet viết bằng ngôn ngữ của khách. Tên khách được điền bằng code, không gửi cho LLM.</p>

      {email && (
        <div className="mt-3 rounded-md border border-line">
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
            <input
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              placeholder="Tên người gửi (chữ ký)"
              className="min-w-40 flex-1 rounded-md border border-line bg-surface px-2.5 py-1 text-fg placeholder:text-subtle focus:border-accent focus:outline-none"
            />
            <button type="button" disabled={busy !== null} onClick={() => draft(false)} className={buttonClass.ghost}>
              Cập nhật chữ ký
            </button>
            <button type="button" disabled={busy !== null} onClick={() => draft(true)} className={buttonClass.ghost}>
              Viết lại
            </button>
            <CopyButton text={`${email.subject}\n\n${email.body}`} label="Copy email" />
          </div>
          <p className="border-b border-line px-3 py-2 text-fg">
            <span className="text-subtle">Tiêu đề: </span>
            {email.subject}
          </p>
          <pre className="max-h-72 overflow-auto px-3 py-2 font-sans whitespace-pre-wrap text-muted">{email.body}</pre>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
    </div>
  );
}
