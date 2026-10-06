"""Preliminary quotation computed by code (never by the LLM).

WBS person-days (+ company overheads such as PM / BrSE) x blended offshore/onsite day rates,
priced under one of three contract models: fixed price, time & material, ODC (dedicated team).
"""

import math
import re
from pathlib import Path

from app.agents.schedule import total_working_days
from app.knowledge.loader import KB_DIR, load_yaml
from app.schemas.common import Phase, SolutionPattern, WorkType
from app.schemas.quotation import (
    ContractModel,
    Currency,
    Milestone,
    OdcMember,
    PhaseCost,
    Quotation,
    QuoteLine,
)
from app.schemas.run import ScopingRun
from app.schemas.settings import RateCard, RoleRate
from app.schemas.wbs import leaves

RATE_CARD_FILE = "rate_card.yaml"
PHASE_ORDER = [Phase.POC, Phase.MVP, Phase.PRODUCTION]
ROUNDING = {"VND": 1000, "JPY": 100, "USD": 10}
DEFAULT_CURRENCY = {"vi": "VND", "ja": "JPY", "en": "USD"}
MODEL_LABELS = {
    "fixed_price": "Trọn gói (Fixed price)",
    "time_material": "Theo thời gian & nguồn lực (T&M)",
    "odc": "Đội dự án riêng (ODC)",
}


def load_rate_card(kb_dir: Path | None = None) -> RateCard:
    return RateCard.model_validate(load_yaml(RATE_CARD_FILE, kb_dir or KB_DIR))


def match_role(role: str, card: RateCard) -> RoleRate:
    text = role.lower()
    for rate in card.roles:
        if any(re.search(rf"(?<![a-z]){re.escape(k.lower())}(?![a-z])", text) for k in rate.match):
            return rate
    return next(r for r in card.roles if r.key == card.default_role)


# WBS work type -> rate card role (BIDDING_SPEC 3.1); a missing role falls back to default_role.
TYPE_ROLE = {
    WorkType.AI: "ai_engineer",
    WorkType.BE: "backend",
    WorkType.FE: "frontend",
    WorkType.QA: "qa",
    WorkType.BA: "ba",
    WorkType.PM: "pm",
    WorkType.INFRA: "devops",
    WorkType.DATA: "data_engineer",
}


def role_for_type(kind: WorkType | None, card: RateCard) -> RoleRate:
    keys = {r.key: r for r in card.roles}
    return keys.get(TYPE_ROLE.get(kind, "") if kind else "") or keys[card.default_role]


def default_currency(run: ScopingRun) -> Currency:
    return DEFAULT_CURRENCY.get(run.intake.language if run.intake else "vi", "VND")  # type: ignore[return-value]


def contingency_for(run: ScopingRun, card: RateCard) -> float:
    high = sum(1 for r in (run.feasibility.risks if run.feasibility else []) if r.severity >= 4)
    rule = card.contingency
    return min(rule.max_pct, rule.base_pct + high * rule.per_high_risk_pct)


def blended_rate(role: RoleRate, onsite_ratio: float) -> float:
    onsite = role.onsite_day_rate or role.day_rate * 3
    return role.day_rate * (1 - onsite_ratio / 100) + onsite * onsite_ratio / 100


