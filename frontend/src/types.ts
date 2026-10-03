// Mirrors backend/app/schemas 1:1 (snake_case kept on purpose, see AGENTS.md 4.5).

export type Language = "vi" | "en" | "ja";
export type Confidence = "low" | "medium" | "high";
export type SolutionPattern =
  | "no_ai_rule_based"
  | "classic_ml"
  | "rag"
  | "agent"
  | "fine_tune"
  | "needs_clarification";
export type QuestionTopic =
  | "data"
  | "users"
  | "accuracy"
  | "infra"
  | "budget"
  | "timeline"
  | "compliance"
  | "integration";
export type RiskCategory = "data" | "accuracy" | "privacy" | "compliance" | "cost" | "adoption";
export type GoRecommendation = "go" | "go_with_poc" | "not_now";
export type Deployment = "cloud" | "on_prem" | "hybrid";
export type Phase = "poc" | "mvp" | "production";

export interface IntakeResult {
  business_goal: string;
  current_process: string | null;
  users: string[];
  data_sources: string[];
  constraints: string[];
  budget: string | null;
  timeline: string | null;
  language: Language;
  industry: string | null;
}

export interface ClarifyingQuestion {
  id: string;
  topic: QuestionTopic;
  question: string;
  why_it_matters: string;
  blocking: boolean;
}

export interface GapResult {
  missing_info: string[];
  questions: ClarifyingQuestion[];
  can_proceed: boolean;
}

export interface RejectedOption {
  pattern: SolutionPattern;
  reason: string;
}

export interface PatternResult {
  pattern: SolutionPattern;
  rationale: string;
  rejected: RejectedOption[];
  confidence: Confidence;
  assumptions: string[];
}

export interface RiskItem {
  category: RiskCategory;
  description: string;
  severity: number;
  mitigation: string;
}

export interface FeasibilityResult {
  data_readiness: number;
  technical_feasibility: number;
  business_value: number;
  risks: RiskItem[];
  go_recommendation: GoRecommendation;
}

export interface Component {
  name: string;
  purpose: string;
  tech_options: string[];
}

export interface PhaseEstimate {
  phase: Phase;
  min_person_days: number;
  max_person_days: number;
  team: string[];
  deliverables: string[];
  adjustment_note: string | null;
}

export interface ArchitectureResult {
  components: Component[];
  deployment: Deployment;
  estimates: PhaseEstimate[];
  reference_projects: string[];
  mermaid: string | null;
}

export interface ProposalResult {
  title: string;
  markdown: string;
  language: Language;
}

export type RunStatus =
  | "created"
  | "running"
  | "waiting_clarification"
  | "done"
  | "failed"
  | "approved"
  | "rejected";

export interface Multiplier {
  key: string;
  label: string;
  factor: number;
}

export interface EffortBasis {
  pattern: SolutionPattern;
  base: Partial<Record<Phase, [number, number]>>;
  multipliers: Multiplier[];
  factor: number;
  computed: Partial<Record<Phase, [number, number]>>;
}

export type AttachmentKind = "requirements" | "document" | "data_sample" | "source_code";

export interface RequirementItem {
  id: string;
  text: string;
  priority: string | null;
  category: string | null;
  sheet: string | null;
}

export interface ColumnProfile {
  name: string;
  dtype: "number" | "date" | "text" | "boolean" | "empty";
  null_ratio: number;
  unique: number;
  examples: string[];
  pii_suspect: boolean;
}

export interface DataProfile {
  sheet: string | null;
  rows: number;
  columns: ColumnProfile[];
  issues: string[];
  readiness_hint: number;
}

export interface CodeProfile {
  files: number;
  total_lines: number;
  languages: Record<string, number>;
  frameworks: string[];
  top_dirs: string[];
  has_tests: boolean;
  has_docker: boolean;
  notes: string[];
}

export interface Attachment {
  id: string;
  filename: string;
  kind: AttachmentKind;
  size_bytes: number;
  text: string | null;
  pages: number | null;
  truncated: boolean;
  requirements: RequirementItem[];
  data_profiles: DataProfile[];
  code_profile: CodeProfile | null;
}

export interface WBSTask {
  id: string;
  phase: Phase;
  name: string;
  role: string;
  person_days: number;
  depends_on: string[];
  deliverable: string | null;
}

export interface WBSResult {
  tasks: WBSTask[];
  notes: string[];
}

export interface ScheduledTask {
  id: string;
  start_day: number;
  end_day: number;
}

export interface Schedule {
  tasks: ScheduledTask[];
  phases: Partial<Record<Phase, [number, number]>>;
  total_days: number;
}

export type Coverage = "full" | "partial" | "not_supported" | "needs_clarification";

export interface RequirementAssessment {
  req_id: string;
  coverage: Coverage;
  component: string | null;
  note: string;
}

export interface RequirementMatrix {
  items: RequirementAssessment[];
  skipped: boolean;
}

