// Company standards on the Settings page: profile & naming, templates, content library,
// case studies and bid/no-bid criteria. Everything is validated again by the backend.
import { useEffect, useRef, useState } from "react";
import {
  deleteLogo,
  deleteTemplate,
  downloadUrl,
  getTemplates,
  logoUrl,
  saveBidCriteria,
  saveCaseStudies,
  saveCompany,
  saveContentLibrary,
  saveTemplateConfig,
  setActiveTemplate,
  templateFileUrl,
  uploadLogo,
  uploadTemplate,
} from "../api";
import { Field, ListPicker, SaveBar, input, num, section, useSaver } from "../components/form";
import { IconDownload, IconPlus, IconTrash, IconUpload } from "../components/icons";
import { Badge, Callout, ErrorBox, Spinner, buttonClass, eyebrow } from "../components/ui";
import { LANGUAGE_LABELS, MARKET_LABELS, PATTERN_LABELS, formatDateTime } from "../labels";
import type {
  BidAutoRule,
  BidCriterion,
  CaseStudy,
  CompanyProfile,
  ContentBlock,
  Language,
  LogoInfo,
  Market,
  SheetMapping,
  TemplateKind,
  TemplatesPayload,
  TemplateSource,
} from "../types";

const LANGS: Language[] = ["vi", "en", "ja"];
const PLACEHOLDERS = [
  "company_name",
  "company_short",
  "company_logo",
  "client_name",
  "project_name",
  "proposal_title",
  "date",
  "version",
  "confidential_footer",
];

