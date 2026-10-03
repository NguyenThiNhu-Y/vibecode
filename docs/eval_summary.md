# ScopeAI – Kết quả evaluation

Sinh tự động bằng `python -m eval.summary` từ `backend/eval/reports/`.
Bộ test gồm các case giả lập trong `backend/eval/cases/`.

> ⚠️ Chưa có report nào chạy bằng LLM thật. Các số liệu dưới đây (nếu có) là từ
> `LLM_PROVIDER=mock` và chỉ chứng minh script chạy đúng, KHÔNG phản ánh chất lượng.

## Tiến triển qua các lần chạy

| Report | Nhãn | LLM | Case | Pattern accuracy | Topic recall | Estimate in range | Schema success | Latency TB |
|---|---|---|---|---|---|---|---|---|
| eval_1002_2323 | mock baseline | mock | 30 | 8/30 (27%) | 73% | 16/24 | 100% | 0.0 s |

## Chi tiết: eval_1002_2323

### Tóm tắt

| Metric | Giá trị |
|---|---|
| Pattern accuracy | 8/30 (27%) |
| Question topic recall | 73% |
| Estimate in range (MVP) | 16/24 |
| Schema success (không cần retry) | 100% |
| Latency trung bình | 0.0 s |
| Case lỗi | không |

### Từng case

| Case | Kỳ vọng | Kết quả | Pattern | Topic recall | MVP | Estimate | Từ cấm | Bước 1 lần/đã chạy | Latency (s) |
|---|---|---|---|---|---|---|---|---|---|
| case_01 | rag | rag | ✅ | 100% | 30–50 | ✅ | – | 7/7 | 0.0 |
| case_02 | rag | rag | ✅ | 33% | 30–50 | ✅ | – | 7/7 | 0.0 |
| case_03 | rag | rag | ✅ | 100% | 30–50 | ✅ | – | 7/7 | 0.0 |
| case_04 | rag | no_ai_rule_based | ❌ | 67% | 10–20 | ❌ | – | 7/7 | 0.0 |
| case_05 | agent | no_ai_rule_based | ❌ | 67% | 10–20 | ❌ | – | 7/7 | 0.0 |
| case_06 | agent | rag | ❌ | 33% | 30–50 | ✅ | – | 7/7 | 0.0 |
| case_07 | agent | rag | ❌ | 67% | 30–50 | ✅ | – | 7/7 | 0.0 |
| case_08 | classic_ml | rag | ❌ | 100% | 30–50 | ✅ | – | 7/7 | 0.0 |
| case_09 | classic_ml | rag | ❌ | 67% | 30–50 | ✅ | – | 7/7 | 0.0 |
| case_10 | no_ai_rule_based | no_ai_rule_based | ✅ | 100% | 10–20 | ✅ | – | 7/7 | 0.0 |
| case_11 | no_ai_rule_based | rag | ❌ | 100% | 30–50 | ❌ | – | 7/7 | 0.0 |
| case_12 | fine_tune | rag | ❌ | 67% | 30–50 | ❌ | – | 7/7 | 0.0 |
| case_13 | needs_clarification | needs_clarification | ✅ | 100% | – | – | – | 2/2 | 0.0 |
| case_14 | needs_clarification | rag | ❌ | 50% | 30–50 | – | – | 7/7 | 0.0 |
| case_15 | needs_clarification | rag | ❌ | 33% | 30–50 | – | – | 7/7 | 0.0 |
| case_16 | rag | rag | ✅ | 67% | 30–50 | ✅ | – | 7/7 | 0.0 |
| case_17 | rag | rag | ✅ | 67% | 30–50 | ✅ | – | 7/7 | 0.0 |
| case_18 | rag | rag | ✅ | 67% | 30–50 | ✅ | – | 7/7 | 0.0 |
| case_19 | agent | rag | ❌ | 67% | 30–50 | ❌ | – | 7/7 | 0.0 |
| case_20 | agent | rag | ❌ | 100% | 30–50 | ✅ | – | 7/7 | 0.0 |
| case_21 | agent | rag | ❌ | 50% | 30–50 | ✅ | – | 7/7 | 0.0 |
| case_22 | classic_ml | rag | ❌ | 100% | 30–50 | ✅ | – | 7/7 | 0.0 |
| case_23 | classic_ml | rag | ❌ | 100% | 30–50 | ✅ | – | 7/7 | 0.0 |
| case_24 | classic_ml | no_ai_rule_based | ❌ | 67% | 10–20 | ❌ | – | 7/7 | 0.0 |
| case_25 | no_ai_rule_based | rag | ❌ | 100% | 30–50 | ❌ | – | 7/7 | 0.0 |
| case_26 | no_ai_rule_based | rag | ❌ | 100% | 30–50 | ❌ | – | 7/7 | 0.0 |
| case_27 | fine_tune | rag | ❌ | 67% | 30–50 | ✅ | – | 7/7 | 0.0 |
| case_28 | needs_clarification | rag | ❌ | 50% | 30–50 | – | – | 7/7 | 0.0 |
| case_29 | needs_clarification | rag | ❌ | 33% | 30–50 | – | – | 7/7 | 0.0 |
| case_30 | needs_clarification | rag | ❌ | 67% | 30–50 | – | – | 7/7 | 0.0 |
