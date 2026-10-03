import re

from app.agents.schedule import find_cycle
from app.agents.step import Step
from app.schemas.architecture import ArchitectureResult, PhaseEstimate
from app.schemas.common import Confidence, Phase
from app.schemas.deal import ClientEmail
from app.schemas.feasibility import FeasibilityResult
from app.schemas.gaps import GapResult
from app.schemas.intake import IntakeResult
from app.schemas.pattern import PatternResult
from app.schemas.proposal import ProposalResult, TranslatedItems, TranslationResult
from app.schemas.requirements import RequirementMatrix
from app.schemas.wbs import WBSResult

ESTIMATE_TOLERANCE = 0.2


def validate_intake(result: IntakeResult) -> IntakeResult:
    if not result.business_goal.strip():
        raise ValueError("business_goal không được rỗng")
    return result


def validate_gaps(result: GapResult) -> GapResult:
    ids = [q.id for q in result.questions]
    if len(set(ids)) != len(ids):
        for index, question in enumerate(result.questions, start=1):
            question.id = f"q{index}"
    result.can_proceed = not any(q.blocking for q in result.questions)
    return result


def validate_pattern(result: PatternResult) -> PatternResult:
    if any(r.pattern == result.pattern for r in result.rejected):
        raise ValueError(f"pattern '{result.pattern.value}' không được nằm trong rejected")
    if result.confidence == Confidence.HIGH and len(result.rejected) < 2:
        raise ValueError("confidence = high thì rejected phải có ít nhất 2 mục")
    return result


def validate_feasibility(result: FeasibilityResult) -> FeasibilityResult:
    result.risks = sorted(result.risks, key=lambda r: r.severity, reverse=True)
    return result


def _deviates(value: int, baseline: int) -> bool:
    return abs(value - baseline) > ESTIMATE_TOLERANCE * baseline


def make_architecture_validator(computed: dict[Phase, tuple[int, int]]):
    def validate_architecture(result: ArchitectureResult) -> ArchitectureResult:
        for estimate in result.estimates:
            if estimate.min_person_days > estimate.max_person_days:
                raise ValueError(f"{estimate.phase.value}: min_person_days > max_person_days")
            baseline = computed.get(estimate.phase)
            if baseline is None:
                continue
            low, high = baseline
            off = _deviates(estimate.min_person_days, low) or _deviates(
                estimate.max_person_days, high
            )
            if off and not (estimate.adjustment_note or "").strip():
                raise ValueError(
                    f"{estimate.phase.value}: lệch quá ±20% so với computed_estimates "
                    f"[{low}, {high}] nhưng thiếu adjustment_note"
                )
        # A diagram is optional: drop anything that is not a Mermaid flowchart instead of retrying.
        if result.mermaid is not None:
            diagram = result.mermaid.strip().removeprefix("```mermaid").removesuffix("```").strip()
            result.mermaid = diagram if diagram.startswith(("flowchart", "graph")) else None
        return result

    return validate_architecture


def validate_proposal(result: ProposalResult) -> ProposalResult:
    for heading in ("Giả định", "Rủi ro"):
        pattern = r"^#{1,6}[^\n]*" + re.escape(heading)
        if not re.search(pattern, result.markdown, flags=re.MULTILINE):
            raise ValueError(f"markdown thiếu heading '{heading}'")
    return result


INTAKE = Step("intake", "01_intake.md", IntakeResult, post_validate=validate_intake)
GAPS = Step(
    "gaps",
    "02_gaps.md",
    GapResult,
    kb_keys=["risk_checklist", "solution_patterns:key_questions"],
    post_validate=validate_gaps,
)
PATTERN = Step(
    "pattern",
    "03_pattern.md",
    PatternResult,
    kb_keys=["solution_patterns"],
    post_validate=validate_pattern,
)
FEASIBILITY = Step(
    "feasibility",
    "04_feasibility.md",
    FeasibilityResult,
    kb_keys=["risk_checklist", "compliance_markets"],
    post_validate=validate_feasibility,
)
PROPOSAL = Step("proposal", "06_proposal.md", ProposalResult, post_validate=validate_proposal)