export type Currency = "VND" | "JPY" | "USD";

export interface QuoteLine {
  phase: Phase;
  role_key: string;
  role_label: string;
  person_days: number;
  day_rate: number;
  amount: number;
  kind: "wbs" | "overhead";
}

export interface PhaseCost {
  phase: Phase;
  person_days: number;
  amount: number;
  min_amount: number;
  max_amount: number;
}

export type ContractModel = "fixed_price" | "time_material" | "odc";

export interface OdcMember {
  role_label: string;
  fte: number;
  monthly_cost: number;
}

export interface Quotation {
  currency: Currency;
  contract_model: ContractModel;
  onsite_ratio: number;
  wbs_person_days: number;
  overhead_person_days: number;
  odc_team: OdcMember[];
  odc_monthly_cost: number | null;
  months: number | null;
  lines: QuoteLine[];
  phases: PhaseCost[];
  subtotal: number;
  contingency_pct: number;
  contingency: number;
  total: number;
  total_min: number;
  total_max: number;
  monthly_run_cost: number | null;
  milestones: { name: string; percent: number; amount: number }[];
  assumptions: string[];
}

export type DealStage =
  | "new"
  | "clarifying"
  | "reviewing"
  | "ready"
  | "sent"
  | "won"
  | "lost"
  | "no_bid";

export interface BidDecision {
  checks: Record<string, boolean | null>;
  decision: "bid" | "no_bid" | null;
  note: string | null;
  decided_at: string | null;
}

export interface PricingApproval {
  approved: boolean;
  note: string | null;
  at: string;
}

export interface ProposalVersion {
  version: string;
  created_at: string;
  note: string | null;
  sent: boolean;
  sent_at: string | null;
  markdown: string | null;
  proposal_title: string | null;
  total: number | null;
  currency: Currency | null;
  pattern: SolutionPattern | null;
}

export type BidRecommendation = "bid" | "consider" | "no_bid" | "need_info";

export interface BidCriterionResult {
  id: string;
  label: string;
  weight: number;
  auto: boolean;
  suggested: boolean | null;
  reason: string;
  value: boolean | null;
  effective: boolean | null;
}

export interface BidEvaluation {
  criteria: BidCriterionResult[];
  score: number;
  answered: number;
  recommendation: BidRecommendation;
  decision: "bid" | "no_bid" | null;
  note: string | null;
  decided_at: string | null;
}

export type Market = "vn" | "jp" | "eu" | "other";

export interface CaseStudy {
  id: string;
  title: string;
  industry: string;
  market: Market;
  pattern: Exclude<SolutionPattern, "needs_clarification">;
  year: number | null;
  public: boolean;
  challenge: string;
  solution: string;
  results: string[];
  tech: string[];
  duration: string;
}

export interface CaseStudyMatch extends CaseStudy {
  score: number;
  reasons: string[];
}

export interface ScopingRun {
  id: string;
  created_at: string;
  request_text: string;
  status: RunStatus;
  answers: Record<string, string>;
  intake: IntakeResult | null;
  gaps: GapResult | null;
  pattern: PatternResult | null;
  feasibility: FeasibilityResult | null;
  architecture: ArchitectureResult | null;
  wbs: WBSResult | null;
  requirements: RequirementMatrix | null;
  proposal: ProposalResult | null;
  error: string | null;
  reviewer_note: string | null;
  step_latency_ms: Record<string, number>;
  // Extensions (AGENTS.md 4.1 "Mở rộng")
  effort_basis: EffortBasis | null;
  feedback: string | null;
  feedback_step: StepName | null;
  revision: number;
  redactions: Record<string, number>;
  proposal_edited: boolean;
  translations: Partial<Record<Language, string>>;
  attachments: Attachment[];
  schedule: Schedule | null;
  quotation: Quotation | null;
  client_email: { subject: string; body: string } | null;
  project_name: string | null;
  client_name: string | null;
  due_date: string | null;
  deal_stage: DealStage;
  bid: BidDecision | null;
  pricing_approval: PricingApproval | null;
  versions: ProposalVersion[];
}

export interface RunSummary {
  id: string;
  created_at: string;
  status: RunStatus;
  business_goal: string | null;
  pattern: SolutionPattern | null;
  project_name: string | null;
  client_name: string | null;
  due_date: string | null;
  deal_stage: DealStage;
  quote_total: number | null;
  quote_currency: Currency | null;
  total_ms: number;
}

export interface SimilarRun extends RunSummary {
  score: number;
}

export interface Stats {
  runs: number;
  finished: number;
  stages: Record<DealStage, number>;
  win_rate: number | null;
  hours_saved: number;
  manual_hours_per_proposal: number;
  review_hours_per_proposal: number;
}

export interface RoleRate {
  key: string;
  label: string;
  day_rate: number;
  onsite_day_rate: number | null;
  match: string[];
}

