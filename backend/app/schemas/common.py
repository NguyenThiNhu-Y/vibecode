from enum import Enum
from typing import Literal

Language = Literal["vi", "en", "ja"]
StepName = Literal[
    "intake", "gaps", "pattern", "feasibility", "architecture", "wbs", "requirements", "proposal"
]
STEP_NAMES: tuple[str, ...] = (
    "intake",
    "gaps",
    "pattern",
    "feasibility",
    "architecture",
    "wbs",
    "requirements",
    "proposal",
)


class Confidence(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class SolutionPattern(str, Enum):
    NO_AI_RULE_BASED = "no_ai_rule_based"
    CLASSIC_ML = "classic_ml"
    RAG = "rag"
    AGENT = "agent"
    FINE_TUNE = "fine_tune"
    NEEDS_CLARIFICATION = "needs_clarification"


class QuestionTopic(str, Enum):
    DATA = "data"
    USERS = "users"
    ACCURACY = "accuracy"
    INFRA = "infra"
    BUDGET = "budget"
    TIMELINE = "timeline"
    COMPLIANCE = "compliance"
    INTEGRATION = "integration"


class RiskCategory(str, Enum):
    DATA = "data"
    ACCURACY = "accuracy"
    PRIVACY = "privacy"
    COMPLIANCE = "compliance"
    COST = "cost"
    ADOPTION = "adoption"


class GoRecommendation(str, Enum):
    GO = "go"
    GO_WITH_POC = "go_with_poc"
    NOT_NOW = "not_now"


class Deployment(str, Enum):
    CLOUD = "cloud"
    ON_PREM = "on_prem"
    HYBRID = "hybrid"


class Phase(str, Enum):
    POC = "poc"
    MVP = "mvp"
    PRODUCTION = "production"


# Bidding extension (docs/BIDDING_SPEC.md 3.1)
class WorkType(str, Enum):
    AI = "AI"
    BE = "BE"
    FE = "FE"
    QA = "QA"
    BA = "BA"
    PM = "PM"
    INFRA = "INFRA"
    DESIGN = "DESIGN"
    DATA = "DATA"


class Priority(str, Enum):
    LOW = "low"
    MID = "mid"
    HIGH = "high"


class TaskTag(str, Enum):
    DATA_PREP = "data_prep"
    EVALUATION = "evaluation"
    PROMPT_TUNING = "prompt_tuning"
    INTEGRATION = "integration"
    SECURITY = "security"
    DOCUMENTATION = "documentation"
