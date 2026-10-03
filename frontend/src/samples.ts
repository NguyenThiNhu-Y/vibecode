// Same request_text as backend/eval/cases/case_01, case_10, case_13 (simulated data).
export interface Sample {
  id: string;
  label: string;
  lang: "VI" | "EN" | "JA";
  outcome: string;
  text: string;
}

export const SAMPLES: Sample[] = [
  {
    id: "case_01",
    label: "Chatbot manual bảo trì",
    lang: "JA",
    outcome: "RAG · on-prem",
    text: `お世話になっております。架空精機株式会社（仮）の保守部門です。
当社では工作機械の保守マニュアルが約2,000ページ（PDF）あり、現場の保守担当者が必要な情報を探すのに毎回30分以上かかっています。
マニュアルの内容について日本語で質問すると、該当ページを示しながら回答してくれるチャットボットを検討しています。
セキュリティ上の理由で、データは社外に出せないため、オンプレミス環境での構築が必須です。
利用者は全国の保守担当者約150名です。まずは3ヶ月以内にPoCを実施したいと考えております。
`,
  },
  {
    id: "case_10",
    label: "Tính tổng hóa đơn Excel",
    lang: "VI",
    outcome: "Không cần AI",
    text: `Chào anh/chị, hàng tháng bộ phận kế toán của chúng tôi nhận khoảng 40 file Excel
hóa đơn từ các chi nhánh, cùng một template. Chúng tôi muốn dùng AI để tự động
tính tổng tiền theo chi nhánh và xuất báo cáo. Hiện mất 3 ngày mỗi tháng.
`,
  },
  {
    id: "case_13",
    label: "Yêu cầu mơ hồ",
    lang: "VI",
    outcome: "Cần hỏi lại",
    text: `Chào anh/chị, công ty chúng tôi muốn ứng dụng AI để tăng năng suất làm việc.
Mong anh/chị tư vấn giải pháp phù hợp và báo giá sơ bộ.
`,
  },
];
