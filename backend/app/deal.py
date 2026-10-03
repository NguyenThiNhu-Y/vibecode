"""Deal stage follows the analysis status until a human sets a manual stage."""

from app.schemas.deal import DealStage
from app.schemas.run import RunStatus, ScopingRun

MANUAL = {DealStage.SENT, DealStage.WON, DealStage.LOST, DealStage.NO_BID}
AUTO = {
    RunStatus.WAITING_CLARIFICATION: DealStage.CLARIFYING,
    RunStatus.DONE: DealStage.REVIEWING,
    RunStatus.REJECTED: DealStage.REVIEWING,
    RunStatus.APPROVED: DealStage.READY,
}


def pricing_ok(run: ScopingRun) -> bool:
    """Second approval: a run with a quotation needs the pricing sign-off before it is ready."""
    return run.quotation is None or bool(run.pricing_approval and run.pricing_approval.approved)


def sync_deal_stage(run: ScopingRun) -> None:
    if run.deal_stage in MANUAL:
        return
    if run.status in AUTO:
        stage = AUTO[run.status]
        run.deal_stage = (
            DealStage.REVIEWING if stage == DealStage.READY and not pricing_ok(run) else stage
        )
