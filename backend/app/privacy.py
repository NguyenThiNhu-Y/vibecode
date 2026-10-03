"""Mask personal data in free text before it is sent to an external LLM."""

import re

# Order matters: URLs before emails so "https://a.b/x@y" is treated as one URL.
_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("url", re.compile(r"https?://[^\s<>\"')]*[^\s<>\"').,;:!?]")),
    ("email", re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")),
    # Phone numbers starting with + or 0, 9–13 digits, separated by spaces, dots or dashes.
    ("phone", re.compile(r"(?<![\w.])(?:\+\d{1,3}[\s.-]?|0)\d(?:[\s.-]?\d){7,11}(?![\w])")),
]

LABELS = {"email": "email", "phone": "số điện thoại", "url": "đường link"}


def mask_pii(text: str) -> tuple[str, dict[str, int]]:
    """Replace PII with stable placeholders like [EMAIL_1]. Returns (masked, counts per type)."""
    counts: dict[str, int] = {}
    seen: dict[str, str] = {}

    for kind, pattern in _PATTERNS:

        def replace(match: re.Match[str], kind: str = kind) -> str:
            value = match.group(0)
            if value not in seen:
                counts[kind] = counts.get(kind, 0) + 1
                seen[value] = f"[{kind.upper()}_{counts[kind]}]"
            return seen[value]

        text = pattern.sub(replace, text)
    return text, counts
