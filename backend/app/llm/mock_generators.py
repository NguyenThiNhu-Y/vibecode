"""Context-aware mock outputs for steps whose valid answer depends on the input
(WBS sums must match the estimates; the requirement matrix must echo every requirement id).
Used only by MockLLM, i.e. tests and offline demos without a real LLM."""

import json
import re
from typing import Any

# (name, type, tags) per phase; "{c}" takes a component name from the architecture.
PHASE_TASKS: dict[str, list[tuple[str, str, list[str]]]] = {
    "poc": [
        ("Kick-off và quản lý PoC", "PM", []),
        ("Khảo sát dữ liệu & yêu cầu", "BA", []),
        ("Chuẩn bị dữ liệu mẫu", "DATA", ["data_prep"]),
        ("Dựng prototype {c}", "AI", []),
        ("Đánh giá kết quả PoC", "AI", ["evaluation"]),
        ("Test và nghiệm thu PoC", "QA", []),
    ],
    "mvp": [
        ("Quản lý dự án MVP", "PM", []),
        ("Phân tích & thiết kế chi tiết", "BA", []),
        ("Chuẩn bị & làm sạch dữ liệu", "DATA", ["data_prep"]),
        ("Xây dựng {c}", "AI", []),
        ("Xây dựng {c}", "BE", ["integration"]),
        ("Giao diện người dùng", "FE", []),
        ("Bộ đánh giá chất lượng", "AI", ["evaluation"]),
        ("Test và nghiệm thu MVP", "QA", []),
        ("Tài liệu và bàn giao", "BA", ["documentation"]),
    ],
    "production": [
        ("Quản lý triển khai", "PM", []),
        ("Hardening & bảo mật", "INFRA", ["security"]),
        ("Mở rộng {c}", "BE", []),
        ("Giám sát & vận hành", "INFRA", []),
        ("UAT và nghiệm thu", "QA", []),
        ("Đào tạo & bàn giao", "BA", ["documentation"]),
    ],
}
PHASE_GROUPS = {"poc": "Giai đoạn PoC", "mvp": "Giai đoạn MVP", "production": "Production"}


def _context(user: str) -> dict[str, Any]:
    return json.loads(user.split("\n\nLần trước output không hợp lệ")[0])


def _split(total: int, parts: int) -> list[int]:
    parts = max(1, min(parts, total))
    base, extra = divmod(total, parts)
    return [base + (1 if i < extra else 0) for i in range(parts)]


def generate_wbs(user: str) -> str:
    """3-level WBS that passes the code checks: phase totals at the middle of
    computed_estimates, leaves <= 10 MD, PM and QA in every phase, data_prep / evaluation tags."""
    ctx = _context(user)
    arch = ctx.get("architecture") or {}
    computed = ctx.get("computed_estimates") or {}
    no_ai = (ctx.get("pattern") or {}).get("pattern") == "no_ai_rule_based"
    components = [c["name"] for c in arch.get("components", [])] or ["giải pháp"]
    items: list[dict[str, Any]] = []
    previous_qa: str | None = None
    for group, estimate in enumerate(arch.get("estimates", []), start=1):
        phase = estimate["phase"]
        low, high = computed.get(phase) or (
            estimate["min_person_days"],
            estimate["max_person_days"],
        )
        target = max(len(PHASE_TASKS[phase]), round((low + high) / 2))
        items.append({"id": str(group), "phase": phase, "name": PHASE_GROUPS[phase], "level": 1})
        plan = [
            (name.format(c=components[(i - 1) % len(components)]), "BE" if no_ai and kind == "AI" else kind, tags)
            for i, (name, kind, tags) in enumerate(PHASE_TASKS[phase])
        ]  # fmt: skip
        if phase == "production":  # no sub-tasks: a task over 10 MD becomes several tasks
            waves = max(1, -(-target // (len(plan) * 10)))
            plan = [
                (f"{name} – đợt {k}" if waves > 1 else name, kind, tags)
                for name, kind, tags in plan
                for k in range(1, waves + 1)
            ]
        days = _split(target, len(plan))
        analysis, build, n, qa_task = f"{group}.2", [], 0, None
        for (name, kind, tags), d in zip(plan, days, strict=False):
            n += 1
            tid = f"{group}.{n}"
            deps = (
                [] if n <= 2 else [f"{group}.{k}" for k in build] if kind == "QA" and build
                else [analysis] if kind in ("AI", "BE", "FE", "DATA", "INFRA") else []
            )  # fmt: skip
            if n == 1 and previous_qa:
                deps = [previous_qa]
            if kind in ("AI", "BE", "FE", "DATA"):
                build.append(n)
            if kind == "QA":
                qa_task = tid
            base = {"id": tid, "phase": phase, "name": name, "level": 2, "depends_on": deps}
            leaf = {"type": kind, "priority": "high" if kind in ("AI", "QA") else "mid", "tags": tags,
                    "deliverable": f"Kết quả: {name.lower()}"}  # fmt: skip
            if phase == "production" or d <= 4:
                items.append({**base, **leaf, "estimate_md": d})
                continue
            items.append(base)
            for k, part in enumerate(_split(d, max(2, -(-d // 9))), start=1):  # >= 2 sub-tasks
                items.append({**leaf, "id": f"{tid}.{k}", "phase": phase, "level": 3,
                              "name": f"{name} – phần {k}", "estimate_md": part})  # fmt: skip
        previous_qa = qa_task  # next phase starts after this phase's acceptance
    return json.dumps(
        {
            "items": items,
            "assumptions": ["WBS sinh bởi mock LLM."],
            "out_of_scope": arch.get("out_of_scope", []),
        },
        ensure_ascii=False,
    )


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
