from pydantic import BaseModel, Field

from app.schemas.common import QuestionTopic


class ClarifyingQuestion(BaseModel):
    id: str  # "q1", "q2", ... unique within a run
    topic: QuestionTopic
    question: str  # written in intake.language
    why_it_matters: str  # Vietnamese
    blocking: bool


class GapResult(BaseModel):
    missing_info: list[str]
    questions: list[ClarifyingQuestion] = Field(max_length=7)
    can_proceed: bool  # = not any(q.blocking for q in questions)
