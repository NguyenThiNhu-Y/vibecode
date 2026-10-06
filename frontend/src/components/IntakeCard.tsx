import type { ReactNode } from "react";
import { LANGUAGE_LABELS } from "../labels";
import type { IntakeResult } from "../types";
import { Badge, Card, Chip } from "./ui";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line py-2.5 last:border-0 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-sm text-subtle">{label}</dt>
      <dd className="flex flex-wrap gap-1.5 text-fg">{children}</dd>
    </div>
  );
}

const unknown = <Chip tone="muted">Chưa rõ</Chip>;

function Values({ values }: { values: string[] }) {
  return values.length ? <>{values.map((v) => <Chip key={v}>{v}</Chip>)}</> : unknown;
}

export default function IntakeCard({ data }: { data: IntakeResult }) {
  return (
    <Card step="intake" title="Thông tin trích xuất" actions={<Badge>{LANGUAGE_LABELS[data.language]}</Badge>}>
      <p className="mb-2 font-medium text-fg">{data.business_goal}</p>
      <dl>
        <Row label="Quy trình hiện tại">{data.current_process ? <span>{data.current_process}</span> : unknown}</Row>
        <Row label="Người dùng">
          <Values values={data.users} />
        </Row>
        <Row label="Nguồn dữ liệu">
          <Values values={data.data_sources} />
        </Row>
        <Row label="Ràng buộc">
          <Values values={data.constraints} />
        </Row>
        <Row label="Ngân sách">{data.budget ? <span>{data.budget}</span> : unknown}</Row>
        <Row label="Thời hạn">{data.timeline ? <span>{data.timeline}</span> : unknown}</Row>
        {data.project_start && (
          <Row label="Dự kiến bắt đầu">
            <span>{data.project_start.split("-").reverse().join("/")} (lịch tổng thể bắt đầu từ ngày này)</span>
          </Row>
        )}
        <Row label="Ngành">{data.industry ? <span>{data.industry}</span> : unknown}</Row>
      </dl>
    </Card>
  );
}