// ---------- company ----------
function LogoSection({ initial }: { initial: LogoInfo | null }) {
  const [logo, setLogo] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement | null>(null);

  const act = async (action: () => Promise<{ logo: LogoInfo | null }>) => {
    setBusy(true);
    setError(null);
    try {
      setLogo((await action()).logo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được logo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={section}>
      <div className="flex flex-wrap items-start gap-5">
        {/* white like the slide card it lands on, in both themes */}
        <div className="flex h-24 w-56 shrink-0 items-center justify-center rounded-md border border-line bg-white p-3">
          {logo ? (
            <img src={logoUrl(logo.uploaded_at)} alt="Logo công ty" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-sm text-gray-500">Chưa có logo</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="font-semibold text-fg">Logo công ty</h2>
          <p className="text-sm text-muted">
            Hiện trên bìa và góc phải mỗi slide, header file Word; template riêng đặt ô chữ{" "}
            <code className="rounded bg-surface-2 px-1 text-xs">{"{{company_logo}}"}</code> ở chỗ muốn có logo. PNG nền trong suốt
            hoặc JPG, tối đa 2 MB; logo ngang hiển thị đẹp nhất. Lưu ngay khi tải lên.
          </p>
          {logo && (
            <p className="text-sm text-subtle tabular-nums">
              {logo.width}×{logo.height} px · {(logo.size / 1024).toFixed(0)} KB · {formatDateTime(logo.uploaded_at)}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              ref={file}
              type="file"
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                e.target.value = "";
                if (picked) act(() => uploadLogo(picked));
              }}
            />
            <button type="button" disabled={busy} onClick={() => file.current?.click()} className={buttonClass.secondary}>
              {busy ? <Spinner /> : <IconUpload />}
              {logo ? "Thay logo" : "Tải logo lên"}
            </button>
            {logo && (
              <button type="button" disabled={busy} onClick={() => act(deleteLogo)} className={buttonClass.danger}>
                <IconTrash /> Xóa logo
              </button>
            )}
          </div>
          {error && <ErrorBox>{error}</ErrorBox>}
        </div>
      </div>
    </section>
  );
}

export function CompanyTab({ initial, logo }: { initial: CompanyProfile; logo: LogoInfo | null }) {
  const [company, setCompany] = useState(initial);
  const saver = useSaver();
  const set = (patch: Partial<CompanyProfile>) => setCompany((c) => ({ ...c, ...patch }));
  const example = company.file_naming
    .replace("{company}", company.short_name || "ABC")
    .replace("{client}", "Ngân-hàng-XYZ")
    .replace("{project}", "Trợ-lý-quy-định")
    .replace("{doc}", "Proposal")
    .replace("{version}", "1.0")
    .replace("{date}", "20261003");
  return (
    <div className="space-y-6">
      <LogoSection initial={logo} />
      <section className={`${section} grid gap-4 md:grid-cols-2`}>
        <Field label="Tên công ty (hiện trên slide, Word, Excel)">
          <input className={input} value={company.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Tên viết tắt (thay logo khi chưa tải logo, tên file)">
          <input className={input} value={company.short_name} onChange={(e) => set({ short_name: e.target.value })} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Dòng bảo mật ở chân trang">
            <input
              className={input}
              value={company.confidential_footer}
              onChange={(e) => set({ confidential_footer: e.target.value })}
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field
            label="Quy tắc đặt tên file xuất"
            hint={
              <>
                Dùng {"{company} {client} {project} {doc} {version} {date}"}; bắt buộc có {"{doc}"}. Ví dụ:{" "}
                <span className="font-mono text-fg">{example}.docx</span>
              </>
            }
          >
            <input
              className={`${input} font-mono text-sm`}
              value={company.file_naming}
              onChange={(e) => set({ file_naming: e.target.value })}
            />
          </Field>
        </div>
      </section>
      <SaveBar {...saver} onSave={() => saver.run(async () => setCompany(await saveCompany(company)))} />
    </div>
  );
}

// ---------- templates ----------
const KIND_INFO: Record<TemplateKind, { title: string; hint: string; accept: string }> = {
  slides: {
    title: "Slide proposal (PowerPoint)",
    hint: "Dùng layout “Title Slide” cho bìa và layout nội dung (mặc định “Title Only”). Ô chữ {{SCOPEAI_CONTENT}} trên layout đánh dấu vùng vẽ bảng/sơ đồ; ô chữ {{company_logo}} được thay bằng logo công ty.",
    accept: ".pptx",
  },
  proposal_docx: {
    title: "Proposal (Word)",
    hint: "Giữ header/footer, trang bìa và style Heading của template. Đoạn {{SCOPEAI_BODY}} đánh dấu chỗ chèn nội dung proposal; chữ {{company_logo}} (thường đặt ở header) được thay bằng logo.",
    accept: ".docx",
  },
  workbook: {
    title: "Ước tính & báo giá (Excel)",
    hint: "Điền WBS và dòng báo giá vào sheet/cột theo cấu hình bên dưới; công thức tổng của template được giữ nguyên.",
    accept: ".xlsx",
  },
  qa_sheet: {
    title: "Danh sách câu hỏi Q&A (Excel)",
    hint: "Điền câu hỏi vào sheet/cột theo cấu hình; file khách trả lời được đọc lại theo cùng cấu hình.",
    accept: ".xlsx",
  },
};
const SOURCE_LABELS: Record<TemplateSource, string> = {
  builtin: "Mẫu ScopeAI",
  sample: "Template công ty mẫu",
  custom: "Template riêng (upload)",
};
const MAPPING_LABELS: Record<string, string> = {
  id: "ID",
  num: "STT",
  phase: "Giai đoạn",
  task: "Đầu việc",
  role: "Vai trò",
  person_days: "Ngày công",
  start_week: "Tuần bắt đầu",
  end_week: "Tuần kết thúc",
  day_rate: "Đơn giá",
  amount: "Thành tiền",
  topic: "Chủ đề",
  question: "Câu hỏi",
  why: "Lý do hỏi",
  blocking: "Bắt buộc",
  answer: "Câu trả lời",
};

function MappingEditor({ title, value, onChange }: { title: string; value: SheetMapping; onChange: (m: SheetMapping) => void }) {
  return (
    <div className="rounded-md border border-line p-3">
      <p className="mb-2 font-medium text-fg">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tên sheet">
          <input className={input} value={value.sheet} onChange={(e) => onChange({ ...value, sheet: e.target.value })} />
        </Field>
        <Field label="Dòng bắt đầu">
          <input
            type="number"
            min={1}
            className={num}
            value={value.start_row}
            onChange={(e) => onChange({ ...value, start_row: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Object.entries(value.columns).map(([key, col]) => (
          <Field key={key} label={MAPPING_LABELS[key] ?? key}>
            <input
              className={`${input} text-center font-mono uppercase`}
              value={col}
              maxLength={3}
              onChange={(e) => onChange({ ...value, columns: { ...value.columns, [key]: e.target.value.toUpperCase() } })}
              aria-label={`Cột ${MAPPING_LABELS[key] ?? key}`}
            />
          </Field>
        ))}
      </div>
    </div>
  );
}

export function TemplatesTab() {
  const [data, setData] = useState<TemplatesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<TemplateKind | null>(null);
  const [notes, setNotes] = useState<Partial<Record<TemplateKind, string[]>>>({});
  const files = useRef<Partial<Record<TemplateKind, HTMLInputElement | null>>>({});
  const saver = useSaver();

  useEffect(() => {
    getTemplates()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được template."));
  }, []);

  const act = async (kind: TemplateKind, action: () => Promise<TemplatesPayload>) => {
    setBusy(kind);
    setError(null);
    try {
      const result = await action();
      setData(result);
      setNotes((n) => ({ ...n, [kind]: result.warnings ?? [] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được template.");
    } finally {
      setBusy(null);
    }
  };

  const download = (url: string) =>
    downloadUrl(url).catch((e) => setError(e instanceof Error ? e.message : "Không tải được template."));

  if (!data) return error ? <ErrorBox>{error}</ErrorBox> : <Spinner />;
  const cfg = data.config;
  const setCfg = (patch: Partial<typeof cfg>) => setData((d) => (d ? { ...d, config: { ...d.config, ...patch } } : d));

  return (
    <div className="space-y-6">
      <Callout tone="info">
        <p>
          Hồ sơ xuất ra (slide, Word, Excel) đi theo <b>template của công ty</b>. “Template công ty mẫu” là bộ mẫu trung tính (Công ty ABC)
          để minh họa; tải về, thay logo/màu/bố cục rồi upload lại thành template riêng. Chữ giữ chỗ được ScopeAI điền tự động:{" "}
          {PLACEHOLDERS.map((p) => (
            <code key={p} className="mx-0.5 rounded bg-surface px-1 text-xs">{`{{${p}}}`}</code>
          ))}
        </p>
      </Callout>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="grid gap-4 lg:grid-cols-2">
        {data.items.map((item) => {
          const info = KIND_INFO[item.kind];
          const sources: TemplateSource[] = ["builtin", "sample", ...(item.custom ? (["custom"] as const) : [])];
          return (
            <section key={item.kind} className={section}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-fg">{info.title}</h2>
                {busy === item.kind && <Spinner />}
              </div>
              <p className="mt-0.5 text-sm text-subtle">{info.hint}</p>
              <fieldset className="mt-3 space-y-1.5">
                <legend className={eyebrow}>Đang dùng khi xuất</legend>
                {sources.map((source) => (
                  <label key={source} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`tpl-${item.kind}`}
                      checked={item.active === source}
                      disabled={busy !== null}
                      onChange={() => act(item.kind, () => setActiveTemplate(item.kind, source))}
                      className="accent-[var(--accent)]"
                    />
                    <span className="text-fg">{SOURCE_LABELS[source]}</span>
                    {source === "sample" && (
                      <button
                        type="button"
                        onClick={() => download(templateFileUrl(item.kind, "sample"))}
                        className="text-sm text-accent-strong hover:underline"
                      >
                        <IconDownload className="mr-0.5 inline" />
                        tải về
                      </button>
                    )}
                    {source === "custom" && item.custom && (
                      <span className="text-sm text-subtle">
                        {(item.custom.size / 1024).toFixed(0)} KB · {formatDateTime(item.custom.uploaded_at)} ·{" "}
                        <button
                          type="button"
                          onClick={() => download(templateFileUrl(item.kind, "custom"))}
                          className="text-accent-strong hover:underline"
                        >
                          tải về
                        </button>
                      </span>
                    )}
                  </label>
                ))}
              </fieldset>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  ref={(el) => {
                    files.current[item.kind] = el;
                  }}
                  type="file"
                  accept={info.accept}
                  className="hidden"
                  aria-label={`Upload ${info.title}`}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) act(item.kind, () => uploadTemplate(item.kind, file));
                  }}
                />
                <button type="button" disabled={busy !== null} onClick={() => files.current[item.kind]?.click()} className={buttonClass.secondary}>
                  <IconUpload /> Upload template riêng ({info.accept})
                </button>
                {item.custom && (
                  <button type="button" disabled={busy !== null} onClick={() => act(item.kind, () => deleteTemplate(item.kind))} className={buttonClass.danger}>
                    <IconTrash /> Xóa template riêng
                  </button>
                )}
              </div>
              {(notes[item.kind]?.length ?? 0) > 0 && (
                <ul className="mt-3 list-disc space-y-0.5 rounded-md bg-warning-soft py-2 pr-3 pl-7 text-sm text-fg">
                  {notes[item.kind]!.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <section className={section}>
        <h2 className="font-semibold text-fg">Cấu hình ghép nội dung vào template</h2>
        <p className="mb-4 text-sm text-subtle">Chỉ cần sửa khi template riêng có tên layout, sheet hoặc cột khác bộ mẫu.</p>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Field label="Layout slide nội dung (PowerPoint)">
            <input
              className={input}
              value={cfg.pptx.content_layout ?? ""}
              onChange={(e) => setCfg({ pptx: { ...cfg.pptx, content_layout: e.target.value } })}
            />
          </Field>
          <Field label="Lề dưới vùng nội dung (inch)" hint="Dùng khi layout không có ô {{SCOPEAI_CONTENT}}">
            <input
              type="number"
              step={0.05}
              className={num}
              value={cfg.pptx.bottom_margin_in ?? 0.55}
              onChange={(e) => setCfg({ pptx: { ...cfg.pptx, bottom_margin_in: Number(e.target.value) } })}
            />
          </Field>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <MappingEditor title="Excel: sheet WBS" value={cfg.workbook.wbs} onChange={(m) => setCfg({ workbook: { ...cfg.workbook, wbs: m } })} />
          <MappingEditor
            title="Excel: sheet báo giá"
            value={cfg.workbook.pricing}
            onChange={(m) => setCfg({ workbook: { ...cfg.workbook, pricing: m } })}
          />
          <MappingEditor title="Excel Q&A" value={cfg.qa_sheet} onChange={(m) => setCfg({ qa_sheet: m })} />
        </div>
        <SaveBar {...saver} onSave={() => saver.run(async () => setData(await saveTemplateConfig(cfg)))} />
      </section>
    </div>
  );
}

// ---------- content library ----------
export function ContentTab({ initial }: { initial: ContentBlock[] }) {
  const [blocks, setBlocks] = useState(initial);
  const [current, setCurrent] = useState(0);
  const [lang, setLang] = useState<Language>("vi");
  const saver = useSaver();
  const block = blocks[current];
  const update = (patch: Partial<ContentBlock>) => setBlocks((list) => list.map((b, i) => (i === current ? { ...b, ...patch } : b)));

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <ListPicker
        title="Khối nội dung"
        items={blocks}
        current={current}
        label={(b) => (
          <span className="flex items-center justify-between gap-2">
            <span className={b.enabled ? "" : "line-through opacity-60"}>{b.title.vi || b.id}</span>
            <span className="text-xs text-subtle">{b.position === "start" ? "đầu" : "cuối"}</span>
          </span>
        )}
        onPick={setCurrent}
        addLabel="Thêm khối"
        onAdd={() => {
          setBlocks((list) => [
            ...list,
            { id: `block_${list.length + 1}`, enabled: true, position: "end", title: { vi: "Tiêu đề mới" }, body: { vi: "Nội dung chuẩn của công ty." } },
          ]);
          setCurrent(blocks.length);
        }}
      />
      <section className={section}>
        <p className="mb-3 text-sm text-subtle">
          Chèn nguyên văn vào slide và Word (LLM không viết lại). “Đầu” = ngay sau trang bìa; “cuối” = sau proposal, trước phụ lục. Có thể dùng{" "}
          <code className="text-xs">{"{{company_name}}"}</code>, <code className="text-xs">{"{{company_short}}"}</code>,{" "}
          <code className="text-xs">{"{{client_name}}"}</code>.
        </p>
        {block ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <Field label="Mã">
                <input className={`${input} font-mono text-sm`} value={block.id} onChange={(e) => update({ id: e.target.value })} />
              </Field>
              <Field label="Vị trí">
                <select className={input} value={block.position} onChange={(e) => update({ position: e.target.value as ContentBlock["position"] })}>
                  <option value="start">Đầu hồ sơ</option>
                  <option value="end">Cuối hồ sơ</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 pb-2 text-muted">
                <input type="checkbox" checked={block.enabled} onChange={(e) => update({ enabled: e.target.checked })} className="accent-[var(--accent)]" />
                Đang dùng
              </label>
            </div>
            <div className="flex gap-1 border-b border-line" role="tablist" aria-label="Ngôn ngữ">
              {LANGS.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={lang === l}
                  onClick={() => setLang(l)}
                  className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${lang === l ? "border-accent text-fg" : "border-transparent text-muted"}`}
                >
                  {LANGUAGE_LABELS[l]}
                  {!block.title[l] && l !== "vi" && <span className="ml-1 text-subtle">(dùng tiếng Việt)</span>}
                </button>
              ))}
            </div>
            <Field label="Tiêu đề">
              <input className={input} value={block.title[lang] ?? ""} onChange={(e) => update({ title: { ...block.title, [lang]: e.target.value } })} />
            </Field>
            <Field label="Nội dung (mỗi dòng một đoạn)">
              <textarea
                rows={7}
                className={`${input} leading-relaxed`}
                value={block.body[lang] ?? ""}
                onChange={(e) => update({ body: { ...block.body, [lang]: e.target.value } })}
              />
            </Field>
            <button
              type="button"
              onClick={() => {
                setBlocks((list) => list.filter((_, i) => i !== current));
                setCurrent(0);
              }}
              className={buttonClass.danger}
            >
              <IconTrash /> Xóa khối này
            </button>
          </div>
        ) : (
          <p className="text-muted">Chưa có khối nội dung nào.</p>
        )}
        <SaveBar {...saver} onSave={() => saver.run(async () => setBlocks(await saveContentLibrary(blocks)))} />
      </section>
    </div>
  );
}

// ---------- case studies ----------
const PATTERNS: CaseStudy["pattern"][] = ["no_ai_rule_based", "classic_ml", "rag", "agent", "fine_tune"];

export function CaseStudiesTab({ initial }: { initial: CaseStudy[] }) {
  const [items, setItems] = useState(initial);
  const [current, setCurrent] = useState(0);
  const saver = useSaver();
  const cs = items[current];
  const update = (patch: Partial<CaseStudy>) => setItems((list) => list.map((c, i) => (i === current ? { ...c, ...patch } : c)));

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <ListPicker
        title="Case study"
        items={items}
        current={current}
        label={(c) => (
          <span className="flex items-start justify-between gap-2">
            <span>{c.title}</span>
            {!c.public && <Badge tone="warning">nội bộ</Badge>}
          </span>
        )}
        onPick={setCurrent}
        addLabel="Thêm case study"
        onAdd={() => {
          setItems((list) => [
            ...list,
            {
              id: `cs_new_${list.length + 1}`,
              title: "Dự án mới (giả lập)",
              industry: "",
              market: "vn",
              pattern: "rag",
              year: new Date().getFullYear(),
              public: false,
              challenge: "",
              solution: "",
              results: [],
              tech: [],
              duration: "",
            },
          ]);
          setCurrent(items.length);
        }}
      />
      <section className={section}>
        <p className="mb-3 text-sm text-subtle">
          ScopeAI tự chọn tối đa 3 case study <b>được phép trình bày</b> khớp hướng giải pháp, thị trường và ngành của khách để đưa vào slide, Word và
          gợi ý cho bước viết proposal.
        </p>
        {cs ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Tên dự án">
                <input className={input} value={cs.title} onChange={(e) => update({ title: e.target.value })} />
              </Field>
            </div>
            <Field label="Mã">
              <input className={`${input} font-mono text-sm`} value={cs.id} onChange={(e) => update({ id: e.target.value })} />
            </Field>
            <Field label="Ngành">
              <input className={input} value={cs.industry} onChange={(e) => update({ industry: e.target.value })} />
            </Field>
            <Field label="Thị trường">
              <select className={input} value={cs.market} onChange={(e) => update({ market: e.target.value as Market })}>
                {(Object.keys(MARKET_LABELS) as Market[]).map((m) => (
                  <option key={m} value={m}>
                    {MARKET_LABELS[m]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hướng giải pháp">
              <select className={input} value={cs.pattern} onChange={(e) => update({ pattern: e.target.value as CaseStudy["pattern"] })}>
                {PATTERNS.map((p) => (
                  <option key={p} value={p}>
                    {PATTERN_LABELS[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Năm">
              <input type="number" className={num} value={cs.year ?? ""} onChange={(e) => update({ year: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Thời gian thực hiện">
              <input className={input} value={cs.duration} onChange={(e) => update({ duration: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Thách thức">
                <textarea rows={2} className={input} value={cs.challenge} onChange={(e) => update({ challenge: e.target.value })} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Giải pháp">
                <textarea rows={2} className={input} value={cs.solution} onChange={(e) => update({ solution: e.target.value })} />
              </Field>
            </div>
            <Field label="Kết quả (mỗi dòng một ý)">
              <textarea
                rows={3}
                className={input}
                value={cs.results.join("\n")}
                onChange={(e) => update({ results: e.target.value.split("\n").filter((l) => l.trim()) })}
              />
            </Field>
            <Field label="Công nghệ (phẩy)">
              <textarea
                rows={3}
                className={input}
                value={cs.tech.join(", ")}
                onChange={(e) => update({ tech: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
              />
            </Field>
            <label className="flex items-center gap-2 text-muted sm:col-span-2">
              <input type="checkbox" checked={cs.public} onChange={(e) => update({ public: e.target.checked })} className="accent-[var(--accent)]" />
              Được phép trình bày với khách (đã có đồng ý của khách hàng cũ)
            </label>
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={() => {
                  setItems((list) => list.filter((_, i) => i !== current));
                  setCurrent(0);
                }}
                className={buttonClass.danger}
              >
                <IconTrash /> Xóa case study
              </button>
            </div>
          </div>
        ) : (
          <p className="text-muted">Chưa có case study nào.</p>
        )}
        <SaveBar {...saver} onSave={() => saver.run(async () => setItems(await saveCaseStudies(items)))} />
      </section>
    </div>
  );
}

// ---------- bid / no-bid ----------
const AUTO_RULES: Record<BidAutoRule, string> = {
  solution_clear: "Đã xác định hướng giải pháp",
  data_ready: "Dữ liệu sẵn sàng ≥ 3/5",
  business_value: "Giá trị kinh doanh ≥ 3/5",
  risk_acceptable: "Không có rủi ro mức 5",
  requirements_fit: "Đáp ứng ≥ 70% requirement",
  budget_known: "Khách đã nêu ngân sách",
};

export function BidCriteriaTab({ initial }: { initial: BidCriterion[] }) {
  const [items, setItems] = useState(initial);
  const saver = useSaver();
  const update = (i: number, patch: Partial<BidCriterion>) => setItems((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <section className={section}>
      <h2 className="mb-1 font-semibold text-fg">Tiêu chí Bid / No-bid</h2>
      <p className="mb-4 text-sm text-subtle">
        Tiêu chí có “gợi ý tự động” được code đánh giá từ kết quả phân tích; presales vẫn xác nhận. Khuyến nghị: ≥ 70 điểm nên tham gia, 50–70 cân
        nhắc, dưới 50 không nên tham gia.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="text-xs tracking-[0.12em] text-subtle uppercase">
              <th className="px-2 py-2">Mã</th>
              <th className="px-2 py-2">Tiêu chí</th>
              <th className="px-2 py-2 text-right">Trọng số</th>
              <th className="px-2 py-2">Gợi ý tự động</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((c, i) => (
              <tr key={i} className="border-t border-line/60">
                <td className="w-44 px-2 py-1.5">
                  <input className={`${input} font-mono text-sm`} value={c.id} onChange={(e) => update(i, { id: e.target.value })} aria-label="Mã tiêu chí" />
                </td>
                <td className="px-2 py-1.5">
                  <input className={input} value={c.label} onChange={(e) => update(i, { label: e.target.value })} aria-label="Tiêu chí" />
                </td>
                <td className="w-24 px-2 py-1.5">
                  <input type="number" min={0.5} max={10} step={0.5} className={num} value={c.weight} onChange={(e) => update(i, { weight: Number(e.target.value) })} aria-label="Trọng số" />
                </td>
                <td className="w-60 px-2 py-1.5">
                  <select className={input} value={c.auto ?? ""} onChange={(e) => update(i, { auto: (e.target.value || null) as BidAutoRule | null })} aria-label="Gợi ý tự động">
                    <option value="">Presales tự đánh giá</option>
                    {(Object.keys(AUTO_RULES) as BidAutoRule[]).map((r) => (
                      <option key={r} value={r}>
                        {AUTO_RULES[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    aria-label="Xóa tiêu chí"
                    disabled={items.length <= 1}
                    onClick={() => setItems((list) => list.filter((_, j) => j !== i))}
                    className="rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-danger disabled:opacity-30"
                  >
                    <IconTrash />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => setItems((list) => [...list, { id: `criterion_${list.length + 1}`, label: "Tiêu chí mới", weight: 1, auto: null }])}
        className={`${buttonClass.secondary} mt-3`}
      >
        <IconPlus /> Thêm tiêu chí
      </button>
      <SaveBar {...saver} onSave={() => saver.run(async () => setItems(await saveBidCriteria(items)))} />
    </section>
  );
}
