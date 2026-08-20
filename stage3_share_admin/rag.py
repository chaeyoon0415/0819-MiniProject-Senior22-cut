"""
[rag.py] FAQ 검색 + Gemini 답변 + FAQ CRUD + 동의어 CRUD

핵심 기능
1. 접수자의 일상적인 표현을 동의어로 확장
2. 원래 질문과 확장된 질문을 함께 검색
3. 자격증명 / 제목 / 키워드 / 내용의 관련도를 종합해서 FAQ 선택
4. 선택된 FAQ만 Gemini에게 전달하여 자연스럽게 답변
5. FAQ 추가/삭제를 웹에서 관리
"""

from __future__ import annotations

import json
import re
from pathlib import Path


# ============================================================
# 기본 설정
# ============================================================

ROOT = Path(__file__).resolve().parent

FAQ_PATH = ROOT / "faq.json"
SYNONYMS_PATH = ROOT / "synonyms.json"

UNKNOWN = "제공된 FAQ에서 확인할 수 없는 내용이에요."


# ============================================================
# 동의어
# ============================================================

def _load_synonyms():
    if SYNONYMS_PATH.is_file():
        try:
            return json.loads(
                SYNONYMS_PATH.read_text(encoding="utf-8")
            )
        except Exception:
            return {}

    return {}


