import { useState } from "react";
import type { QuotationOptions } from "../api";
import { CONTRACT_HINTS, CONTRACT_LABELS, PHASE_LABELS, formatMoney } from "../labels";
import type { ContractModel, Currency, PricingApproval, Quotation } from "../types";
import { Badge, ErrorBox, Panel, Spinner, buttonClass } from "./ui";

const CURRENCIES: Currency[] = ["VND", "JPY", "USD"];
const MODELS: ContractModel[] = ["fixed_price", "time_material", "odc"];

function Segmented<T extends string>({
  label,
  options,
  value,
  render,
  disabled,
  onPick,
}: {
  label: string;
  options: T[];
  value: T;
  render: (v: T) => string;
  disabled: boolean;
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md border border-line p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          disabled={disabled}
          aria-pressed={value === o}
          onClick={() => o !== value && onPick(o)}
          className={`rounded px-2.5 py-0.5 text-sm font-medium disabled:cursor-not-allowed ${value === o ? "bg-surface-2 text-fg" : "text-subtle hover:text-fg"}`}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}

function NumberField({
  label,
  value,
  suffix,
  disabled,
  onApply,
}: {
  label: string;
  value: number;
  suffix: string;
  disabled: boolean;
  onApply: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  return (
    <div className="mt-1 flex items-center gap-1.5 text-sm">
      <input
        type="number"
        min={0}
        max={100}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        aria-label={label}
        className="w-16 rounded-md border border-line bg-surface px-2 py-0.5 text-fg focus:border-accent focus:outline-none disabled:opacity-60"
      />
      <span className="text-subtle">{suffix}</span>
      <button
        type="button"
        disabled={disabled || text === "" || Number(text) === value}
        onClick={() => onApply(Number(text))}
        className={`${buttonClass.secondary} px-2 py-0.5 text-sm`}
      >
        Áp dụng
      </button>
    </div>
  );
}

export default function QuotationCard({
  data,
  approval,
  onChange,
}: {
  data: Quotation;
  approval?: PricingApproval | null;
  onChange?: (body: QuotationOptions) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const money = (v: number) => formatMoney(v, data.currency);
  const locked = Boolean(approval?.approved);
  const editable = Boolean(onChange) && !locked;
  const model = data.contract_model;

  const apply = async (body: QuotationOptions) => {
    if (!onChange) return;
    setBusy(true);
    setError(null);
    try {
      await onChange(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được báo giá.");
    } finally {
      setBusy(false);
    }
  };

  const totalLabel =
    model === "fixed_price"
      ? `Tổng (gồm dự phòng ${data.contingency_pct}%)`
      : model === "time_material"
        ? "Tổng dự toán (T&M)"
        : `Tổng ODC · ${data.months} tháng`;

  return (
    <Panel
      id="quotation"
      title={
        <span className="flex flex-wrap items-center gap-2">
          Chi phí dự kiến
          {approval && (
            <Badge tone={approval.approved ? "success" : "warning"}>
              {approval.approved ? "Đã duyệt giá" : "Cần sửa giá"}
            </Badge>
          )}
        </span>
      }
      subtitle="Tính bằng code: ngày công WBS + overhead quản lý × đơn giá theo vai trò (số giả lập). Chưa gồm VAT."
      actions={
        onChange && (
          <>
            {busy && <Spinner />}
            <Segmented
              label="Mô hình hợp đồng"
              options={MODELS}
              value={model}
              render={(m) => CONTRACT_LABELS[m]}
              disabled={busy || locked}
              onPick={(m) => apply({ contract_model: m })}
            />
            <Segmented
              label="Đơn vị tiền"
              options={CURRENCIES}
              value={data.currency}
              render={(c) => c}
              disabled={busy || locked}
              onPick={(c) => apply({ currency: c })}
            />
          </>
        )
      }
    >
      <p className="mb-3 text-sm text-subtle">
        <span className="font-medium text-muted">{CONTRACT_LABELS[model]}:</span> {CONTRACT_HINTS[model]}
        {locked && " Báo giá đã được duyệt nên đang khóa; hủy duyệt ở tab Quy trình để sửa."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-line p-3">
          <p className="text-sm text-subtle">{totalLabel}</p>
          <p className="text-xl font-semibold text-fg tabular-nums">{money(data.total)}</p>
          {model !== "odc" ? (
            <p className="text-sm text-subtle tabular-nums">
              {money(data.total_min)} – {money(data.total_max)}
            </p>
          ) : (
            <p className="text-sm text-subtle tabular-nums">{money(data.odc_monthly_cost ?? 0)} / tháng</p>
          )}
        </div>
        <div className="rounded-md border border-line p-3">
          <p className="text-sm text-subtle">Dự phòng rủi ro</p>
          {model === "fixed_price" ? (
            <>
              <p className="text-xl font-semibold text-fg tabular-nums">{money(data.contingency)}</p>
              {onChange ? (
                <NumberField
                  key={`pct-${data.contingency_pct}`}
                  label="Phần trăm dự phòng"
                  value={data.contingency_pct}
                  suffix="%"
                  disabled={busy || !editable}
                  onApply={(v) => apply({ contingency_pct: v })}
                />
              ) : (
                <p className="text-sm text-subtle">{data.contingency_pct}%</p>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-subtle">Không áp dụng với {CONTRACT_LABELS[model]}.</p>
          )}
        </div>
        <div className="rounded-md border border-line p-3">
          <p className="text-sm text-subtle">Ngày công</p>
          <p className="text-xl font-semibold text-fg tabular-nums">
            {data.wbs_person_days + data.overhead_person_days}
          </p>
          <p className="text-sm text-subtle tabular-nums">
            WBS {data.wbs_person_days} + quản lý {data.overhead_person_days}
          </p>
        </div>
        <div className="rounded-md border border-line p-3">
          <p className="text-sm text-subtle">Tỉ lệ onsite</p>
          <p className="text-xl font-semibold text-fg tabular-nums">{data.onsite_ratio}%</p>
          {onChange && (
            <NumberField
              key={`onsite-${data.onsite_ratio}`}
              label="Tỉ lệ onsite"
              value={data.onsite_ratio}
              suffix="%"
              disabled={busy || !editable}
              onApply={(v) => apply({ onsite_ratio: v })}
            />
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="overflow-x-auto rounded-md border border-line">
          {model === "odc" ? (
            <table className="w-full min-w-[420px] border-collapse text-left">
              <thead className="bg-surface-2 text-sm text-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Vai trò trong đội ODC</th>
                  <th className="px-3 py-2 text-right font-medium">FTE</th>
                  <th className="px-3 py-2 text-right font-medium">Chi phí / tháng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.odc_team.map((m) => (
                  <tr key={m.role_label}>
                    <td className="px-3 py-2 font-medium text-fg">{m.role_label}</td>
                    <td className="px-3 py-2 text-right text-muted tabular-nums">{m.fte}</td>
                    <td className="px-3 py-2 text-right text-fg tabular-nums">{money(m.monthly_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[480px] border-collapse text-left">
              <thead className="bg-surface-2 text-sm text-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Giai đoạn</th>
                  <th className="px-3 py-2 text-right font-medium">Ngày công</th>
                  <th className="px-3 py-2 text-right font-medium">Chi phí</th>
                  <th className="px-3 py-2 text-right font-medium">Khoảng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.phases.map((p) => (
                  <tr key={p.phase}>
                    <td className="px-3 py-2 font-medium text-fg">{PHASE_LABELS[p.phase]}</td>
                    <td className="px-3 py-2 text-right text-muted tabular-nums">{p.person_days}</td>
                    <td className="px-3 py-2 text-right text-fg tabular-nums">{money(p.amount)}</td>
                    <td className="px-3 py-2 text-right text-sm text-subtle tabular-nums">
                      {money(p.min_amount)} – {money(p.max_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-muted">
            {model === "fixed_price" ? "Mốc thanh toán" : "Thanh toán theo tháng"}
          </h3>
          <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-md border border-line">
            {data.milestones.map((m) => (
              <li key={m.name} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-muted">
                  {m.name} <span className="text-subtle">· {Math.round(m.percent * 10) / 10}%</span>
                </span>
                <span className="text-fg tabular-nums">{money(m.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <details className="mt-3 rounded-md border border-line">
        <summary className="cursor-pointer px-3 py-2 font-medium text-fg">
          Chi tiết theo vai trò ({data.lines.length}) và giả định
        </summary>
        <ul className="divide-y divide-line px-3 text-sm">
          {data.lines.map((l) => (
            <li key={`${l.phase}-${l.role_key}-${l.kind}`} className="flex justify-between gap-3 py-1.5">
              <span className="text-muted">
                {PHASE_LABELS[l.phase]} · {l.role_label}
                {l.kind === "overhead" && (
                  <Badge tone="violet" className="ml-1.5">
                    quản lý
                  </Badge>
                )}{" "}
                · {l.person_days} ngày × {money(l.day_rate)}
              </span>
              <span className="text-fg tabular-nums">{money(l.amount)}</span>
            </li>
          ))}
        </ul>
        <ul className="list-disc space-y-0.5 border-t border-line py-2 pr-3 pl-8 text-sm text-subtle">
          {data.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
      {error && (
        <div className="mt-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
    </Panel>
  );
}
