import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Language, ProposalResult } from "../types";
import { IconDownload, IconProposal } from "./icons";
import { Badge, Card, CopyButton, ErrorBox, Spinner, buttonClass } from "./ui";

const LANG_TABS: { lang: Language; label: string }[] = [
  { lang: "vi", label: "Tiếng Việt" },
  { lang: "en", label: "English" },
  { lang: "ja", label: "日本語" },
];

function downloadMarkdown(filename: string, markdown: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Markdown({ text }: { text: string }) {
  return (
    <article className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </article>
  );
}

export default function ProposalCard({
  data,
  filename,
  approved,
  reviewerNote,
  edited,
  translations,
  canEdit,
  onSave,
  onTranslate,
}: {
  data: ProposalResult;
  filename: string;
  approved: boolean;
  reviewerNote: string | null;
  edited: boolean;
  translations: Partial<Record<Language, string>>;
  canEdit: boolean;
  onSave?: (markdown: string, title: string | null) => Promise<void>;
  onTranslate?: (language: Language) => Promise<void>;
}) {
  const [tab, setTab] = useState<Language>(data.language);
  const [translating, setTranslating] = useState<Language | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.markdown);
  const [title, setTitle] = useState(data.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = tab === data.language ? data.markdown : translations[tab];
  const missingHeadings = ["Giả định", "Rủi ro"].filter(
    (h) => !new RegExp(`^#{1,6}[^\\n]*${h}`, "m").test(draft),
  );

  const selectTab = async (lang: Language) => {
    setTab(lang);
    setError(null);
    if (lang === data.language || translations[lang] || !onTranslate) return;
    setTranslating(lang);
    try {
      await onTranslate(lang);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không dịch được proposal.");
    } finally {
      setTranslating(null);
    }
  };

  const startEdit = () => {
    setDraft(data.markdown);
    setTitle(data.title);
    setTab(data.language);
    setEditing(true);
    setError(null);
  };

  const save = async () => {
    if (!onSave) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(draft, title.trim() || null);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được proposal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      step="proposal"
      title="Proposal nháp"
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          {data.title}
          {edited && (
            <Badge tone="info">Đã chỉnh tay</Badge>
          )}
        </span>
      }
      actions={
        !editing && (
          <>
            {canEdit && onSave && (
              <button type="button" className={buttonClass.secondary} onClick={startEdit}>
                <IconProposal />
                Chỉnh sửa
              </button>
            )}
            {shown && <CopyButton text={shown} />}
            {shown && (
              <button
                type="button"
                className={buttonClass.secondary}
                onClick={() =>
                  downloadMarkdown(
                    tab === data.language ? filename : filename.replace(/\.md$/, `_${tab}.md`),
                    shown,
                  )
                }
              >
                <IconDownload />
                Tải .md
              </button>
            )}
          </>
        )
      }
    >
      {!editing && onTranslate && (
        <div className="mb-3 flex flex-wrap items-center gap-1" role="tablist" aria-label="Ngôn ngữ proposal">
          {LANG_TABS.map(({ lang, label }) => {
            const active = tab === lang;
            const original = lang === data.language;
            return (
              <button
                key={lang}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(lang)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition ${
                  active ? "bg-surface-2 text-fg" : "text-subtle hover:text-fg"
                }`}
              >
                {translating === lang && <Spinner className="h-3.5 w-3.5" />}
                {label}
                {original && <span className="text-subtle">· gốc</span>}
              </button>
            );
          })}
          <span className="ml-2 text-sm text-subtle">Bản dịch do LLM tạo khi bấm, được lưu lại.</span>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}

      {editing ? (
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tiêu đề proposal"
            className="w-full rounded-md border border-line bg-surface px-3 py-2 font-semibold text-fg focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
          />
          <div className="grid gap-3 lg:grid-cols-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={24}
              spellCheck={false}
              aria-label="Nội dung Markdown"
              className="min-h-96 w-full resize-y rounded-md border border-line bg-surface p-3 font-mono text-sm leading-relaxed text-fg focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
            />
            <div className="max-h-[42rem] overflow-auto rounded-md border border-line bg-paper px-6 py-5 text-slate-800">
              <Markdown text={draft} />
            </div>
          </div>
          {missingHeadings.length > 0 && (
            <p className="rounded-md bg-warning-soft px-3 py-2 text-warning">
              Proposal nên có mục: {missingHeadings.join(", ")}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass.primary}
              disabled={busy || draft.trim().length < 20}
              onClick={save}
            >
              {busy && <Spinner />}
              Lưu thay đổi
            </button>
            <button type="button" className={buttonClass.secondary} onClick={() => setEditing(false)}>
              Hủy
            </button>
          </div>
        </div>
      ) : (
        <div className="relative rounded-md border border-line bg-paper px-6 py-6 text-slate-800 sm:px-10 sm:py-8">
          {approved && (
            <div className="stamp pointer-events-none absolute top-4 right-4 z-10 rounded-md border-2 border-emerald-600 bg-white/90 px-3 py-1.5 text-center text-emerald-700 sm:right-6">
              <p className="font-bold tracking-wide uppercase">Đã duyệt bởi AI dev</p>
              {reviewerNote && <p className="max-w-56 text-sm font-medium">{reviewerNote}</p>}
            </div>
          )}
          {shown ? (
            <Markdown text={shown} />
          ) : !translating ? (
            <p className="py-6 text-center text-slate-500">Chưa có bản dịch cho ngôn ngữ này.</p>
          ) : (
            <div className="space-y-3 py-6" aria-label="Đang dịch">
              <div className="h-6 w-2/3 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
