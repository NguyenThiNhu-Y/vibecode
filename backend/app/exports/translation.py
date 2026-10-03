"""Translate agent-written deck content into the customer's language (LLM, cached per run)."""

from collections.abc import Callable

from app.agents.steps import translate_items_step
from app.exports.slides import deck_texts
from app.llm.base import LLMClient
from app.privacy import mask_pii
from app.schemas.run import ScopingRun

BATCH = 60


async def ensure_deck_translations(
    run: ScopingRun, lang: str, llm: LLMClient
) -> Callable[[str], str]:
    """Fill run.deck_translations[lang] for every deck string; return a lookup function."""
    if lang == "vi":
        return lambda s: s
    cache = run.deck_translations.setdefault(lang, {})
    missing = [t for t in deck_texts(run) if t not in cache]
    for i in range(0, len(missing), BATCH):
        batch = missing[i : i + BATCH]
        context = {"target_language": lang, "items": [mask_pii(t)[0] for t in batch]}
        result, _ = await translate_items_step(len(batch)).run(llm, context)
        cache.update(zip(batch, result.items, strict=True))
    return lambda s: cache.get(s, s)
