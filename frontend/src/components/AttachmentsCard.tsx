import { ATTACHMENT_KIND_LABELS } from "../labels";
import type { Attachment } from "../types";
import { IconCode, IconIntake, IconPaperclip, IconTable } from "./icons";
import { Badge, Panel } from "./ui";

const KIND_ICON = { requirements: IconTable, document: IconIntake, data_sample: IconTable, source_code: IconCode } as const;
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

function Detail({ att }: { att: Attachment }) {
  if (att.kind === "requirements") {
    return (
      <span>
        <b className="text-fg">{att.requirements.length}</b> requirement · ví dụ {att.requirements[0]?.id}: {att.requirements[0]?.text.slice(0, 70)}
      </span>
    );
  }
  if (att.kind === "document") {
    return (
      <span>
        {att.pages ? `${att.pages} trang · ` : ""}
        {(att.text?.length ?? 0).toLocaleString("vi-VN")} ký tự{att.truncated ? " (đã cắt bớt)" : ""}
      </span>
    );
  }
  if (att.kind === "data_sample") {
    return (
      <div className="space-y-1">
        {att.data_profiles.map((p) => (
          <div key={p.sheet ?? "csv"}>
            <span>
              {p.sheet && <span className="text-fg">{p.sheet} · </span>}
              <b className="text-fg">{p.rows.toLocaleString("vi-VN")}</b> dòng × {p.columns.length} cột · độ sẵn sàng (code tính){" "}
              <b className="text-fg">{p.readiness_hint}/5</b>
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {p.columns.slice(0, 12).map((c) => (
                <code
                  key={c.name}
                  title={`${c.dtype} · trống ${Math.round(c.null_ratio * 100)}% · ${c.unique} giá trị khác nhau`}
                  className={`rounded px-1.5 py-0.5 font-mono text-xs ${c.pii_suspect ? "bg-danger-soft text-danger" : c.null_ratio > 0.3 ? "bg-warning-soft text-warning" : "bg-surface-2 text-muted"}`}
                >
                  {c.name}:{c.dtype}
                  {c.pii_suspect ? " · PII" : ""}
                </code>
              ))}
            </div>
            {p.issues.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-sm text-warning">
                {p.issues.slice(0, 3).map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }
  const cp = att.code_profile;
  if (!cp) return null;
  return (
    <span>
      <b className="text-fg">{cp.total_lines.toLocaleString("vi-VN")}</b> dòng code · {cp.files} file · {Object.keys(cp.languages).join(", ") || "chưa rõ ngôn ngữ"}
      {cp.frameworks.length > 0 && <> · framework: {cp.frameworks.join(", ")}</>}
      {cp.has_tests ? " · có test" : " · chưa có test"}
      {cp.has_docker ? " · có Docker" : ""}
    </span>
  );
}

export default function AttachmentsCard({ attachments }: { attachments: Attachment[] }) {
  return (
    <Panel
      icon={<IconPaperclip />}
      title={`Tài liệu khách cung cấp (${attachments.length})`}
      subtitle="Phân tích bằng code; chỉ bản tóm tắt (đã che dữ liệu cá nhân) được gửi cho LLM."
      bodyClassName="p-0"
    >
      <ul className="divide-y divide-line">
        {attachments.map((att) => {
          const Icon = KIND_ICON[att.kind];
          return (
            <li key={att.id} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[minmax(0,16rem)_1fr] sm:gap-4">
              <div className="flex min-w-0 items-center gap-2">
                <Icon className="shrink-0 text-subtle" />
                <span className="truncate font-medium text-fg">{att.filename}</span>
              </div>
              <div className="text-muted">
                <span className="mr-2 inline-flex gap-1.5 align-middle">
                  <Badge tone="accent">{ATTACHMENT_KIND_LABELS[att.kind]}</Badge>
                  <span className="text-xs text-subtle">{kb(att.size_bytes)}</span>
                </span>
                <Detail att={att} />
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
