import type {
  AttachmentKind,
  BidCriterion,
  BidEvaluation,
  CaseStudy,
  CaseStudyMatch,
  CompanyProfile,
  ContentBlock,
  ContractModel,
  Currency,
  TemplateKind,
  TemplatesConfig,
  TemplatesPayload,
  TemplateSource,
  DealStage,
  EstimationTemplate,
  RateCard,
  SettingsPayload,
  SimilarRun,
  Stats,
  EvalReport,
  EvalReportInfo,
  ExtractedDocument,
  Language,
  LogoInfo,
  ReplayInfo,
  RunErrorEvent,
  RunStatus,
  RunSummary,
  ScopingRun,
  StepDoneEvent,
  StepName,
} from "./types";

export function previewBasePath(): string {
  const m = window.location.pathname.match(/^(\/api\/v1\/sessions\/[^/]+\/preview\/\d+)/);
  return m ? m[1] : "";
}

// The preview prefix detected at runtime wins over a build-time VITE_API_BASE, so a build that
// baked in an older preview session id still calls the session it is served from.
export const API_BASE: string = (() => {
  const prefix = previewBasePath();
  if (prefix) return `${prefix}/api`;
  return import.meta.env.VITE_API_BASE || "http://localhost:8000/api";
})();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let resp: Response;
  const isForm = init?.body instanceof FormData;
  try {
    resp = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: isForm ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error("Không kết nối được tới máy chủ. Hãy kiểm tra backend đã chạy chưa.");
  }
  if (!resp.ok) {
    let detail = `Lỗi ${resp.status}`;
    try {
      const body = await resp.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // keep the generic message
    }
    throw new Error(detail);
  }
  return resp.json() as Promise<T>;
}

export interface RunMeta {
  project_name?: string | null;
  client_name?: string | null;
  due_date?: string | null;
  deal_stage?: DealStage;
}

export async function createRun(requestText: string, meta: RunMeta = {}): Promise<string> {
  const body = await request<{ run_id: string }>("/runs", {
    method: "POST",
    body: JSON.stringify({ request_text: requestText, ...meta }),
  });
  return body.run_id;
}

export const updateMeta = (id: string, meta: RunMeta) =>
  request<ScopingRun>(`/runs/${id}/meta`, { method: "PATCH", body: JSON.stringify(meta) });

export interface QuotationOptions {
  currency?: Currency;
  contingency_pct?: number;
  contract_model?: ContractModel;
  onsite_ratio?: number;
}

export const updateQuotation = (id: string, body: QuotationOptions) =>
  request<ScopingRun>(`/runs/${id}/quotation`, { method: "POST", body: JSON.stringify(body) });

export const approvePricing = (id: string, approved: boolean, note: string | null) =>
  request<ScopingRun>(`/runs/${id}/pricing-approval`, {
    method: "POST",
    body: JSON.stringify({ approved, note }),
  });

export const getBid = (id: string) => request<BidEvaluation>(`/runs/${id}/bid`);

export const saveBid = (
  id: string,
  body: { checks: Record<string, boolean | null>; decision: "bid" | "no_bid" | null; note: string | null },
) => request<BidEvaluation>(`/runs/${id}/bid`, { method: "PUT", body: JSON.stringify(body) });

export const createVersion = (id: string, body: { note?: string | null; major?: boolean; sent?: boolean }) =>
  request<ScopingRun>(`/runs/${id}/versions`, { method: "POST", body: JSON.stringify(body) });

export const markVersionSent = (id: string, version: string, sent: boolean) =>
  request<ScopingRun>(`/runs/${id}/versions/${version}`, {
    method: "PATCH",
    body: JSON.stringify({ sent }),
  });

export const runCaseStudies = (id: string) => request<CaseStudyMatch[]>(`/runs/${id}/case-studies`);

export const draftClientEmail = (id: string, senderName: string | null, regenerate = false) =>
  request<{ subject: string; body: string }>(`/runs/${id}/client-email`, {
    method: "POST",
    body: JSON.stringify({ sender_name: senderName, regenerate }),
  });

export function importAnswers(id: string, file: File): Promise<ScopingRun> {
  const form = new FormData();
  form.append("file", file);
  return request<ScopingRun>(`/runs/${id}/answers/import`, { method: "POST", body: form });
}

