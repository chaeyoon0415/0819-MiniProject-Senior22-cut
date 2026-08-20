"""
[rag.py] FAQ 검색 + Gemini 프롬프트 생성
==========================================
Stage 1과 동일. 수정 사항 없음.

수정 포인트:
  [R1] min_score를 낮추면 더 많은 질문에 답한다 (대신 정확도 하락)
  [R2] top_k를 늘리면 여러 근거를 Gemini에게 줄 수 있다
  [R3] build_prompt의 시스템 지시를 수정하면 답변 스타일이 바뀐다
  [R4] faq.json에 FAQ를 추가하면 답변 범위가 넓어진다
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
UNKNOWN = "제공된 FAQ에서 확인할 수 없는 내용입니다."

FAQ = json.loads((ROOT / "faq.json").read_text(encoding="utf-8"))


def _tokens(text):
    return set(re.findall(r"[가-힣A-Za-z0-9]+", text.lower()))


def retrieve(question, top_k=3, min_score=2):
    q = _tokens(question)
    ranked = []
    for row in FAQ:
        keyword_hits = sum(2 for key in row["keywords"] if key.lower() in question.lower())
        overlap = len(q & _tokens(row["title"] + " " + row["text"]))
        score = keyword_hits + overlap
        ranked.append((score, row))
    ranked.sort(key=lambda item: (-item[0], item[1]["id"]))
    results = [(score, row) for score, row in ranked[:top_k] if score >= min_score]
    return results


def build_prompt(question, document):
    return f"""당신은 자격증 시험 접수 FAQ 상담원입니다.
아래 근거 안에서만 답하세요. 근거에 없는 내용을 만들지 마세요.
근거로 답할 수 없으면 정확히 UNKNOWN이라고 답하세요.

[질문]
{question}

[근거]
{document['text']}

한국어 두 문장 이내로 답하세요."""


def answer_question(question, generate):
    results = retrieve(question)
    if not results:
        return {"status": "UNKNOWN", "answer": UNKNOWN, "source": "없음", "score": 0}

    best_score, best_doc = results[0]
    generated = generate(build_prompt(question, best_doc)).strip()

    if not generated or generated.upper() == "UNKNOWN":
        return {"status": "UNKNOWN", "answer": UNKNOWN, "source": "없음", "score": best_score}

    return {
        "status": "ANSWERED",
        "answer": generated,
        "source": f"{best_doc['cert']} - {best_doc['title']}",
        "score": best_score,
    }
