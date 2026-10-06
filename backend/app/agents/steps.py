import re

from app.agents.schedule import find_cycle, lifted_dependencies
from app.agents.step import Step
from app.schemas.architecture import ArchitectureResult
from app.schemas.common import Confidence, Phase, Priority, SolutionPattern, TaskTag, WorkType
from app.schemas.deal import ClientEmail
from app.schemas.feasibility import FeasibilityResult
from app.schemas.gaps import GapResult
from app.schemas.intake import IntakeResult
from app.schemas.pattern import PatternResult
from app.schemas.proposal import ProposalResult, TranslatedItems, TranslationResult
from app.schemas.requirements import RequirementMatrix
from app.schemas.wbs import PHASE_ORDER, WbsResult, children_map, leaves, parent_id

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
    for question in result.questions:
        if question.blocking:
            question.priority = Priority.HIGH  # a question that blocks the analysis is never low
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


WBS_ID = re.compile(r"^[1-9]\d*(\.[1-9]\d*){0,2}$")
AI_PATTERNS_EXEMPT = {SolutionPattern.NO_AI_RULE_BASED, SolutionPattern.NEEDS_CLARIFICATION}


def _check_tree(result: WbsResult) -> None:
    ids = [i.id for i in result.items]
    duplicated = sorted({i for i in ids if ids.count(i) > 1})
    if duplicated:
        raise ValueError(f"id trong WBS bị trùng: {duplicated[:10]}")
    by_id = {i.id: i for i in result.items}
    kids = children_map(result)
    for item in result.items:
        if not WBS_ID.match(item.id):
            raise ValueError(f"id '{item.id}' sai dạng; dùng 1, 1.2, 1.2.3")
        if item.level != item.id.count(".") + 1:
            raise ValueError(f"{item.id}: level phải là {item.id.count('.') + 1} theo id")
        parent = parent_id(item.id)
        if parent is not None and parent not in by_id:
            raise ValueError(f"{item.id}: không có node cha {parent}")
        if parent is not None and by_id[parent].phase != item.phase:
            raise ValueError(f"{item.id}: phase phải giống node cha {parent}")
        if item.level == 1 and item.id not in kids:
            raise ValueError(f"{item.id}: nhóm cấp 1 phải có task con")
        if item.id not in kids and (item.type is None or item.estimate_md is None):
            raise ValueError(f"{item.id}: node lá phải có type và estimate_md")
        if item.phase == Phase.PRODUCTION and item.level == 3:
            raise ValueError(
                f"{item.id}: giai đoạn production chỉ có task mức tổng, không sub-task"
            )


def _check_dependencies(result: WbsResult) -> None:
    order = {i.id: PHASE_ORDER.index(i.phase) for i in result.items}
    for item in result.items:
        unknown = [d for d in item.depends_on if d not in order]
        if unknown:
            raise ValueError(f"{item.id}: depends_on tham chiếu id không tồn tại {unknown}")
        later = [d for d in item.depends_on if order[d] > order[item.id]]
        if later:
            raise ValueError(f"{item.id}: không được phụ thuộc task ở giai đoạn sau {later}")
    raw = {i.id: i.depends_on for i in result.items}
    if (cycle := find_cycle(raw)) or (cycle := find_cycle(lifted_dependencies(result))):
        raise ValueError(f"WBS có phụ thuộc vòng: {' -> '.join(cycle)}")


def make_wbs_validator(
    pattern: SolutionPattern,
    computed: dict[Phase, tuple[int, int]],
    phases: list[Phase],
):
    """docs/BIDDING_SPEC.md 2.1. Parent estimates and phase totals were already recomputed by
    code when the result was parsed (WbsResult.rollup)."""

    def validate_wbs(result: WbsResult) -> WbsResult:
        _check_tree(result)
        _check_dependencies(result)
        present = {i.phase for i in result.items}
        missing = [p.value for p in phases if p not in present]
        extra = [p.value for p in present if p not in phases]
        if missing or extra:
            raise ValueError(
                f"WBS phải có đúng các giai đoạn của architecture; thiếu {missing}, thừa {extra}"
            )
        for phase in present:
            types = {leaf.type for leaf in leaves(result) if leaf.phase == phase}
            lacking = [t.value for t in (WorkType.PM, WorkType.QA) if t not in types]
            if lacking:
                raise ValueError(f"Giai đoạn {phase.value} thiếu task loại {lacking}")
        if pattern not in AI_PATTERNS_EXEMPT:
            tags = {tag for item in result.items for tag in item.tags}
            lacking_tags = [
                t.value for t in (TaskTag.DATA_PREP, TaskTag.EVALUATION) if t not in tags
            ]
            if lacking_tags:
                raise ValueError(f"Giải pháp có AI phải có task gắn tag {lacking_tags}")
        for total in result.totals:
            if total.phase not in computed:
                continue
            low, high = computed[total.phase]
            within = (
                low * (1 - ESTIMATE_TOLERANCE) <= total.total_md <= high * (1 + ESTIMATE_TOLERANCE)
            )
            if not within and not (total.adjustment_note or "").strip():
                raise ValueError(
                    f"Tổng effort {total.phase.value} = {total.total_md:g} MD, ngoài khoảng "
                    f"[{low * 0.8:g}, {high * 1.2:g}] của computed_estimates: phải ghi "
                    f"adjustment_note cho giai đoạn này trong totals"
                )
        return result

    return validate_wbs


def wbs_step(
    pattern: SolutionPattern, computed: dict[Phase, tuple[int, int]], phases: list[Phase]
) -> Step[WbsResult]:
    return Step(
        "wbs",
        "08_wbs.md",
        WbsResult,
        kb_keys=["wbs_templates"],
        post_validate=make_wbs_validator(pattern, computed, phases),
    )


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
