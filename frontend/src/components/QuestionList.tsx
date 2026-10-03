import { useState, type ReactNode } from "react";
import { TOPIC_LABELS } from "../labels";
import type { GapResult } from "../types";
import { IconArrowRight, IconPause } from "./icons";
import { Badge, Callout, Card, CopyButton, ErrorBox, Spinner, buttonClass } from "./ui";

export default function QuestionList({
  data,
  waiting,
  initialAnswers = {},
  onSubmit,
  extra,
}: {
  data: GapResult;
  waiting: boolean;
  initialAnswers?: Record<string, string>;
  onSubmit?: (answers: Record<string, string>) => Promise<void>;
  extra?: ReactNode;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyText = data.questions.map((q, i) => `${i + 1}. ${q.question}`).join("\n");
  const answeredCount = data.questions.filter((q) => answers[q.id]?.trim()).length;
  const blockingCount = data.questions.filter((q) => q.blocking).length;

  const submit = async () => {
    if (!onSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(answers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được câu trả lời.");
      setSubmitting(false);
    }
  };

  return (
    <Card
      step="gaps"
      title="Câu hỏi làm rõ"
      subtitle={
        blockingCount > 0
          ? `${data.questions.length} câu, ${blockingCount} câu bắt buộc trả lời trước khi chọn hướng giải pháp`
          : `${data.questions.length} câu nên gửi khách để chính xác hơn`
      }
      actions={data.questions.length > 0 && <CopyButton text={copyText} label="Copy câu hỏi" />}
    >
      {waiting && (
        <div className="mb-3">
          <Callout tone="warning" icon={<IconPause className="text-warning" />}>
            Agent tạm dừng để <b>hỏi lại thay vì đoán</b>. Điền câu trả lời của khách (hoặc nhập Q&A sheet) rồi bấm <b>Tiếp tục phân tích</b>.
          </Callout>
        </div>
      )}
      {data.questions.length === 0 ? (
        <p className="text-muted">Không có câu hỏi nào, yêu cầu đã đủ rõ.</p>
      ) : (
        <ol className="divide-y divide-line rounded-md border border-line">
          {data.questions.map((q, index) => (
            <li key={q.id} className="flex gap-3 p-3">
              <span className="w-5 shrink-0 pt-0.5 text-right font-mono text-subtle">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-fg">
                  {q.question}
                  <span className="ml-2 inline-flex gap-1 align-middle">
                    <Badge>{TOPIC_LABELS[q.topic]}</Badge>
                    {q.blocking && <Badge tone="danger">Bắt buộc</Badge>}
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-subtle">{q.why_it_matters}</p>
                {waiting && (
                  <textarea
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    placeholder="Câu trả lời của khách…"
                    rows={2}
                    className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-fg placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {waiting && onSubmit && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={submit} disabled={submitting || answeredCount === 0} className={buttonClass.primary}>
            {submitting ? <Spinner /> : <IconArrowRight />}
            Tiếp tục phân tích
          </button>
          <span className="text-sm text-subtle tabular-nums">
            {answeredCount}/{data.questions.length} câu đã trả lời
          </span>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      {extra}
    </Card>
  );
}
