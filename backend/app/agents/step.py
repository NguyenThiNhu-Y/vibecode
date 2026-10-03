import json
import logging
import re
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ValidationError

from app.knowledge.loader import kb_text
from app.llm.base import LLMClient

logger = logging.getLogger("scopeai.step")

PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts"
SCHEMA_INSTRUCTION = "Chỉ trả về MỘT object JSON hợp lệ theo JSON Schema sau, không kèm giải thích:"

M = TypeVar("M", bound=BaseModel)


class StepError(Exception):
    def __init__(self, step: str, message: str):
        super().__init__(f"{step}: {message}")
        self.step = step
        self.message = message


def extract_json(text: str) -> Any:
    """Strip code fences and parse the span from the first '{' to the last '}'."""
    cleaned = re.sub(r"```[a-zA-Z]*", "", text)
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("Không tìm thấy object JSON trong output")
    return json.loads(cleaned[start : end + 1])


class Step(Generic[M]):
    def __init__(
        self,
        name: str,
        prompt_file: str,
        output_model: type[M],
        kb_keys: list[str] | None = None,
        max_retries: int = 2,
        post_validate: Callable[[M], M] | None = None,
    ):
        self.name = name
        self.prompt_file = prompt_file
        self.output_model = output_model
        self.kb_keys = kb_keys or []
        self.max_retries = max_retries
        self.post_validate = post_validate

    def build_system(self) -> str:
        template = (PROMPT_DIR / self.prompt_file).read_text(encoding="utf-8")
        knowledge = kb_text(self.kb_keys) if self.kb_keys else ""
        schema = json.dumps(self.output_model.model_json_schema(), ensure_ascii=False)
        return f"{template.replace('{{knowledge}}', knowledge)}\n\n{SCHEMA_INSTRUCTION}\n{schema}"

    async def run(self, llm: LLMClient, context: dict[str, Any]) -> tuple[M, int]:
        """Call the LLM until the output validates. Returns (result, total latency in ms)."""
        system = self.build_system()
        user = json.dumps(context, ensure_ascii=False, default=str)
        last_error: str | None = None
        started = time.perf_counter()
        for attempt in range(1, self.max_retries + 2):
            message = user
            if last_error is not None:
                message = (
                    f"{user}\n\nLần trước output không hợp lệ: {last_error}. "
                    "Hãy trả lại JSON đúng schema."
                )
            call_started = time.perf_counter()
            raw = await llm.complete(system, message, tag=self.name)
            logger.info(
                "step=%s attempt=%d latency_ms=%d output_chars=%d",
                self.name,
                attempt,
                int((time.perf_counter() - call_started) * 1000),
                len(raw),
            )
            try:
                result = self.output_model.model_validate(extract_json(raw))
                if self.post_validate is not None:
                    result = self.post_validate(result)
            except (ValueError, ValidationError) as exc:
                last_error = str(exc)[:500]
                logger.warning("step=%s attempt=%d invalid: %s", self.name, attempt, last_error)
                continue
            return result, int((time.perf_counter() - started) * 1000)
        raise StepError(self.name, f"thất bại sau {self.max_retries + 1} lần thử: {last_error}")