def compute_quotation(
    run: ScopingRun,
    card: RateCard,
    currency: Currency | None = None,
    contingency_pct: float | None = None,
    contract_model: ContractModel | None = None,
    onsite_ratio: float | None = None,
) -> Quotation | None:
    if run.wbs is None or run.architecture is None or run.pattern is None:
        return None
    if run.pattern.pattern == SolutionPattern.NEEDS_CLARIFICATION:
        return None
    currency = currency or default_currency(run)
    model: ContractModel = contract_model or card.contract.default_model
    onsite = card.contract.default_onsite_ratio if onsite_ratio is None else onsite_ratio
    unit = 1.0 if currency == "VND" else card.exchange_rates[currency]  # type: ignore[index]
    step = ROUNDING[currency]
    rates = {r.key: r for r in card.roles}
    japanese = bool(run.intake and run.intake.language == "ja")

    def money(vnd: float) -> float:
        return float(round(vnd / unit / step) * step)

    # Man-days per (phase, role): WBS leaves by work type, then company overheads on each phase's
    # WBS effort. An overhead role the WBS already plans in that phase (e.g. PM tasks, mandatory
    # in BIDDING_SPEC 3.2) is not added again.
    grouped: dict[tuple[Phase, str, str], float] = {}
    wbs_days: dict[Phase, float] = {}
    for leaf in leaves(run.wbs):
        key = role_for_type(leaf.type, card).key
        days = leaf.estimate_md or 0
        grouped[(leaf.phase, key, "wbs")] = grouped.get((leaf.phase, key, "wbs"), 0) + days
        wbs_days[leaf.phase] = wbs_days.get(leaf.phase, 0) + days
    for rule in card.overheads:
        if rule.when == "japanese" and not japanese:
            continue
        for phase, days in wbs_days.items():
            if (phase, rule.role, "wbs") in grouped:
                continue
            extra = max(1, round(days * rule.percent / 100)) if rule.percent > 0 else 0
            if extra:
                key = (phase, rule.role, "overhead")
                grouped[key] = grouped.get(key, 0) + extra

    lines = [
        QuoteLine(
            phase=phase,
            role_key=key,
            role_label=rates[key].label,
            person_days=round(days, 2),
            day_rate=money(blended_rate(rates[key], onsite)),
            amount=money(blended_rate(rates[key], onsite) * days),
            kind=kind,  # type: ignore[arg-type]
        )
        for phase in PHASE_ORDER
        for (p, key, kind), days in sorted(grouped.items(), key=lambda kv: kv[0][2] == "overhead")
        if p == phase
    ]

    estimates = {e.phase: e for e in run.architecture.estimates}
    phases: list[PhaseCost] = []
    for phase in PHASE_ORDER:
        phase_lines = [line for line in lines if line.phase == phase]
        if not phase_lines:
            continue
        days = round(sum(line.person_days for line in phase_lines), 2)
        vnd = sum(
            blended_rate(rates[line.role_key], onsite) * line.person_days for line in phase_lines
        )
        per_wbs_day = vnd / max(
            1, wbs_days.get(phase, days)
        )  # cost per WBS day, overheads included
        est = estimates.get(phase)
        phases.append(
            PhaseCost(
                phase=phase,
                person_days=days,
                amount=money(vnd),
                min_amount=money(per_wbs_day * (est.min_person_days if est else wbs_days[phase])),
                max_amount=money(per_wbs_day * (est.max_person_days if est else wbs_days[phase])),
            )
        )

    total_days = round(sum(line.person_days for line in lines), 2)
    timeline_days = total_working_days(run.schedule) or total_days
    per_month = card.contract.working_days_per_month
    months = max(1, math.ceil(timeline_days / per_month))
    subtotal = sum(p.amount for p in phases)
    pct = contingency_pct if contingency_pct is not None else contingency_for(run, card)
    odc_team: list[OdcMember] = []
    odc_monthly: float | None = None

    if model == "fixed_price":
        contingency = money(subtotal * unit * pct / 100)
        total = subtotal + contingency
        factor = 1 + pct / 100
        milestones_rules = [(m.name, m.percent) for m in card.milestones]
    elif model == "time_material":
        pct, contingency, factor = 0.0, 0.0, 1.0
        total = subtotal
        milestones_rules = [
            (f"Tháng {i + 1} (theo ngày công thực tế)", 100 / months) for i in range(months)
        ]
    else:  # odc: dedicated team billed monthly
        pct, contingency, factor = 0.0, 0.0, 1.0
        by_role: dict[str, float] = {}
        for line in lines:
            by_role[line.role_key] = by_role.get(line.role_key, 0) + line.person_days
        for key, days in by_role.items():
            fte = max(0.5, round(days / timeline_days * 2) / 2)
            monthly = blended_rate(rates[key], onsite) * fte * per_month
            odc_team.append(
                OdcMember(role_label=rates[key].label, fte=fte, monthly_cost=money(monthly))
            )
        odc_monthly = sum(m.monthly_cost for m in odc_team)
        total = odc_monthly * months
        milestones_rules = [(f"Tháng {i + 1}", 100 / months) for i in range(months)]

    run_cost = card.run_cost_monthly.get(run.pattern.pattern.value)
    if run_cost is not None and run.architecture.deployment.value == "on_prem":
        run_cost *= card.on_prem_run_cost_factor

    overhead_days = round(sum(line.person_days for line in lines if line.kind == "overhead"), 2)
    overhead_roles = sorted({line.role_label for line in lines if line.kind == "overhead"})
    assumptions = [
        f"Mô hình hợp đồng: {MODEL_LABELS[model]}.",
        "Đơn giá theo vai trò là số giả lập trong bảng đơn giá, cần thay bằng đơn giá thật.",
        f"Ngày công = WBS {round(total_days - overhead_days, 2):g}"
        + (
            f" + overhead {overhead_days:g} ({', '.join(overhead_roles)} theo tỉ lệ chuẩn công ty)."
            if overhead_days
            else " (PM đã nằm trong WBS)."
        ),
        f"Tỉ lệ làm onsite {onsite:g}% (đơn giá onsite cao hơn offshore).",
    ]
    if model == "fixed_price":
        assumptions.append(
            f"Dự phòng rủi ro {pct:g}% (cơ bản {card.contingency.base_pct:g}%, "
            f"+{card.contingency.per_high_risk_pct:g}% cho mỗi rủi ro mức 4–5)."
        )
    elif model == "time_material":
        assumptions.append(
            "T&M: số tiền là dự toán; thanh toán hằng tháng theo ngày công thực tế, không cộng dự phòng."
        )
    else:
        assumptions.append(
            f"ODC: đội dự án riêng {months} tháng, {per_month} ngày làm việc/tháng; thanh toán theo tháng."
        )
    assumptions.append("Chưa bao gồm thuế VAT, chi phí bản quyền phần mềm và phần cứng mua mới.")
    if run_cost is not None:
        assumptions.append("Chi phí vận hành/tháng (hạ tầng + LLM API) là ước tính, tính riêng.")

    return Quotation(
        currency=currency,
        contract_model=model,
        onsite_ratio=onsite,
        wbs_person_days=round(total_days - overhead_days, 2),
        overhead_person_days=overhead_days,
        odc_team=odc_team,
        odc_monthly_cost=odc_monthly,
        months=months,
        lines=lines,
        phases=phases,
        subtotal=subtotal,
        contingency_pct=pct,
        contingency=contingency,
        total=total,
        total_min=money(sum(p.min_amount for p in phases) * unit * factor)
        if model != "odc"
        else total,
        total_max=money(sum(p.max_amount for p in phases) * unit * factor)
        if model != "odc"
        else total,
        monthly_run_cost=money(run_cost) if run_cost is not None else None,
        milestones=[
            Milestone(
                name=name, percent=round(percent, 2), amount=money(total * unit * percent / 100)
            )
            for name, percent in milestones_rules
        ],
        assumptions=assumptions,
    )
