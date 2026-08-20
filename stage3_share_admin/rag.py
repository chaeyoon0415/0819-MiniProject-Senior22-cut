"""
[rag.py] FAQ 검색 + Gemini 프롬프트 생성 + FAQ CRUD + 동의어 CRUD
=================================================================
Stage 1의 검색 기능에 두 가지를 더했다:
1. FAQ 추가/삭제 - faq.json을 웹에서 직접 수정
2. 동의어 사전 - synonyms.json을 웹에서 직접 수정

"요보사 합격률"을 물어보면 FAQ에 "요보사"라는 단어가 없어서 검색이 안 된다.
동의어 사전이 "요보사" -> "요양보호사"로 바꿔준 뒤 검색하면 결과가 나온다.
동의어 관리 탭에서 직접 추가/삭제할 수 있다.

수정 포인트:
  [R1] min_score를 낮추면 더 많은 질문에 답한다
  [R2] top_k를 늘리면 여러 근거를 Gemini에게 줄 수 있다
  [S1] 동의어 관리 탭에서 새 동의어를 추가해보세요
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FAQ_PATH = ROOT / "faq.json"
SYNONYMS_PATH = ROOT / "synonyms.json"
UNKNOWN = "제공된 FAQ에서 확인할 수 없는 내용입니다."


def _load_synonyms():
    if SYNONYMS_PATH.is_file():
        return json.loads(SYNONYMS_PATH.read_text(encoding="utf-8"))
    return {}


def _save_synonyms():
    SYNONYMS_PATH.write_text(json.dumps(SYNONYMS, ensure_ascii=False, indent=2), encoding="utf-8")


SYNONYMS = _load_synonyms()


def reload_synonyms():
    global SYNONYMS
    SYNONYMS = _load_synonyms()


def get_synonyms_table():
    return [[short, full] for short, full in SYNONYMS.items()]


def add_synonym(short, full):
    SYNONYMS[short] = full
    _save_synonyms()


def delete_synonym(short):
    if short in SYNONYMS:
        del SYNONYMS[short]
        _save_synonyms()


def _expand_synonyms(text):
    for short, full in SYNONYMS.items():
        text = re.sub(re.escape(short), full, text)
    return text


FAQ = json.loads(FAQ_PATH.read_text(encoding="utf-8"))


def reload_faq():
    global FAQ
    FAQ = json.loads(FAQ_PATH.read_text(encoding="utf-8"))


def _save_faq():
    FAQ_PATH.write_text(json.dumps(FAQ, ensure_ascii=False, indent=2), encoding="utf-8")


def get_faq_table():
    return [[r["id"], r["cert"], r["title"], ", ".join(r.get("keywords", []))] for r in FAQ]


def add_faq_entry(cert, title, text, keywords):
    existing_ids = {r["id"] for r in FAQ}
    n = len(FAQ) + 1
    new_id = f"CUSTOM_{n}"
    while new_id in existing_ids:
        n += 1
        new_id = f"CUSTOM_{n}"
    entry = {"id": new_id, "cert": cert, "title": title, "text": text, "keywords": keywords}
    FAQ.append(entry)
    _save_faq()


def delete_faq_entry(faq_id):
    global FAQ
    FAQ = [r for r in FAQ if r["id"] != faq_id]
    _save_faq()


def _tokens(text):
    return set(re.findall(r"[가-힣A-Za-z0-9]+", text.lower()))


def retrieve(question, top_k=3, min_score=2):
    question = _expand_synonyms(question)
    q = _tokens(question)
    ranked = []
    for row in FAQ:
        keyword_hits = sum(2 for key in row.get("keywords", []) if key.lower() in question.lower())
        overlap = len(q & _tokens(row["title"] + " " + row["text"]))
        score = keyword_hits + overlap
        ranked.append((score, row))
    ranked.sort(key=lambda item: (-item[0], item[1]["id"]))
    return [(score, row) for score, row in ranked[:top_k] if score >= min_score]


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
