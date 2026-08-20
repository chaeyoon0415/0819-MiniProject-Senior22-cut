"""
[app.py] Gradio 챗봇 + FAQ 관리 + 동의어 관리 - share=True
==========================================================
3개 탭으로 구성:
- 챗봇 탭: 사용자 질문 -> 동의어 확장 -> FAQ 검색 -> Gemini 답변
- FAQ 관리 탭: FAQ 추가/삭제 -> faq.json에 영구 저장
- 동의어 관리 탭: 줄임말/통칭 추가/삭제 -> synonyms.json에 영구 저장

MUST 챌린지:
  1. 동의어 관리 탭에서 새 동의어를 추가한다 (예: "전기사" -> "전기기능사")
  2. 챗봇 탭에서 줄임말로 질문한다 (예: "전기사 접수비")
  3. 동의어가 없을 때와 있을 때 결과가 어떻게 달라지는지 확인한다
"""
from __future__ import annotations
import os
from pathlib import Path
import gradio as gr
from gemini import GeminiClient
from rag import (
    answer_question, reload_faq, get_faq_table, add_faq_entry, delete_faq_entry,
    get_synonyms_table, add_synonym, delete_synonym, reload_synonyms,
)


def load_env():
    path = Path(__file__).resolve().parent / ".env"
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        if raw.strip() and not raw.lstrip().startswith("#") and "=" in raw:
            key, value = raw.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


load_env()
client = GeminiClient()


def chat(message, history):
    try:
        result = answer_question(message, client.generate)
        return f"[{result['status']}] {result['answer']}\n\n출처: {result['source']}"
    except Exception as error:
        return f"[ERROR] {type(error).__name__}: {error}"


CERTS = [
    "한식조리기능사", "지게차운전기능사", "굴착기운전기능사", "전기기능사",
    "공인중개사", "손해평가사", "요양보호사", "위생사", "공통",
]


def do_add_faq(cert, title, text, keywords_str):
    if not title.strip() or not text.strip():
        return "제목과 내용을 입력하세요", get_faq_table()
    keywords = [k.strip() for k in keywords_str.split(",") if k.strip()]
    add_faq_entry(cert, title.strip(), text.strip(), keywords)
    reload_faq()
    return f"추가 완료: {title.strip()}", get_faq_table()


def do_delete_faq(faq_id_str):
    if not faq_id_str.strip():
        return "삭제할 FAQ의 ID를 입력하세요", get_faq_table()
    delete_faq_entry(faq_id_str.strip())
    reload_faq()
    return f"삭제 완료: {faq_id_str.strip()}", get_faq_table()


def do_add_synonym(short, full):
    if not short.strip() or not full.strip():
        return "줄임말과 정식 명칭 모두 입력하세요", get_synonyms_table()
    add_synonym(short.strip(), full.strip())
    reload_synonyms()
    return f"추가 완료: {short.strip()} -> {full.strip()}", get_synonyms_table()


def do_delete_synonym(short):
    if not short.strip():
        return "삭제할 줄임말을 입력하세요", get_synonyms_table()
    delete_synonym(short.strip())
    reload_synonyms()
    return f"삭제 완료: {short.strip()}", get_synonyms_table()


with gr.Blocks(title="MP1 - 자격증 FAQ 챗봇 + 관리") as demo:

    with gr.Tab("챗봇"):
        gr.Markdown("## 자격증 시험 접수 FAQ 챗봇\n8개 자격증 FAQ 100건 + 동의어 사전으로 줄임말도 인식합니다")
        chatbot = gr.ChatInterface(fn=chat, examples=[
            "한식조리기능사 시험비가 얼마예요?",
            "요보사 합격 기준이 몇 점이에요?",
            "포크레인 접수는 어디서 해요?",
            "전기기사 계산기 가져가도 되나요?",
        ])

    with gr.Tab("FAQ 관리"):
        gr.Markdown("## FAQ 관리\nFAQ를 추가/삭제하면 faq.json이 바뀌고, 챗봇 답변도 바뀝니다.")

        with gr.Row():
            cert_input = gr.Dropdown(choices=CERTS, label="자격증", value="한식조리기능사")
            title_input = gr.Textbox(label="제목", placeholder="예: 한식조리기능사 준비물")
        text_input = gr.Textbox(label="답변 내용", placeholder="예: 앞치마, 위생모, 위생복을 지참해야 합니다.", lines=3)
        keywords_input = gr.Textbox(label="키워드 (쉼표 구분)", placeholder="예: 한식조리,준비물,지참")
        add_faq_btn = gr.Button("FAQ 추가", variant="primary")
        add_faq_msg = gr.Textbox(label="결과", interactive=False)

        gr.Markdown("---")

        with gr.Row():
            delete_faq_id = gr.Textbox(label="삭제할 FAQ ID", placeholder="예: CERT_001")
            delete_faq_btn = gr.Button("삭제", variant="stop")
        delete_faq_msg = gr.Textbox(label="결과", interactive=False)

        gr.Markdown("---")
        refresh_faq_btn = gr.Button("목록 새로고침")
        faq_table = gr.Dataframe(
            value=get_faq_table(),
            headers=["ID", "자격증", "제목", "키워드"],
            label="FAQ 목록",
        )

        add_faq_btn.click(do_add_faq, [cert_input, title_input, text_input, keywords_input], [add_faq_msg, faq_table])
        delete_faq_btn.click(do_delete_faq, [delete_faq_id], [delete_faq_msg, faq_table])
        refresh_faq_btn.click(lambda: get_faq_table(), [], [faq_table])

    with gr.Tab("동의어 관리"):
        gr.Markdown("## 동의어 사전 관리\n줄임말이나 통칭을 정식 명칭으로 바꿔주는 사전입니다.\n챗봇이 질문을 받으면 이 사전으로 먼저 치환한 뒤 FAQ를 검색합니다.")

        with gr.Row():
            syn_short = gr.Textbox(label="줄임말/통칭", placeholder="예: 전기사")
            syn_full = gr.Textbox(label="정식 명칭", placeholder="예: 전기기능사")
        add_syn_btn = gr.Button("동의어 추가", variant="primary")
        add_syn_msg = gr.Textbox(label="결과", interactive=False)

        gr.Markdown("---")

        with gr.Row():
            delete_syn_short = gr.Textbox(label="삭제할 줄임말", placeholder="예: 포크레인")
            delete_syn_btn = gr.Button("삭제", variant="stop")
        delete_syn_msg = gr.Textbox(label="결과", interactive=False)

        gr.Markdown("---")
        refresh_syn_btn = gr.Button("목록 새로고침")
        syn_table = gr.Dataframe(
            value=get_synonyms_table(),
            headers=["줄임말/통칭", "정식 명칭"],
            label="동의어 목록",
        )

        add_syn_btn.click(do_add_synonym, [syn_short, syn_full], [add_syn_msg, syn_table])
        delete_syn_btn.click(do_delete_synonym, [delete_syn_short], [delete_syn_msg, syn_table])
        refresh_syn_btn.click(lambda: get_synonyms_table(), [], [syn_table])


if __name__ == "__main__":
    demo.launch(share=True)
