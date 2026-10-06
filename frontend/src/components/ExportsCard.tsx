import { useState } from "react";
import { downloadUrl, type ExportName } from "../api";
import type { Language } from "../types";
import { IconArchive, IconDownload, IconProposal, IconQuestion, IconSlides, IconTable } from "./icons";
import { Panel, buttonClass } from "./ui";

const ITEMS: { name: ExportName; label: string; hint: string; icon: typeof IconSlides }[] = [
  { name: "slides.pptx", label: "Slide trình bày", hint: ".pptx · sơ đồ & Gantt chỉnh sửa được", icon: IconSlides },
  { name: "proposal.docx", label: "Proposal Word", hint: ".docx · phụ lục effort, WBS, báo giá", icon: IconProposal },
  { name: "workbook.xlsx", label: "Báo giá, WBS & đáp ứng", hint: ".xlsx · có công thức", icon: IconTable },
  { name: "qa_sheet.xlsx", label: "Q&A sheet cho khách", hint: ".xlsx · ngôn ngữ của khách", icon: IconQuestion },
  { name: "bidding.xlsx", label: "Bộ bidding", hint: ".xlsx · Q&A, WBS, Summary, Master schedule", icon: IconTable },
];

const LANGS: { lang: Language; label: string }[] = [
  { lang: "vi", label: "VI" },
  { lang: "en", label: "EN" },
  { lang: "ja", label: "JA" },
];

export default function ExportsCard({
  urlFor,
  customerLanguage,
  markdownUrl,
  hasQuestions,
}: {
  urlFor: (name: ExportName, lang?: Language) => string;
  customerLanguage: Language;
  markdownUrl?: string;
  hasQuestions: boolean;
}) {
  const [lang, setLang] = useState<Language>(customerLanguage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(url: string) {
    setBusy(true);
    setError(null);
    try {
      await downloadUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title={<span id="exports-title">Bộ hồ sơ proposal</span>}
      subtitle="Tạo bằng code từ kết quả phân tích; chỉnh sửa và gửi khách sau khi duyệt."
      actions={
        <>
          <span className="text-sm text-subtle">Ngôn ngữ slide</span>
          <div className="flex rounded-md border border-line p-0.5" role="group" aria-label="Ngôn ngữ slide">
            {LANGS.map((l) => (
              <button
                key={l.lang}
                type="button"
                aria-pressed={lang === l.lang}
                onClick={() => setLang(l.lang)}
                className={`rounded px-2 py-0.5 text-sm font-medium ${lang === l.lang ? "bg-surface-2 text-fg" : "text-subtle hover:text-fg"}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => save(urlFor("package.zip", lang))}
            className={buttonClass.primary}
          >
            <IconArchive />
            {busy ? "Đang tải…" : "Tải trọn bộ (.zip)"}
          </button>
        </>
      }
      bodyClassName="p-0"
    >
      <section aria-labelledby="exports-title">
        <ul className="divide-y divide-line">
          {ITEMS.filter((i) => i.name !== "qa_sheet.xlsx" || hasQuestions).map(({ name, label, hint, icon: Icon }) => (
            <li key={name}>
              <button
                type="button"
                disabled={busy}
                onClick={() => save(urlFor(name, name === "slides.pptx" ? lang : undefined))}
                className="group flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2 disabled:opacity-50"
              >
                <Icon className="shrink-0 text-subtle" />
                <span className="font-medium text-fg">{label}</span>
                <span className="text-sm text-subtle">{hint}</span>
                <IconDownload className="ml-auto shrink-0 text-subtle group-hover:text-fg" />
              </button>
            </li>
          ))}
          {markdownUrl && (
            <li>
              <button
                type="button"
                disabled={busy}
                onClick={() => save(markdownUrl)}
                className="group flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2 disabled:opacity-50"
              >
                <IconProposal className="shrink-0 text-subtle" />
                <span className="font-medium text-fg">Proposal Markdown</span>
                <span className="text-sm text-subtle">.md · bản gốc</span>
                <IconDownload className="ml-auto shrink-0 text-subtle group-hover:text-fg" />
              </button>
            </li>
          )}
        </ul>
        {error && (
          <p className="border-t border-line px-4 py-2 text-sm text-danger">{error}</p>
        )}
        {lang !== "vi" && (
          <p className="border-t border-line px-4 py-2 text-sm text-subtle">
            Slide {lang === "ja" ? "tiếng Nhật" : "tiếng Anh"}: nhãn dịch sẵn, nội dung do LLM dịch khi tải lần đầu (được lưu lại).
          </p>
        )}
      </section>
    </Panel>
  );
}
