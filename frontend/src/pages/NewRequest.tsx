import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createRun, demoPackFiles, extractDocument, listDemoPacks, listReplays, uploadAttachments, type DemoPack } from "../api";
import { IconArrowRight, IconCheck, IconPaperclip, IconPlay, IconTrash, IconUpload } from "../components/icons";
import { ErrorBox, PageHeader, Panel, Spinner, buttonClass } from "../components/ui";
import { ATTACHMENT_KIND_LABELS, STEP_LABELS } from "../labels";
import { SAMPLES } from "../samples";
import { STEPS, type AttachmentKind } from "../types";

const MIN_CHARS = 30;
const MAX_CHARS = 20_000;
const MAX_FILES = 10;
const ACCEPT = ".pdf,.docx,.txt,.md,.xlsx,.csv,.zip";

interface PendingFile {
  file: File;
  kind: AttachmentKind | "auto";
}

function defaultKind(name: string): AttachmentKind | "auto" {
  const lower = name.toLowerCase();
  if (lower.endsWith(".zip")) return "source_code";
  if (/\.(pdf|docx|txt|md)$/.test(lower)) return "document";
  return "auto"; // spreadsheets: backend detects requirement list vs data sample
}

function optionsFor(name: string): (AttachmentKind | "auto")[] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".zip")) return ["source_code"];
  if (/\.(xlsx|csv)$/.test(lower)) return ["auto", "requirements", "data_sample"];
  return ["document"];
}

const input =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-fg placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none";