def validate_translation(result: TranslationResult) -> TranslationResult:
    if len(result.markdown.strip()) < 20:
        raise ValueError("markdown bản dịch quá ngắn")
    return result


TRANSLATE = Step(
    "translate", "07_translate.md", TranslationResult, post_validate=validate_translation
)


def architecture_step(computed: dict[Phase, tuple[int, int]]) -> Step[ArchitectureResult]:
    return Step(
        "architecture",
        "05_architecture.md",
        ArchitectureResult,
        kb_keys=["reference_projects"],
        post_validate=make_architecture_validator(computed),
    )


PHASES = [Phase.POC, Phase.MVP, Phase.PRODUCTION]


def make_wbs_validator(estimates: list[PhaseEstimate]):
    """Task person-days per phase must add up to the architecture estimate range (code-checked)."""

    def validate_wbs(result: WBSResult) -> WBSResult:
        ids = [t.id for t in result.tasks]
        if len(set(ids)) != len(ids):
            raise ValueError("id của task trong WBS bị trùng")
        phase_of = {t.id: PHASES.index(t.phase) for t in result.tasks}
        for task in result.tasks:
            unknown = [d for d in task.depends_on if d not in phase_of]
            if unknown:
                raise ValueError(f"{task.id}: depends_on tham chiếu task không tồn tại {unknown}")
            later = [d for d in task.depends_on if phase_of[d] > phase_of[task.id]]
            if later:
                raise ValueError(f"{task.id}: không được phụ thuộc task ở giai đoạn sau {later}")
        if cycle := find_cycle(result):
            raise ValueError(f"WBS có phụ thuộc vòng: {' -> '.join(cycle)}")
        for estimate in estimates:
            total = sum(t.person_days for t in result.tasks if t.phase == estimate.phase)
            low, high = estimate.min_person_days, estimate.max_person_days
            if not low <= total <= high:
                raise ValueError(
                    f"Tổng ngày công phase {estimate.phase.value} = {total}, phải nằm trong "
                    f"[{low}, {high}] theo bước architecture"
                )
        return result

    return validate_wbs


def wbs_step(estimates: list[PhaseEstimate]) -> Step[WBSResult]:
    return Step("wbs", "08_wbs.md", WBSResult, post_validate=make_wbs_validator(estimates))


def make_requirements_validator(expected_ids: list[str]):
    """Every requirement id in the batch must be assessed exactly once (code-checked)."""

    def validate_requirements(result: RequirementMatrix) -> RequirementMatrix:
        got = [i.req_id for i in result.items]
        missing = [i for i in expected_ids if i not in got]
        extra = [i for i in got if i not in expected_ids]
        duplicated = sorted({i for i in got if got.count(i) > 1})
        if missing or extra or duplicated:
            raise ValueError(
                f"Bảng đáp ứng phải có đúng mỗi requirement một dòng. Thiếu: {missing[:10]}, "
                f"thừa: {extra[:10]}, trùng: {duplicated[:10]}"
            )
        order = {rid: n for n, rid in enumerate(expected_ids)}
        result.items.sort(key=lambda i: order[i.req_id])
        return result

    return validate_requirements


def requirements_step(expected_ids: list[str]) -> Step[RequirementMatrix]:
    return Step(
        "requirements",
        "09_requirements.md",
        RequirementMatrix,
        post_validate=make_requirements_validator(expected_ids),
    )


def validate_client_email(result: ClientEmail) -> ClientEmail:
    if not result.subject.strip() or len(result.body.strip()) < 50:
        raise ValueError("Email cần có tiêu đề và nội dung đầy đủ")
    return result


CLIENT_EMAIL = Step(
    "client_email", "10_client_email.md", ClientEmail, post_validate=validate_client_email
)


def translate_items_step(count: int) -> Step[TranslatedItems]:
    def validate(result: TranslatedItems) -> TranslatedItems:
        if len(result.items) != count:
            raise ValueError(f"Cần trả về đúng {count} mục theo thứ tự, nhận {len(result.items)}")
        return result

    return Step("translate_items", "11_translate_items.md", TranslatedItems, post_validate=validate)