export interface OverheadRule {
  key: string;
  label: string;
  percent: number;
  role: string;
  when: "always" | "japanese";
}

export interface RateCard {
  currency: "VND";
  exchange_rates: { USD: number; JPY: number };
  roles: RoleRate[];
  default_role: string;
  contingency: { base_pct: number; per_high_risk_pct: number; max_pct: number };
  run_cost_monthly: Record<string, number>;
  on_prem_run_cost_factor: number;
  milestones: { name: string; percent: number }[];
  impact: { manual_hours_per_proposal: number; review_hours_per_proposal: number };
  overheads: OverheadRule[];
  contract: {
    default_model: ContractModel;
    default_onsite_ratio: number;
    working_days_per_month: number;
  };
}

export interface EstimationTemplate {
  unit: string;
  base: Record<string, Record<Phase, [number, number]>>;
  multipliers: Record<string, number>;
}

export interface CompanyProfile {
  name: string;
  short_name: string;
  confidential_footer: string;
  file_naming: string;
}

export interface ContentBlock {
  id: string;
  enabled: boolean;
  position: "start" | "end";
  title: Partial<Record<Language, string>>;
  body: Partial<Record<Language, string>>;
}

export type BidAutoRule =
  | "solution_clear"
  | "data_ready"
  | "business_value"
  | "risk_acceptable"
  | "requirements_fit"
  | "budget_known";

export interface BidCriterion {
  id: string;
  label: string;
  weight: number;
  auto: BidAutoRule | null;
}

export interface SettingsPayload {
  rate_card: RateCard;
  estimation_template: EstimationTemplate;
  reference_projects: { name: string; content: string }[];
  company: CompanyProfile;
  content_library: ContentBlock[];
  case_studies: CaseStudy[];
  bid_criteria: BidCriterion[];
}

export type TemplateKind = "slides" | "proposal_docx" | "workbook" | "qa_sheet";
export type TemplateSource = "builtin" | "sample" | "custom";

export interface SheetMapping {
  sheet: string;
  start_row: number;
  columns: Record<string, string>;
}

export interface TemplatesConfig {
  active: Record<TemplateKind, TemplateSource>;
  pptx: { content_layout?: string; bottom_margin_in?: number };
  workbook: { wbs: SheetMapping; pricing: SheetMapping };
  qa_sheet: SheetMapping;
}

export interface TemplateItem {
  kind: TemplateKind;
  filename: string;
  active: TemplateSource;
  sample: boolean;
  custom: { size: number; uploaded_at: string } | null;
}

export interface TemplatesPayload {
  items: TemplateItem[];
  config: TemplatesConfig;
  warnings?: string[];
}

export const STEPS = [
  "intake",
  "gaps",
  "pattern",
  "feasibility",
  "architecture",
  "wbs",
  "requirements",
  "proposal",
] as const;
export type StepName = (typeof STEPS)[number];

export interface StepResults {
  intake: IntakeResult;
  gaps: GapResult;
  pattern: PatternResult;
  feasibility: FeasibilityResult;
  architecture: ArchitectureResult;
  wbs: WBSResult;
  requirements: RequirementMatrix;
  proposal: ProposalResult;
}

// SSE payloads (AGENTS.md 4.3)
export type StepDoneEvent = {
  [K in StepName]: {
    step: K;
    result: StepResults[K];
    latency_ms: number;
    effort_basis?: EffortBasis | null; // only on the architecture step
    schedule?: Schedule | null; // only on the wbs step
    quotation?: Quotation | null; // only on the wbs step
  };
}[StepName];
export interface RunErrorEvent {
  step: StepName;
  message: string;
}

export interface ReplayInfo {
  name: string;
  llm_provider: string | null;
  recorded_at: string | null;
  request_text: string;
  segments: { answers: Record<string, string> }[];
  attachments: Attachment[];
  has_final_run: boolean;
}

export interface ExtractedDocument {
  filename: string;
  text: string;
  pages: number | null;
  truncated: boolean;
}

export interface EvalSummary {
  cases: number;
  pattern_accuracy: number;
  pattern_correct: string;
  topic_recall: number;
  estimate_in_range: string;
  schema_success_rate: number;
  avg_latency_s: number;
  errors: string[];
}

export interface EvalReportInfo {
  name: string;
  provider: string | null;
  label: string | null;
  created_at: string | null;
  summary: EvalSummary;
}

export interface EvalCaseResult {
  id: string;
  status: RunStatus;
  expected: SolutionPattern;
  got: SolutionPattern;
  pattern_ok: boolean;
  topics: QuestionTopic[];
  topic_recall: number;
  can_proceed_ok: boolean | null;
  mvp: [number, number] | null;
  estimate_ok: boolean | null;
  forbidden_hits: string[];
  steps_run: number;
  steps_first_try: number;
  latency_ms: number;
  error: string | null;
}

export interface EvalReport extends EvalReportInfo {
  cases: EvalCaseResult[];
}
