import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  deleteReferenceProject,
  getSettings,
  saveEstimationTemplate,
  saveRateCard,
  saveReferenceProject,
} from "../api";
import { Field, SaveBar, input, num, useSaver } from "../components/form";
import { IconPlus, IconTrash } from "../components/icons";
import { ErrorBox, Spinner, buttonClass, eyebrow } from "../components/ui";
import { CONTRACT_HINTS, CONTRACT_LABELS, PATTERN_LABELS, PHASE_LABELS } from "../labels";
import type { ContractModel, EstimationTemplate, OverheadRule, Phase, RateCard, SettingsPayload, SolutionPattern } from "../types";
import { BidCriteriaTab, CaseStudiesTab, CompanyTab, ContentTab, TemplatesTab } from "./SettingsCompany";

type Tab = "company" | "templates" | "content" | "cases" | "rates" | "effort" | "bid" | "references";
const TABS: { key: Tab; label: string }[] = [
  { key: "company", label: "Công ty" },
  { key: "templates", label: "Template" },
  { key: "content", label: "Nội dung chuẩn" },
  { key: "cases", label: "Case study" },
  { key: "rates", label: "Đơn giá & báo giá" },
  { key: "effort", label: "Bảng effort chuẩn" },
  { key: "bid", label: "Bid/No-bid" },
  { key: "references", label: "Dự án tham chiếu" },
];
const PHASES: Phase[] = ["poc", "mvp", "production"];
const MULTIPLIER_LABELS: Record<string, string> = {
  on_prem: "Triển khai on-premise",
  japanese_language: "Khách hàng tiếng Nhật",
  low_data_readiness: "Dữ liệu chưa sẵn sàng (≤ 2/5)",
  strict_compliance: "Tuân thủ nghiêm ngặt",
};
function RatesTab({ initial }: { initial: RateCard }) {
  const [card, setCard] = useState<RateCard>(initial);
  const saver = useSaver();
  const milestoneSum = card.milestones.reduce((s, m) => s + Number(m.percent || 0), 0);
  const set = (patch: Partial<RateCard>) => setCard((c) => ({ ...c, ...patch }));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-1 font-bold text-fg">Đơn giá theo vai trò (VND / ngày công)</h2>
        <p className="mb-4 text-sm text-subtle">
          Vai trò trong WBS được ghép với dòng đầu tiên có từ khóa khớp; không khớp thì dùng vai trò mặc định. Đơn giá onsite để trống = 3 × offshore.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="text-xs tracking-[0.12em] text-subtle uppercase">
                <th className="px-2 py-2">Mã</th>
                <th className="px-2 py-2">Tên hiển thị</th>
                <th className="px-2 py-2 text-right">Offshore / ngày</th>
                <th className="px-2 py-2 text-right">Onsite / ngày</th>
                <th className="px-2 py-2">Từ khóa nhận diện (phẩy)</th>
                <th className="px-2 py-2">Mặc định</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {card.roles.map((role, i) => {
                const update = (patch: Partial<typeof role>) =>
                  set({ roles: card.roles.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
                return (
                  <tr key={i} className="border-t border-line/60">
                    <td className="w-40 px-2 py-1.5">
                      <input className={`${input} font-mono text-sm`} value={role.key} onChange={(e) => update({ key: e.target.value })} aria-label="Mã vai trò" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input className={input} value={role.label} onChange={(e) => update({ label: e.target.value })} aria-label="Tên vai trò" />
                    </td>
                    <td className="w-40 px-2 py-1.5">
                      <input type="number" min={0} step={100000} className={num} value={role.day_rate} onChange={(e) => update({ day_rate: Number(e.target.value) })} aria-label="Đơn giá" />
                    </td>
                    <td className="w-40 px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        step={100000}
                        className={num}
                        value={role.onsite_day_rate ?? ""}
                        placeholder={String(role.day_rate * 3)}
                        onChange={(e) => update({ onsite_day_rate: e.target.value ? Number(e.target.value) : null })}
                        aria-label="Đơn giá onsite"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        className={input}
                        value={role.match.join(", ")}
                        onChange={(e) => update({ match: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })}
                        aria-label="Từ khóa"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input type="radio" name="default_role" checked={card.default_role === role.key} onChange={() => set({ default_role: role.key })} className="accent-[var(--accent)]" aria-label="Vai trò mặc định" />
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        aria-label="Xóa vai trò"
                        disabled={card.roles.length <= 1}
                        onClick={() => set({ roles: card.roles.filter((_, j) => j !== i) })}
                        className="rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-danger disabled:opacity-30"
                      >
                        <IconTrash />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={() => set({ roles: [...card.roles, { key: `role_${card.roles.length + 1}`, label: "Vai trò mới", day_rate: 3000000, onsite_day_rate: null, match: [] }] })}
          className={`${buttonClass.secondary} mt-3`}
        >
          <IconPlus />
          Thêm vai trò
        </button>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface space-y-3 p-5">
          <h2 className="font-bold text-fg">Tỉ giá & dự phòng</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="1 USD = ? VND">
              <input type="number" className={num} value={card.exchange_rates.USD} onChange={(e) => set({ exchange_rates: { ...card.exchange_rates, USD: Number(e.target.value) } })} />
            </Field>
            <Field label="1 JPY = ? VND">
              <input type="number" className={num} value={card.exchange_rates.JPY} onChange={(e) => set({ exchange_rates: { ...card.exchange_rates, JPY: Number(e.target.value) } })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Dự phòng cơ bản %">
              <input type="number" className={num} value={card.contingency.base_pct} onChange={(e) => set({ contingency: { ...card.contingency, base_pct: Number(e.target.value) } })} />
            </Field>
            <Field label="+% mỗi rủi ro mức 4–5">
              <input type="number" className={num} value={card.contingency.per_high_risk_pct} onChange={(e) => set({ contingency: { ...card.contingency, per_high_risk_pct: Number(e.target.value) } })} />
            </Field>
            <Field label="Tối đa %">
              <input type="number" className={num} value={card.contingency.max_pct} onChange={(e) => set({ contingency: { ...card.contingency, max_pct: Number(e.target.value) } })} />
            </Field>
          </div>
          <h3 className="pt-2 font-semibold text-fg">Tác động (cho thống kê giờ tiết kiệm)</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Giờ làm tay / hồ sơ">
              <input type="number" className={num} value={card.impact.manual_hours_per_proposal} onChange={(e) => set({ impact: { ...card.impact, manual_hours_per_proposal: Number(e.target.value) } })} />
            </Field>
            <Field label="Giờ review / hồ sơ">
              <input type="number" step={0.5} className={num} value={card.impact.review_hours_per_proposal} onChange={(e) => set({ impact: { ...card.impact, review_hours_per_proposal: Number(e.target.value) } })} />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-surface space-y-3 p-5">
          <h2 className="font-bold text-fg">Chi phí vận hành / tháng (VND)</h2>
          {Object.entries(card.run_cost_monthly).map(([pattern, value]) => (
            <Field key={pattern} label={PATTERN_LABELS[pattern as SolutionPattern] ?? pattern}>
              <input
                type="number"
                className={num}
                value={value}
                onChange={(e) => set({ run_cost_monthly: { ...card.run_cost_monthly, [pattern]: Number(e.target.value) } })}
              />
            </Field>
          ))}
          <Field label="Hệ số khi triển khai on-premise">
            <input type="number" step={0.1} className={num} value={card.on_prem_run_cost_factor} onChange={(e) => set({ on_prem_run_cost_factor: Number(e.target.value) })} />
          </Field>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-1 font-bold text-fg">Overhead quản lý (theo % ngày công WBS)</h2>
          <p className="mb-3 text-sm text-subtle">Cộng thêm ngày công cho vai trò quản lý ở mỗi giai đoạn, ví dụ PM 10%, BrSE 15% với khách Nhật.</p>
          <div className="space-y-2">
            {card.overheads.map((o, i) => {
              const update = (patch: Partial<OverheadRule>) => set({ overheads: card.overheads.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              return (
                <div key={i} className="grid grid-cols-[1fr_5rem_8rem_8.5rem_auto] items-center gap-2">
                  <input className={input} value={o.label} onChange={(e) => update({ label: e.target.value })} aria-label="Tên overhead" />
                  <input type="number" min={0} max={100} className={num} value={o.percent} onChange={(e) => update({ percent: Number(e.target.value) })} aria-label="Phần trăm overhead" />
                  <select className={input} value={o.role} onChange={(e) => update({ role: e.target.value })} aria-label="Vai trò overhead">
                    {card.roles.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <select className={input} value={o.when} onChange={(e) => update({ when: e.target.value as OverheadRule["when"] })} aria-label="Điều kiện áp dụng">
                    <option value="always">Luôn áp dụng</option>
                    <option value="japanese">Khách tiếng Nhật</option>
                  </select>
                  <button type="button" aria-label="Xóa overhead" onClick={() => set({ overheads: card.overheads.filter((_, j) => j !== i) })} className="rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-danger">
                    <IconTrash />
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => set({ overheads: [...card.overheads, { key: `oh_${card.overheads.length + 1}`, label: "Overhead mới", percent: 5, role: card.default_role, when: "always" }] })}
            className={`${buttonClass.secondary} mt-3`}
          >
            <IconPlus />
            Thêm overhead
          </button>
        </section>
        <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
          <h2 className="font-bold text-fg">Hợp đồng mặc định</h2>
          <Field label="Mô hình hợp đồng" hint={CONTRACT_HINTS[card.contract.default_model]}>
            <select className={input} value={card.contract.default_model} onChange={(e) => set({ contract: { ...card.contract, default_model: e.target.value as ContractModel } })}>
              {(Object.keys(CONTRACT_LABELS) as ContractModel[]).map((m) => (
                <option key={m} value={m}>
                  {CONTRACT_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tỉ lệ onsite mặc định %">
              <input type="number" min={0} max={100} className={num} value={card.contract.default_onsite_ratio} onChange={(e) => set({ contract: { ...card.contract, default_onsite_ratio: Number(e.target.value) } })} />
            </Field>
            <Field label="Ngày làm việc / tháng (ODC, T&M)">
              <input type="number" min={15} max={26} className={num} value={card.contract.working_days_per_month} onChange={(e) => set({ contract: { ...card.contract, working_days_per_month: Number(e.target.value) } })} />
            </Field>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-fg">Mốc thanh toán (hợp đồng trọn gói)</h2>
          <span className={`text-sm font-semibold ${milestoneSum === 100 ? "text-success" : "text-warning"}`}>
            Tổng {milestoneSum}% {milestoneSum === 100 ? "✓" : "(phải bằng 100%)"}
          </span>
        </div>
        <div className="space-y-2">
          {card.milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={input} value={m.name} onChange={(e) => set({ milestones: card.milestones.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} aria-label="Tên mốc" />
              <input type="number" className={`${num} w-28`} value={m.percent} onChange={(e) => set({ milestones: card.milestones.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)) })} aria-label="Phần trăm" />
              <span className="text-muted">%</span>
              <button type="button" aria-label="Xóa mốc" disabled={card.milestones.length <= 1} onClick={() => set({ milestones: card.milestones.filter((_, j) => j !== i) })} className="rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-danger disabled:opacity-30">
                <IconTrash />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => set({ milestones: [...card.milestones, { name: "Mốc mới", percent: 0 }] })} className={`${buttonClass.secondary} mt-3`}>
          <IconPlus />
          Thêm mốc
        </button>
      </section>

      <SaveBar {...saver} onSave={() => saver.run(() => saveRateCard(card))} />
    </div>
  );
}

function EffortTab({ initial }: { initial: EstimationTemplate }) {
  const [template, setTemplate] = useState<EstimationTemplate>(initial);
  const saver = useSaver();
  const setRange = (pattern: string, phase: Phase, idx: 0 | 1, value: number) =>
    setTemplate((t) => {
      const range = [...t.base[pattern][phase]] as [number, number];
      range[idx] = value;
      return { ...t, base: { ...t.base, [pattern]: { ...t.base[pattern], [phase]: range } } };
    });

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-line bg-surface overflow-x-auto p-5">
        <h2 className="mb-1 font-bold text-fg">Bảng effort chuẩn (ngày công)</h2>
        <p className="mb-4 text-sm text-subtle">Code dùng bảng này × hệ số để tính effort gốc; LLM chỉ được lệch ±20% kèm lý do.</p>
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="text-xs tracking-[0.12em] text-subtle uppercase">
              <th className="px-2 py-2">Hướng giải pháp</th>
              {PHASES.map((p) => (
                <th key={p} className="px-2 py-2 text-center">
                  {PHASE_LABELS[p]} (min – max)
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.keys(template.base).map((pattern) => (
              <tr key={pattern} className="border-t border-line/60">
                <td className="px-2 py-2 font-medium text-fg">{PATTERN_LABELS[pattern as SolutionPattern] ?? pattern}</td>
                {PHASES.map((phase) => (
                  <td key={phase} className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={0} className={num} value={template.base[pattern][phase][0]} onChange={(e) => setRange(pattern, phase, 0, Number(e.target.value))} aria-label={`${pattern} ${phase} min`} />
                      <span className="text-subtle">–</span>
                      <input type="number" min={0} className={num} value={template.base[pattern][phase][1]} onChange={(e) => setRange(pattern, phase, 1, Number(e.target.value))} aria-label={`${pattern} ${phase} max`} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-4 font-bold text-fg">Hệ số điều chỉnh (nhân dồn)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(template.multipliers).map(([key, value]) => (
            <Field key={key} label={MULTIPLIER_LABELS[key] ?? key}>
              <input type="number" step={0.05} min={0} className={num} value={value} onChange={(e) => setTemplate((t) => ({ ...t, multipliers: { ...t.multipliers, [key]: Number(e.target.value) } }))} />
            </Field>
          ))}
        </div>
      </section>
      <SaveBar {...saver} onSave={() => saver.run(() => saveEstimationTemplate(template))} />
    </div>
  );
}

function ReferencesTab({ initial }: { initial: SettingsPayload["reference_projects"] }) {
  const [items, setItems] = useState(initial);
  const [current, setCurrent] = useState(initial[0]?.name ?? "");
  const [draft, setDraft] = useState(initial[0]?.content ?? "");
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saver = useSaver();

  const open = (name: string) => {
    setCurrent(name);
    setDraft(items.find((i) => i.name === name)?.content ?? "");
    setConfirmDelete(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="mb-3 font-bold text-fg">Dự án tham chiếu ({items.length})</h2>
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.name}>
              <button
                type="button"
                onClick={() => open(i.name)}
                className={`w-full rounded-md px-3 py-1.5 text-left font-mono text-sm ${current === i.name ? "bg-accent-soft text-accent-strong" : "text-muted hover:bg-surface-2"}`}
              >
                {i.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2">
          <input className={`${input} font-mono text-sm`} placeholder="rp_ten_moi" value={newName} onChange={(e) => setNewName(e.target.value.toLowerCase())} aria-label="Tên dự án tham chiếu mới" />
          <button
            type="button"
            aria-label="Tạo dự án tham chiếu"
            disabled={!/^[a-z0-9_]{3,60}$/.test(newName) || items.some((i) => i.name === newName)}
            onClick={() => {
              const content = `# ${newName}: Tên dự án (giả lập)\n- Ngành: \n- Pattern:  | Triển khai: \n- Effort thực tế: PoC … ngày công, MVP … ngày công\n- Bài học: `;
              setItems((list) => [...list, { name: newName, content }]);
              setCurrent(newName);
              setDraft(content);
              setNewName("");
            }}
            className={`${buttonClass.secondary} px-3`}
          >
            <IconPlus />
          </button>
        </div>
      </section>
      <section className="rounded-lg border border-line bg-surface p-5">
        {current ? (
          <>
            <p className={eyebrow}>{current}.md</p>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={14} className={`${input} mt-2 font-mono text-sm leading-relaxed`} aria-label="Nội dung dự án tham chiếu" />
            <div className="flex flex-wrap items-start gap-2">
              <div className="flex-1">
                <SaveBar
                  {...saver}
                  onSave={() =>
                    saver.run(async () => {
                      await saveReferenceProject(current, draft);
                      setItems((list) => list.map((i) => (i.name === current ? { ...i, content: draft } : i)));
                    })
                  }
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  await deleteReferenceProject(current).catch(() => undefined);
                  const rest = items.filter((i) => i.name !== current);
                  setItems(rest);
                  open(rest[0]?.name ?? "");
                }}
                className={`${buttonClass.danger} mt-6`}
              >
                <IconTrash />
                {confirmDelete ? "Bấm lần nữa để xóa" : "Xóa"}
              </button>
            </div>
          </>
        ) : (
          <p className="text-muted">Chọn hoặc tạo một dự án tham chiếu.</p>
        )}
      </section>
    </div>
  );
}

export default function Settings() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useSearchParams();
  const tab = (TABS.some((t) => t.key === search.get("tab")) ? search.get("tab") : "company") as Tab;
  const setTab = (next: Tab) => setSearch({ tab: next }, { replace: true });

  useEffect(() => {
    getSettings()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được cài đặt."));
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-semibold text-fg">Cài đặt</h1>
      <p className="mt-0.5 max-w-3xl text-muted">
        Chuẩn của công ty dùng cho mọi hồ sơ: template, nội dung, case study, đơn giá, effort. Số liệu hiện là{" "}
        <b className="text-warning">giả lập</b>; thay bằng dữ liệu thật của công ty. Mọi thay đổi được kiểm tra trước khi lưu.
      </p>
      <div className="mt-4 mb-5 flex flex-wrap gap-1 border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 font-medium ${tab === t.key ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!data && !error && (
        <p className="flex items-center gap-2 text-muted">
          <Spinner /> Đang tải…
        </p>
      )}
      {data && tab === "company" && <CompanyTab initial={data.company} />}
      {tab === "templates" && <TemplatesTab />}
      {data && tab === "content" && <ContentTab initial={data.content_library} />}
      {data && tab === "cases" && <CaseStudiesTab initial={data.case_studies} />}
      {data && tab === "bid" && <BidCriteriaTab initial={data.bid_criteria} />}
      {data && tab === "rates" && <RatesTab initial={data.rate_card} />}
      {data && tab === "effort" && <EffortTab initial={data.estimation_template} />}
      {data && tab === "references" && <ReferencesTab initial={data.reference_projects} />}
    </main>
  );
}