export const similarRuns = (id: string) => request<SimilarRun[]>(`/runs/${id}/similar`);

export const getStats = () => request<Stats>("/stats");

export const getSettings = () => request<SettingsPayload>("/settings");

export const saveRateCard = (card: RateCard) =>
  request<RateCard>("/settings/rate-card", { method: "PUT", body: JSON.stringify(card) });

export const saveEstimationTemplate = (template: EstimationTemplate) =>
  request<EstimationTemplate>("/settings/estimation-template", {
    method: "PUT",
    body: JSON.stringify(template),
  });

export const saveReferenceProject = (name: string, content: string) =>
  request<{ name: string }>(`/settings/reference-projects/${name}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });

export const saveCompany = (company: CompanyProfile) =>
  request<CompanyProfile>("/settings/company", { method: "PUT", body: JSON.stringify(company) });

export const saveContentLibrary = (blocks: ContentBlock[]) =>
  request<ContentBlock[]>("/settings/content-library", { method: "PUT", body: JSON.stringify(blocks) });

export const saveCaseStudies = (items: CaseStudy[]) =>
  request<CaseStudy[]>("/settings/case-studies", { method: "PUT", body: JSON.stringify(items) });

export const saveBidCriteria = (items: BidCriterion[]) =>
  request<BidCriterion[]>("/settings/bid-criteria", { method: "PUT", body: JSON.stringify(items) });

export const getTemplates = () => request<TemplatesPayload>("/templates");

export const templateFileUrl = (kind: TemplateKind, source: "sample" | "custom") =>
  `${API_BASE}/templates/${kind}/${source}/file`;

export function uploadTemplate(kind: TemplateKind, file: File): Promise<TemplatesPayload> {
  const form = new FormData();
  form.append("file", file);
  return request<TemplatesPayload>(`/templates/${kind}`, { method: "POST", body: form });
}

/** `version` (the upload time) busts the browser cache after the logo is replaced. */
export const logoUrl = (version: string) => `${API_BASE}/settings/logo?v=${encodeURIComponent(version)}`;

export function uploadLogo(file: File): Promise<{ logo: LogoInfo }> {
  const form = new FormData();
  form.append("file", file);
  return request<{ logo: LogoInfo }>("/settings/logo", { method: "POST", body: form });
}

export const deleteLogo = () => request<{ logo: null }>("/settings/logo", { method: "DELETE" });

export const deleteTemplate = (kind: TemplateKind) =>
  request<TemplatesPayload>(`/templates/${kind}/custom`, { method: "DELETE" });

export const setActiveTemplate = (kind: TemplateKind, source: TemplateSource) =>
  request<TemplatesPayload>("/templates/active", {
    method: "PUT",
    body: JSON.stringify({ kind, source }),
  });

export const saveTemplateConfig = (config: TemplatesConfig) =>
  request<TemplatesPayload>("/templates/config", { method: "PUT", body: JSON.stringify(config) });

export const deleteReferenceProject = (name: string) =>
  request<{ name: string }>(`/settings/reference-projects/${name}`, { method: "DELETE" });

export const getHealth = () => request<{ ok: boolean; llm_provider: string }>("/health");

export const getRun = (id: string) => request<ScopingRun>(`/runs/${id}`);

export const listRuns = (limit = 50) => request<RunSummary[]>(`/runs?limit=${limit}`);

export const postAnswers = (id: string, answers: Record<string, string>) =>
  request<ScopingRun>(`/runs/${id}/answers`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });

export const postReview = (id: string, approved: boolean, note: string | null) =>
  request<ScopingRun>(`/runs/${id}/review`, {
    method: "POST",
    body: JSON.stringify({ approved, note }),
  });

export const rerunRun = (id: string, fromStep: StepName, feedback: string) =>
  request<ScopingRun>(`/runs/${id}/rerun`, {
    method: "POST",
    body: JSON.stringify({ from_step: fromStep, feedback }),
  });

export const saveProposal = (id: string, markdown: string, title: string | null) =>
  request<ScopingRun>(`/runs/${id}/proposal`, {
    method: "PUT",
    body: JSON.stringify({ markdown, title }),
  });

export const translateProposal = (id: string, language: Language) =>
  request<{ language: Language; markdown: string }>(`/runs/${id}/proposal/translate`, {
    method: "POST",
    body: JSON.stringify({ language }),
  });

export function extractDocument(file: File): Promise<ExtractedDocument> {
  const form = new FormData();
  form.append("file", file);
  return request<ExtractedDocument>("/documents/extract", { method: "POST", body: form });
}

export const listEvalReports = () => request<EvalReportInfo[]>("/eval/reports");

export const getEvalReport = (name: string) => request<EvalReport>(`/eval/reports/${name}`);

export function uploadAttachments(
  id: string,
  files: File[],
  kinds: (AttachmentKind | "auto")[],
): Promise<ScopingRun> {
  const form = new FormData();
  files.forEach((file, i) => {
    form.append("files", file);
    form.append("kinds", kinds[i] ?? "auto");
  });
  return request<ScopingRun>(`/runs/${id}/attachments`, { method: "POST", body: form });
}

export type ExportName = "slides.pptx" | "proposal.docx" | "workbook.xlsx" | "package.zip" | "qa_sheet.xlsx";

export const exportUrl = (id: string, name: ExportName, lang?: Language) =>
  `${API_BASE}/runs/${id}/export/${name}${lang && lang !== "vi" ? `?lang=${lang}` : ""}`;

export const replayExportUrl = (name: string, file: ExportName, lang?: Language) =>
  `${API_BASE}/replays/${name}/export/${file}${lang && lang !== "vi" ? `?lang=${lang}` : ""}`;

export const proposalUrl = (id: string) => `${API_BASE}/runs/${id}/proposal.md`;

/** Fetch a binary export as a blob and trigger a browser download via JS.
 * More reliable than `<a href>` inside a sandboxed preview iframe, where navigation-based
 * downloads may be silently blocked even though the server returns 200 + Content-Disposition.
 * Returns the optional filename from Content-Disposition when the server provides one. */
export async function downloadUrl(url: string): Promise<string | undefined> {
  const resp = await fetch(url, { credentials: "same-origin" });
  if (!resp.ok) {
    let detail = `Lỗi ${resp.status}`;
    try {
      const body = await resp.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // keep generic
    }
    throw new Error(detail);
  }
  const blob = await resp.blob();
  let filename: string | undefined;
  const cd = resp.headers.get("content-disposition");
  if (cd) {
    const m = cd.match(/filename\*=(?:UTF-8'')?"?([^";]+)"?/i) ?? cd.match(/filename="?([^";]+)"?/i);
    if (m) filename = decodeURIComponent(m[1]);
  }
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename || "download";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return filename;
}

export const listReplays = () => request<string[]>("/replays");

export const getReplay = (name: string) => request<ReplayInfo>(`/replays/${name}`);

export interface StreamHandlers {
  onStatus?: (status: RunStatus) => void;
  onStepStarted?: (step: StepName) => void;
  onStepDone?: (event: StepDoneEvent) => void;
  onRunError?: (event: RunErrorEvent) => void;
  onConnectionError?: (message: string) => void;
}

function openStream(url: string, handlers: StreamHandlers): () => void {
  const es = new EventSource(url);
  let finished = false;
  const finish = () => {
    finished = true;
    es.close();
  };
  const parse = (e: Event) => JSON.parse((e as MessageEvent<string>).data);

  es.addEventListener("status", (e) => {
    const { status } = parse(e) as { status: RunStatus };
    handlers.onStatus?.(status);
    if (status !== "running") finish();
  });
  es.addEventListener("step_started", (e) => {
    handlers.onStepStarted?.((parse(e) as { step: StepName }).step);
  });
  es.addEventListener("step_done", (e) => handlers.onStepDone?.(parse(e) as StepDoneEvent));
  es.addEventListener("run_error", (e) => {
    finish();
    handlers.onRunError?.(parse(e) as RunErrorEvent);
  });
  // Connection-level failure (also fires on non-200 responses such as 409).
  es.onerror = () => {
    if (finished) return;
    finish();
    handlers.onConnectionError?.("Mất kết nối tới máy chủ trong khi phân tích.");
  };
  return finish;
}

export const streamRun = (id: string, handlers: StreamHandlers) =>
  openStream(`${API_BASE}/runs/${id}/stream`, handlers);

export const streamReplay = (name: string, segment: number, handlers: StreamHandlers) =>
  openStream(`${API_BASE}/replays/${name}/stream?segment=${segment}`, handlers);
