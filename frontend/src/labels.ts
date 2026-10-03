import type {
  AttachmentKind,
  BidRecommendation,
  ContractModel,
  Market,
  Confidence,
  Coverage,
  Currency,
  DealStage,
  Deployment,
  GoRecommendation,
  Phase,
  QuestionTopic,
  RiskCategory,
  RunStatus,
  SolutionPattern,
  StepName,
} from "./types";

export const STEP_LABELS: Record<StepName, string> = {
  intake: "Trích xuất yêu cầu",
  gaps: "Câu hỏi làm rõ",
  pattern: "Hướng giải pháp",
  feasibility: "Khả thi & rủi ro",
  architecture: "Kiến trúc & effort",
  wbs: "WBS & timeline",
  requirements: "Đáp ứng yêu cầu",
  proposal: "Proposal",
};

export const PATTERN_LABELS: Record<SolutionPattern, string> = {
  no_ai_rule_based: "Không cần AI (quy tắc / script)",
  classic_ml: "Machine learning truyền thống",
  rag: "RAG – hỏi đáp trên tài liệu",
  agent: "AI Agent – tự động hóa nhiều bước",
  fine_tune: "Fine-tune model",
  needs_clarification: "Cần làm rõ thêm",
};

export const STEP_ACTIVITY: Record<StepName, string> = {
  intake: "Đang đọc yêu cầu và trích xuất thông tin…",
  gaps: "Đang tìm thông tin còn thiếu và soạn câu hỏi…",
  pattern: "Đang cân nhắc 5 hướng giải pháp, bắt đầu từ “không cần AI”…",
  feasibility: "Đang chấm điểm và đối chiếu danh mục rủi ro…",
  architecture: "Đang thiết kế kiến trúc và tính effort theo bảng chuẩn…",
  wbs: "Đang chia công việc; code kiểm tra tổng ngày công và dựng timeline…",
  requirements: "Đang đối chiếu từng requirement của khách với giải pháp…",
  proposal: "Đang soạn proposal từ kết quả các bước…",
};

export const PATTERN_TAGLINES: Record<SolutionPattern, string> = {
  no_ai_rule_based: "Quy tắc, công thức hoặc script là đủ: rẻ hơn, nhanh hơn, đúng 100%.",
  classic_ml: "Dự đoán, phân loại trên dữ liệu bảng có lịch sử.",
  rag: "Hỏi đáp trên kho tài liệu, có trích dẫn nguồn.",
  agent: "LLM điều phối nhiều bước và thao tác trên hệ thống.",
  fine_tune: "Huấn luyện thêm model cho văn phong / định dạng đặc thù.",
  needs_clarification: "Chưa đủ thông tin để chọn hướng, cần khách trả lời thêm.",
};

export const COVERAGE_LABELS: Record<Coverage, string> = {
  full: "Đáp ứng",
  partial: "Một phần",
  not_supported: "Không đáp ứng",
  needs_clarification: "Cần làm rõ",
};

export const COVERAGE_TONE: Record<Coverage, "success" | "warning" | "danger" | "neutral"> = {
  full: "success",
  partial: "warning",
  not_supported: "danger",
  needs_clarification: "neutral",
};

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  requirements: "Requirement",
  document: "Tài liệu",
  data_sample: "Data mẫu",
  source_code: "Source code",
};

export const DEAL_STAGES: DealStage[] = [
  "new",
  "clarifying",
  "reviewing",
  "ready",
  "sent",
  "won",
  "lost",
  "no_bid",
];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  new: "Mới",
  clarifying: "Đang hỏi khách",
  reviewing: "Chờ duyệt",
  ready: "Sẵn sàng gửi",
  sent: "Đã gửi khách",
  won: "Thắng",
  lost: "Thua",
  no_bid: "Không tham gia",
};

export const DEAL_STAGE_TONE: Record<DealStage, "neutral" | "warning" | "info" | "violet" | "accent" | "success" | "danger"> = {
  new: "neutral",
  clarifying: "warning",
  reviewing: "info",
  ready: "violet",
  sent: "accent",
  won: "success",
  lost: "danger",
  no_bid: "neutral",
};

export const CONTRACT_LABELS: Record<ContractModel, string> = {
  fixed_price: "Trọn gói",
  time_material: "T&M",
  odc: "ODC",
};

export const CONTRACT_HINTS: Record<ContractModel, string> = {
  fixed_price: "Giá cố định theo phạm vi, cộng dự phòng rủi ro, thanh toán theo mốc.",
  time_material: "Tính theo ngày công thực tế, thanh toán hằng tháng, không cộng dự phòng.",
  odc: "Đội dự án riêng theo FTE, thanh toán cố định mỗi tháng.",
};

export const BID_RECOMMENDATION: Record<
  BidRecommendation,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  bid: { label: "Nên tham gia", tone: "success" },
  consider: { label: "Cân nhắc", tone: "warning" },
  no_bid: { label: "Không nên tham gia", tone: "danger" },
  need_info: { label: "Cần đánh giá thêm", tone: "neutral" },
};

export const MARKET_LABELS: Record<Market, string> = {
  vn: "Việt Nam",
  jp: "Nhật Bản",
  eu: "Châu Âu",
  other: "Quốc tế",
};

const LOCALES = { VND: "vi-VN", JPY: "ja-JP", USD: "en-US" } as const;

export function formatMoney(value: number, currency: Currency): string {
  return new Intl.NumberFormat(LOCALES[currency], {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function daysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${isoDate}T00:00:00`).getTime() - today.getTime()) / 86_400_000);
}

export const LANGUAGE_LABELS = { vi: "Tiếng Việt", en: "Tiếng Anh", ja: "Tiếng Nhật" } as const;

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  low: "Độ tự tin thấp",
  medium: "Độ tự tin trung bình",
  high: "Độ tự tin cao",
};

export const TOPIC_LABELS: Record<QuestionTopic, string> = {
  data: "Dữ liệu",
  users: "Người dùng",
  accuracy: "Độ chính xác",
  infra: "Hạ tầng",
  budget: "Ngân sách",
  timeline: "Thời gian",
  compliance: "Tuân thủ",
  integration: "Tích hợp",
};

export const RISK_LABELS: Record<RiskCategory, string> = {
  data: "Dữ liệu",
  accuracy: "Độ chính xác",
  privacy: "Bảo mật",
  compliance: "Tuân thủ",
  cost: "Chi phí",
  adoption: "Áp dụng",
};

export const GO_LABELS: Record<GoRecommendation, string> = {
  go: "Nên triển khai",
  go_with_poc: "Triển khai qua PoC",
  not_now: "Chưa nên triển khai",
};

export const DEPLOYMENT_LABELS: Record<Deployment, string> = {
  cloud: "Cloud",
  on_prem: "On-premise",
  hybrid: "Hybrid",
};

export const PHASE_LABELS: Record<Phase, string> = {
  poc: "PoC",
  mvp: "MVP",
  production: "Production",
};

export const STATUS_LABELS: Record<RunStatus, string> = {
  created: "Mới tạo",
  running: "Đang chạy",
  waiting_clarification: "Chờ làm rõ",
  done: "Đã phân tích",
  failed: "Lỗi",
  approved: "Đã duyệt",
  rejected: "Cần sửa",
};

export function formatSeconds(ms: number | undefined): string {
  if (ms === undefined) return "";
  return `${(ms / 1000).toFixed(1)} giây`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