def _save_synonyms():
    SYNONYMS_PATH.write_text(
        json.dumps(
            SYNONYMS,
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )


SYNONYMS = _load_synonyms()


def reload_synonyms():
    global SYNONYMS
    SYNONYMS = _load_synonyms()


def get_synonyms_table():
    return [
        [short, full]
        for short, full in SYNONYMS.items()
    ]


def add_synonym(short, full):
    SYNONYMS[short] = full
    _save_synonyms()


def delete_synonym(short):
    if short in SYNONYMS:
        del SYNONYMS[short]
        _save_synonyms()


def _expand_synonyms(text):
    """
    질문에 포함된 동의어/줄임말을 정식 명칭으로 확장한다.

    예:
    포크레인 시험 가격
    ->
    굴착기운전기능사 시험 응시수수료
    """

    expanded = text

    # 긴 표현부터 치환
    # 짧은 표현이 긴 표현의 일부를 먼저 바꾸는 문제 방지
    for short, full in sorted(
        SYNONYMS.items(),
        key=lambda item: len(item[0]),
        reverse=True
    ):
        expanded = re.sub(
            re.escape(short),
            full,
            expanded,
            flags=re.IGNORECASE
        )

    return expanded


# ============================================================
# FAQ
# ============================================================

def _load_faq():
    if not FAQ_PATH.is_file():
        return []

    try:
        return json.loads(
            FAQ_PATH.read_text(encoding="utf-8")
        )
    except Exception:
        return []


FAQ = _load_faq()


def reload_faq():
    global FAQ
    FAQ = _load_faq()


def _save_faq():
    FAQ_PATH.write_text(
        json.dumps(
            FAQ,
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )


def get_faq_table():
    return [
        [
            row.get("id", ""),
            row.get("cert", ""),
            row.get("title", ""),
            ", ".join(row.get("keywords", []))
        ]
        for row in FAQ
    ]


def add_faq_entry(cert, title, text, keywords):
    existing_ids = {
        row.get("id")
        for row in FAQ
    }

    n = 1

    while f"CUSTOM_{n}" in existing_ids:
        n += 1

    entry = {
        "id": f"CUSTOM_{n}",
        "cert": cert,
        "title": title,
        "text": text,
        "keywords": keywords,
    }

    FAQ.append(entry)

    _save_faq()


def delete_faq_entry(faq_id):
    global FAQ

    FAQ = [
        row
        for row in FAQ
        if row.get("id") != faq_id
    ]

    _save_faq()


# ============================================================
# 검색용 토큰
# ============================================================

def _tokens(text):
    return set(
        re.findall(
            r"[가-힣A-Za-z0-9]+",
            text.lower()
        )
    )


def _normalize(text):
    """
    검색용 문자열 정규화.
    띄어쓰기 차이 등으로 검색이 실패하는 것을 줄인다.
    """

    return re.sub(
        r"[^가-힣a-zA-Z0-9]",
        "",
        text.lower()
    )


# ============================================================
# FAQ 검색
# ============================================================

def retrieve(question, top_k=5, min_score=2):
    """
    접수자의 질문과 FAQ의 관련도를 계산한다.

    중요한 점:
    원래 질문과 동의어가 확장된 질문을 둘 다 사용한다.

    예:
    포크레인 시험 가격

    원래 질문:
    포크레인 시험 가격

    확장 질문:
    굴착기운전기능사 시험 응시수수료

    두 가지 정보를 모두 사용하기 때문에
    '포크레인'이라는 사용자의 표현과
    '굴착기운전기능사'라는 공식 명칭을 동시에 활용할 수 있다.
    """

    original_question = question.strip()

    expanded_question = _expand_synonyms(
        original_question
    )

    # 원래 질문 + 확장 질문
    search_text = (
        original_question
        + " "
        + expanded_question
    )

    normalized_search = _normalize(search_text)

    question_tokens = _tokens(search_text)

    ranked = []

    for row in FAQ:

        cert = row.get("cert", "")
        title = row.get("title", "")
        text = row.get("text", "")
        keywords = row.get("keywords", [])

        score = 0

        # ----------------------------------------------------
        # 1. 자격증명 일치
        # ----------------------------------------------------

        normalized_cert = _normalize(cert)

        if normalized_cert and normalized_cert in normalized_search:
            score += 8

        # ----------------------------------------------------
        # 2. 제목 일치
        # ----------------------------------------------------

        normalized_title = _normalize(title)

        if normalized_title and normalized_title in normalized_search:
            score += 6

        # ----------------------------------------------------
        # 3. FAQ 키워드 일치
        # ----------------------------------------------------

        for keyword in keywords:

            keyword_normalized = _normalize(keyword)

            if not keyword_normalized:
                continue

            if keyword_normalized in normalized_search:
                score += 5

        # ----------------------------------------------------
        # 4. 질문 단어와 제목/내용의 겹침
        # ----------------------------------------------------

        document_tokens = _tokens(
            f"{cert} {title} {text} {' '.join(keywords)}"
        )

        overlap = len(
            question_tokens & document_tokens
        )

        score += overlap * 2

        # ----------------------------------------------------
        # 5. 원래 질문의 표현이 FAQ에 직접 등장
        # ----------------------------------------------------

        original_normalized = _normalize(
            original_question
        )

        for keyword in keywords:

            keyword_normalized = _normalize(keyword)

            if (
                keyword_normalized
                and keyword_normalized in original_normalized
            ):
                score += 4

        ranked.append(
            (score, row)
        )

    # 점수 높은 순서
    ranked.sort(
        key=lambda item: (
            -item[0],
            item[1].get("id", "")
        )
    )

    # 최소 점수 이상만 반환
    results = [
        (score, row)
        for score, row in ranked[:top_k]
        if score >= min_score
    ]

    return results


# ============================================================
# Gemini 프롬프트
# ============================================================

def build_prompt(question, documents):
    """
    검색된 여러 FAQ 중에서
    사용자 질문에 가장 적합한 FAQ를 선택해서 답변하도록 한다.
    """

    faq_text = ""

    for i, document in enumerate(documents, start=1):
        faq_text += f"""
[FAQ {i}]
자격증: {document.get("cert", "")}
제목: {document.get("title", "")}
내용: {document.get("text", "")}
키워드: {", ".join(document.get("keywords", []))}
"""

    return f"""
당신은 자격증 시험 접수 FAQ를 안내하는 친절한 상담원이에요.

사용자의 질문을 보고 아래 FAQ들 중에서
질문의 의도에 가장 적합한 FAQ를 하나 선택하세요.

사용자가 공식 용어를 사용하지 않아도 질문의 의미를 이해해야 해요.

예를 들어:
- "포크레인" → "굴착기운전기능사"
- "가격", "시험비", "얼마", "비용" → 응시료/응시수수료에 관한 질문
- "요보사" → "요양보호사"
- "한조기" → "한식조리기능사"

중요:
단순히 단어가 많이 겹치는 FAQ를 선택하지 말고
사용자가 실제로 무엇을 물어보는지를 기준으로 선택하세요.

예:
"포크레인 시험 가격"
→ 굴착기운전기능사 "시험과목" FAQ가 아니라
→ 굴착기운전기능사 "응시료" FAQ를 선택해야 해요.

"위생사 가격"
→ 위생사 자격이나 시험 일정이 아니라
→ 위생사 응시료/시험비에 관한 FAQ를 선택해야 해요.

선택한 FAQ의 내용에 근거해서만 답변하세요.
FAQ에 없는 내용은 추측하지 마세요.

답변은 친근한 존댓말로 작성하세요.
딱딱한 문어체 대신 "~요", "~예요", "~하면 돼요" 같은
자연스러운 말투를 사용하세요.

답변은 2~3문장 이내로 간결하게 작성하세요.

질문과 관련된 FAQ를 찾을 수 없다면 정확히 UNKNOWN이라고 답하세요.

[사용자 질문]
{question}

[FAQ 목록]
{faq_text}
""".strip()


def answer_question(question, generate):

    # 상위 FAQ 여러 개를 Gemini에게 전달
    results = retrieve(
        question,
        top_k=10,
        min_score=2
    )

    if not results:
        return {
            "status": "UNKNOWN",
            "answer": UNKNOWN,
            "source": "없음",
            "score": 0,
        }

    documents = [
        row
        for score, row in results
    ]

    generated = generate(
        build_prompt(
            question,
            documents
        )
    ).strip()

    if (
        not generated
        or generated.upper() == "UNKNOWN"
    ):
        return {
            "status": "UNKNOWN",
            "answer": UNKNOWN,
            "source": "없음",
            "score": results[0][0],
        }

    # Gemini가 답변을 만들었으므로
    # 가장 관련도가 높은 FAQ를 출처로 표시
    best_score, best_doc = results[0]

    return {
        "status": "ANSWERED",
        "answer": generated,
        "source": (
            f"{best_doc.get('cert', '')}"
            f" - "
            f"{best_doc.get('title', '')}"
        ),
        "score": best_score,
    }