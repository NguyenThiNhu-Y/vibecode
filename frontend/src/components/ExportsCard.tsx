import { useState } from "react";
import { type ExportName } from "../api";
import type { Language } from "../types";
import { IconArchive, IconDownload, IconProposal, IconQuestion, IconSlides, IconTable } from "./icons";
import { Panel, buttonClass } from "./ui";

const ITEMS: { name: ExportName; label: string; hint: string; icon: typeof IconSlides }[] = [
  { name: "slides.pptx", label: "Slide trình bày", hint: ".pptx · sơ đồ & Gantt chỉnh sửa được", icon: IconSlides },
  { name: "proposal.docx", label: "Proposal Word", hint: ".docx · phụ lục effort, WBS, báo giá", icon: IconProposal },
  { name: "workbook.xlsx", label: "Báo giá, WBS & đáp ứng", hint: ".xlsx · có công thức", icon: IconTable },
  { name: "qa_sheet.xlsx", label: "Q&A sheet cho khách", hint: ".xlsx · ngôn ngữ của khách", icon: IconQuestion },
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
          <a href={urlFor("package.zip", lang)} className={buttonClass.primary}>
            <IconArchive />
            Tải trọn bộ (.zip)
          </a>
        </>
      }
      bodyClassName="p-0"
    >
      <section aria-labelledby="exports-title">
        <ul className="divide-y divide-line">
          {ITEMS.filter((i) => i.name !== "qa_sheet.xlsx" || hasQuestions).map(({ name, label, hint, icon: Icon }) => (
            <li key={name}>
              <a href={urlFor(name, name === "slides.pptx" ? lang : undefined)} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                <Icon className="shrink-0 text-subtle" />
                <span className="font-medium text-fg">{label}</span>
                <span className="text-sm text-subtle">{hint}</span>
                <IconDownload className="ml-auto shrink-0 text-subtle group-hover:text-fg" />
              </a>
            </li>
          ))}
          {markdownUrl && (
            <li>
              <a href={markdownUrl} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                <IconProposal className="shrink-0 text-subtle" />
                <span className="font-medium text-fg">Proposal Markdown</span>
                <span className="text-sm text-subtle">.md · bản gốc</span>
                <IconDownload className="ml-auto shrink-0 text-subtle group-hover:text-fg" />
              </a>
            </li>
          )}
        </ul>
        {lang !== "vi" && (
          <p className="border-t border-line px-4 py-2 text-sm text-subtle">
            Slide {lang === "ja" ? "tiếng Nhật" : "tiếng Anh"}: nhãn dịch sẵn, nội dung do LLM dịch khi tải lần đầu (được lưu lại).
          </p>
        )}
      </section>
    </Panel>
  );
}
