"""Context-aware mock outputs for steps whose valid answer depends on the input
(WBS sums must match the estimates; the requirement matrix must echo every requirement id).
Used only by MockLLM, i.e. tests and offline demos without a real LLM."""

import json
import re
from typing import Any

PHASE_TASKS = {
    "poc": ["Khảo sát dữ liệu & yêu cầu", "Dựng prototype {c}", "Đánh giá kết quả PoC với khách"],
    "mvp": [
        "Phân tích & thiết kế chi tiết",
        "Xây dựng {c}",
        "Xây dựng {c}",
        "Tích hợp hệ thống",
        "Kiểm thử & đánh giá chất lượng",
    ],
    "production": [
        "Hardening & bảo mật",
        "Mở rộng {c}",
        "Giám sát & vận hành",
        "Đào tạo người dùng & bàn giao",
    ],
}


def _context(user: str) -> dict[str, Any]:
    return json.loads(user.split("\n\nLần trước output không hợp lệ")[0])


def _split(total: int, parts: int) -> list[int]:
    parts = max(1, min(parts, total))
    base, extra = divmod(total, parts)
    return [base + (1 if i < extra else 0) for i in range(parts)]


def generate_wbs(user: str) -> str:
    ctx = _context(user)
    arch = ctx.get("architecture") or {}
    components = [c["name"] for c in arch.get("components", [])] or ["giải pháp"]
    tasks: list[dict[str, Any]] = []
    previous_last: str | None = None
    for estimate in arch.get("estimates", []):
        phase = estimate["phase"]
        target = (estimate["min_person_days"] + estimate["max_person_days"]) // 2
        team = estimate.get("team") or ["Engineer"]
        names = PHASE_TASKS.get(phase, PHASE_TASKS["mvp"])
        days = _split(target, len(names))
        first_id = f"W{len(tasks) + 1}"
        middle: list[str] = []
        for i, (name, d) in enumerate(zip(names, days, strict=False)):
            task_id = f"W{len(tasks) + 1}"
            if i == 0:
                deps = [previous_last] if previous_last else []
            elif i == len(names) - 1:
                deps = middle or [first_id]
            else:
                deps = [first_id]
                middle.append(task_id)
            tasks.append(
                {
                    "id": task_id,
                    "phase": phase,
                    "name": name.format(c=components[(i - 1) % len(components)]),
                    "role": team[i % len(team)],
                    "person_days": d,
                    "depends_on": deps,
                    "deliverable": None,
                }
            )
        previous_last = tasks[-1]["id"]
    return json.dumps({"tasks": tasks, "notes": ["WBS sinh bởi mock LLM."]}, ensure_ascii=False)


def generate_requirements(user: str) -> str:
    ctx = _context(user)
    components = [c["name"] for c in (ctx.get("architecture") or {}).get("components", [])] or [
        None
    ]
    items = []
    for n, req in enumerate(ctx.get("requirements", [])):
        text = req.get("text", "")
        if len(text) < 15:
            coverage, note = "needs_clarification", "Yêu cầu quá ngắn, cần khách mô tả rõ hơn."
        elif re.search(r"mobile|di động|offline|ネイティブ", text, re.IGNORECASE):
            coverage, note = "not_supported", "Ngoài phạm vi đề xuất (ứng dụng di động/offline)."
        elif re.search(r"tích hợp|integration|連携|sso|erp|api", text, re.IGNORECASE):
            coverage, note = (
                "partial",
                "Đáp ứng khi khách cung cấp API/quyền truy cập hệ thống liên quan.",
            )
        else:
            coverage, note = "full", "Đáp ứng trong phạm vi giải pháp đề xuất."
        items.append(
            {
                "req_id": req["id"],
                "coverage": coverage,
                "component": components[n % len(components)]
                if coverage != "not_supported"
                else None,
                "note": note,
            }
        )
    return json.dumps({"items": items, "skipped": False}, ensure_ascii=False)


EMAIL_TEMPLATES = {
    "vi": {
        "subject": "Xin thông tin bổ sung cho yêu cầu: {goal}",
        "greeting": "Kính gửi {{client_name}},",
        "intro": "Cảm ơn Quý công ty đã gửi yêu cầu về: {goal}\nĐể đề xuất giải pháp phù hợp, chúng tôi xin phép hỏi thêm một số thông tin sau:",
        "blocking": " (cần thiết để đề xuất giải pháp)",
        "outro": "Quý công ty có thể trả lời trực tiếp email này hoặc điền vào file Q&A đính kèm.\nTrân trọng,\n{{sender_name}}",
    },
    "en": {
        "subject": "Additional information request: {goal}",
        "greeting": "Dear {{client_name}},",
        "intro": "Thank you for your inquiry regarding: {goal}\nTo propose the most suitable solution, could you please help us with the following questions:",
        "blocking": " (required before we can propose a solution)",
        "outro": "Feel free to reply to this email directly or fill in the attached Q&A sheet.\nBest regards,\n{{sender_name}}",
    },
    "ja": {
        "subject": "【ご確認のお願い】{goal}について",
        "greeting": "{{client_name}} 御中",
        "intro": "平素より大変お世話になっております。\nこの度は「{goal}」についてご相談いただき、誠にありがとうございます。\n最適なご提案のため、以下の点についてご教示いただけますと幸いです。",
        "blocking": "（ご提案に必須）",
        "outro": "本メールへのご返信、または添付の質問票へのご記入にてご回答いただけますと幸いです。\n何卒よろしくお願い申し上げます。\n{{sender_name}}",
    },
}


def generate_client_email(user: str) -> str:
    ctx = _context(user)
    lang = ctx.get("language", "vi")
    t = EMAIL_TEMPLATES.get(lang, EMAIL_TEMPLATES["vi"])
    goal = (ctx.get("intake") or {}).get("business_goal", "").rstrip(".。")
    short = goal if len(goal) <= 70 else goal[:70].rsplit(" ", 1)[0] + "…"
    lines = [
        f"{n}. {q['question']}" + (t["blocking"] if q.get("blocking") else "")
        for n, q in enumerate(ctx.get("questions", []), start=1)
    ]
    body = "\n\n".join([t["greeting"], t["intro"].format(goal=goal), "\n".join(lines), t["outro"]])
    return json.dumps(
        {"subject": t["subject"].format(goal=short), "body": body}, ensure_ascii=False
    )


def generate_translate_items(user: str) -> str:
    """Mock cannot translate: returns the items unchanged (same count and order)."""
    return json.dumps({"items": _context(user).get("items", [])}, ensure_ascii=False)


GENERATORS = {
    "wbs": generate_wbs,
    "requirements": generate_requirements,
    "client_email": generate_client_email,
    "translate_items": generate_translate_items,
}
