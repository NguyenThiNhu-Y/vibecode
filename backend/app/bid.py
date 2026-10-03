"""Bid / No-bid checklist: code suggests what it can from the analysis, a human confirms."""

from pathlib import Path
from typing import Any

from app.knowledge import loader
from app.schemas.common import SolutionPattern
from app.schemas.run import ScopingRun
from app.schemas.settings import BidCriterion

BID_THRESHOLD = 70  # % of weight met -> recommend bidding
CONSIDER_THRESHOLD = 50
MIN_ANSWERED = 60  # % of weight that must be known before recommending


def load_bid_criteria(kb_dir: Path | None = None) -> list[BidCriterion]:
    return [
        BidCriterion.model_validate(c)
        for c in loader.load_yaml("bid_criteria.yaml", kb_dir or loader.KB_DIR) or []
    ]


def auto_check(rule: str, run: ScopingRun) -> tuple[bool | None, str]:
    """(suggested value, reason) for one rule; None when the analysis cannot tell yet."""
    f, p = run.feasibility, run.pattern
    if rule == "solution_clear":
        if p is None:
            return None, "Chưa chọn hướng giải pháp"
        ok = p.pattern != SolutionPattern.NEEDS_CLARIFICATION
        return ok, f"Hướng giải pháp: {p.pattern.value}, độ tin cậy {p.confidence.value}"
    if rule == "data_ready":
        return (
            (None, "Chưa đánh giá khả thi")
            if f is None
            else (f.data_readiness >= 3, f"Dữ liệu sẵn sàng {f.data_readiness}/5")
        )
    if rule == "business_value":
        return (
            (None, "Chưa đánh giá khả thi")
            if f is None
            else (f.business_value >= 3, f"Giá trị kinh doanh {f.business_value}/5")
        )
    if rule == "risk_acceptable":
        if f is None:
            return None, "Chưa đánh giá rủi ro"
        worst = max((r.severity for r in f.risks), default=0)
        return worst < 5, f"Rủi ro cao nhất mức {worst}/5"
    if rule == "requirements_fit":
        m = run.requirements
        if m is None or m.skipped or not m.items:
            return None, "Không có file requirement để đối chiếu"
        fit = sum(1 for i in m.items if i.coverage in ("full", "partial")) / len(m.items)
        return fit >= 0.7, f"Đáp ứng đầy đủ hoặc một phần {round(fit * 100)}% requirement"
    if rule == "budget_known":
        if run.intake is None:
            return None, "Chưa phân tích yêu cầu"
        budget = run.intake.budget
        return bool(budget), f"Ngân sách: {budget}" if budget else "Khách chưa nêu ngân sách"
    return None, ""


def evaluate_bid(run: ScopingRun, criteria: list[BidCriterion]) -> dict[str, Any]:
    checks = run.bid.checks if run.bid else {}
    rows = []
    for c in criteria:
        suggested, reason = auto_check(c.auto, run) if c.auto else (None, "Presales tự đánh giá")
        confirmed = checks.get(c.id)
        rows.append(
            {
                "id": c.id,
                "label": c.label,
                "weight": c.weight,
                "auto": c.auto is not None,
                "suggested": suggested,
                "reason": reason,
                "value": confirmed,
                "effective": confirmed if confirmed is not None else suggested,
            }
        )
    total = sum(r["weight"] for r in rows) or 1
    met = sum(r["weight"] for r in rows if r["effective"] is True)
    known = sum(r["weight"] for r in rows if r["effective"] is not None)
    score = round(met / total * 100)
    answered = round(known / total * 100)
    if answered < MIN_ANSWERED:
        recommendation = "need_info"
    elif score >= BID_THRESHOLD:
        recommendation = "bid"
    elif score >= CONSIDER_THRESHOLD:
        recommendation = "consider"
    else:
        recommendation = "no_bid"
    return {
        "criteria": rows,
        "score": score,
        "answered": answered,
        "recommendation": recommendation,
        "decision": run.bid.decision if run.bid else None,
        "note": run.bid.note if run.bid else None,
        "decided_at": run.bid.decided_at.isoformat() if run.bid and run.bid.decided_at else None,
    }