export default function NewRequest() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const attachInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [deal, setDeal] = useState({ project_name: "", client_name: "", due_date: "" });
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replays, setReplays] = useState<string[]>([]);
  const [packs, setPacks] = useState<DemoPack[]>([]);
  const [loadingPack, setLoadingPack] = useState<string | null>(null);

  useEffect(() => {
    listReplays()
      .then(setReplays)
      .catch(() => setReplays([]));
    listDemoPacks()
      .then(setPacks)
      .catch(() => setPacks([]));
  }, []);

  const loadPack = async (pack: DemoPack) => {
    setLoadingPack(pack.id);
    setError(null);
    setFileNote(null);
    try {
      const files = await demoPackFiles(pack);
      setText(pack.request_text);
      setDeal({ project_name: pack.project_name, client_name: pack.client_name, due_date: pack.due_date });
      setPending(files.map((file, i) => ({ file, kind: pack.files[i].kind })));
      setFileNote(`Đã nạp email và ${files.length} file đính kèm của bộ hồ sơ mẫu.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không nạp được bộ hồ sơ mẫu.");
    } finally {
      setLoadingPack(null);
    }
  };

  const length = text.trim().length;
  const tooShort = length < MIN_CHARS && pending.length === 0;
  const tooLong = text.length > MAX_CHARS;

  const insertFromFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    setFileNote(null);
    try {
      const doc = await extractDocument(file);
      setText(doc.text);
      setFileNote(`Đã đọc ${doc.filename}${doc.pages ? ` (${doc.pages} trang)` : ""}${doc.truncated ? " · đã cắt còn 20.000 ký tự đầu" : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đọc được file.");
    } finally {
      setUploading(false);
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    const bad = list.filter((f) => !/\.(pdf|docx|txt|md|xlsx|csv|zip)$/i.test(f.name));
    setError(bad.length ? `Chưa hỗ trợ: ${bad.map((f) => f.name).join(", ")}. Dùng .pdf, .docx, .txt, .md, .xlsx, .csv, .zip.` : null);
    const ok = list.filter((f) => !bad.includes(f));
    setPending((p) => [...p, ...ok.map((file) => ({ file, kind: defaultKind(file.name) }))].slice(0, MAX_FILES));
  };

  const analyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const requestText =
        text.trim().length >= MIN_CHARS
          ? text
          : `${text.trim()}\nYêu cầu chi tiết của khách nằm trong tài liệu đính kèm: ${pending.map((p) => p.file.name).join(", ")}.`.trim();
      const runId = await createRun(requestText, {
        project_name: deal.project_name.trim() || null,
        client_name: deal.client_name.trim() || null,
        due_date: deal.due_date || null,
      });
      if (pending.length) {
        await uploadAttachments(
          runId,
          pending.map((p) => p.file),
          pending.map((p) => p.kind),
        );
      }
      navigate(`/runs/${runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được hồ sơ.");
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-6">
      <PageHeader
        title="Tạo hồ sơ mới"
        subtitle="Dán email/RFP của khách và đính kèm tài liệu. ScopeAI chạy 8 bước phân tích và tạo bộ hồ sơ proposal để AI dev review."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Panel title="Thông tin hồ sơ" subtitle="Không bắt buộc. Tên khách hàng không được gửi cho LLM.">
            <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_auto]">
              <label className="block">
                <span className="mb-1 block text-sm text-muted">Tên dự án</span>
                <input value={deal.project_name} onChange={(e) => setDeal({ ...deal, project_name: e.target.value })} aria-label="Tên dự án" className={input} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-muted">Khách hàng</span>
                <input value={deal.client_name} onChange={(e) => setDeal({ ...deal, client_name: e.target.value })} aria-label="Khách hàng" className={input} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-muted">Hạn nộp proposal</span>
                <input type="date" value={deal.due_date} onChange={(e) => setDeal({ ...deal, due_date: e.target.value })} aria-label="Hạn nộp proposal" className={input} />
              </label>
            </div>
          </Panel>

          <Panel
            title="Yêu cầu của khách"
            subtitle="Tiếng Việt, tiếng Anh hoặc tiếng Nhật."
            actions={
              <>
                <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className={buttonClass.ghost}>
                  {uploading ? <Spinner /> : <IconUpload />}
                  {uploading ? "Đang đọc file…" : "Chèn nội dung từ file"}
                </button>
                <input ref={fileInput} type="file" accept=".pdf,.docx,.txt,.md" onChange={insertFromFile} className="hidden" />
              </>
            }
          >
            <label htmlFor="request" className="sr-only">
              Nội dung yêu cầu
            </label>
            <textarea
              id="request"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={9}
              placeholder="Dán email hoặc RFP của khách vào đây…"
              className={`${input} resize-y leading-relaxed`}
            />
            <div className="mt-1 flex flex-wrap justify-between gap-2 text-sm">
              {fileNote && !error ? (
                <span className="flex items-center gap-1 text-success">
                  <IconCheck /> {fileNote}
                </span>
              ) : (
                <span className={tooLong ? "text-danger" : length > 0 && tooShort ? "text-warning" : "text-subtle"}>
                  {length > 0 && tooShort ? `Cần tối thiểu ${MIN_CHARS} ký tự (hoặc đính kèm tài liệu).` : tooLong ? `Tối đa ${MAX_CHARS.toLocaleString("vi-VN")} ký tự.` : ""}
                </span>
              )}
              <span className="text-subtle tabular-nums">{text.length.toLocaleString("vi-VN")} ký tự</span>
            </div>
          </Panel>

          <Panel
            icon={<IconPaperclip />}
            title={`Tài liệu đính kèm (${pending.length}/${MAX_FILES})`}
            subtitle="Excel requirement, RFP/đặc tả (.pdf, .docx), data mẫu (.csv, .xlsx), source code (.zip). Phân tích bằng code, chỉ bản tóm tắt được gửi cho LLM."
            actions={
              <>
                <button type="button" onClick={() => attachInput.current?.click()} disabled={pending.length >= MAX_FILES} className={buttonClass.secondary}>
                  Chọn file
                </button>
                <input
                  ref={attachInput}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  aria-label="Chọn tài liệu đính kèm"
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
              </>
            }
            bodyClassName="p-0"
          >
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={`m-3 rounded-md border border-dashed px-4 py-3 text-center text-sm transition-colors ${dragging ? "border-accent bg-accent-soft text-fg" : "border-line text-subtle"}`}
            >
              Kéo thả file vào đây
            </div>
            {pending.length > 0 && (
              <ul className="divide-y divide-line border-t border-line">
                {pending.map((p, i) => (
                  <li key={`${p.file.name}-${i}`} className="flex flex-wrap items-center gap-3 px-4 py-2">
                    <span className="min-w-0 flex-1 truncate text-fg">{p.file.name}</span>
                    <span className="text-sm text-subtle">{Math.ceil(p.file.size / 1024)} KB</span>
                    <select
                      value={p.kind}
                      aria-label={`Loại file ${p.file.name}`}
                      onChange={(e) => setPending((list) => list.map((x, j) => (j === i ? { ...x, kind: e.target.value as PendingFile["kind"] } : x)))}
                      className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none"
                    >
                      {optionsFor(p.file.name).map((k) => (
                        <option key={k} value={k}>
                          {k === "auto" ? "Tự nhận diện" : ATTACHMENT_KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label={`Gỡ ${p.file.name}`}
                      onClick={() => setPending((list) => list.filter((_, j) => j !== i))}
                      className="rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-danger"
                    >
                      <IconTrash />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {error && <ErrorBox>{error}</ErrorBox>}

          <div className="flex justify-end">
            <button type="button" onClick={analyze} disabled={tooShort || tooLong || loading} className={`${buttonClass.primary} px-5 py-2`}>
              {loading ? <Spinner /> : null}
              {loading ? "Đang tạo…" : "Phân tích"}
              {!loading && <IconArrowRight />}
            </button>
          </div>
        </div>

        <aside className="space-y-4">
          {packs.length > 0 && (
            <Panel title="Bộ hồ sơ RFP mẫu" subtitle="Email + tài liệu đính kèm như khách gửi thật (giả lập)." bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {packs.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={loadingPack !== null}
                      onClick={() => loadPack(p)}
                      className={`flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-2 ${text === p.request_text ? "bg-accent-soft" : ""}`}
                    >
                      <span className="rounded bg-surface-2 px-1.5 font-mono text-xs text-muted">{p.lang}</span>
                      <span className="min-w-0 flex-1 text-fg">{p.label}</span>
                      {loadingPack === p.id ? <Spinner /> : <span className="text-sm text-subtle">{p.outcome}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Dùng mẫu" subtitle="Dữ liệu giả lập để thử nhanh." bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {SAMPLES.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setText(s.text);
                      setError(null);
                      setFileNote(null);
                    }}
                    className={`flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-2 ${text === s.text ? "bg-accent-soft" : ""}`}
                  >
                    <span className="rounded bg-surface-2 px-1.5 font-mono text-xs text-muted">{s.lang}</span>
                    <span className="min-w-0 flex-1 text-fg">{s.label}</span>
                    <span className="text-sm text-subtle">{s.outcome}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Quy trình phân tích">
            <ol className="space-y-1 text-sm">
              {STEPS.map((step, i) => (
                <li key={step} className="flex gap-2 text-muted">
                  <span className="w-4 text-right font-mono text-subtle">{i + 1}</span>
                  {STEP_LABELS[step]}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-sm text-subtle">Effort, timeline và báo giá được tính bằng code; LLM không tự đặt con số.</p>
          </Panel>

          {replays.length > 0 && (
            <Panel title="Replay (demo offline)" bodyClassName="p-0">
              <ul className="divide-y divide-line">
                {replays.map((name) => (
                  <li key={name}>
                    <Link to={`/replay/${name}`} className="flex items-center gap-2 px-4 py-2 text-fg hover:bg-surface-2">
                      <IconPlay className="text-subtle" />
                      {name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </main>
  );
}
