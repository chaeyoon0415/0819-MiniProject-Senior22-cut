"""
[app.py] Gradio 챗봇 - share=True로 외부 공유
===============================================
Stage 1과 코드가 거의 같다. 차이점은 딱 하나:
  demo.launch(share=True) -> 72시간 동안 접속 가능한 공개 URL이 생긴다.

실행하면 터미널에 이런 주소가 뜬다:
  Running on public URL: https://xxxxxxxx.gradio.live

이 URL을 슬랙이나 카톡으로 보내면 다른 사람도 내 챗봇을 쓸 수 있다.

수정 포인트:
  [A1] title, description을 본인 프로젝트에 맞게 바꾸세요
  [A2] examples에 본인이 테스트하고 싶은 질문을 추가하세요
"""
from __future__ import annotations
import os
from pathlib import Path
import gradio as gr
from gemini import GeminiClient
from rag import answer_question


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


EXAMPLES = [
    "한식조리기능사 시험비가 얼마예요?",
    "지게차 접수는 어디서 해요?",
    "굴착기 시험 과목이 뭐예요?",
    "요양보호사 합격 기준이 몇 점이에요?",
    "공인중개사 환불 규정이 어떻게 되나요?",
    "위생사 응시 자격이 있나요?",
    "손해평가사 1차 2차 차이가 뭐예요?",
    "전기기능사 계산기 가져가도 되나요?",
]

demo = gr.ChatInterface(
    fn=chat,
    title="MP1 - 자격증 시험 접수 FAQ 챗봇",
    description="8개 자격증 시험 접수 관련 문의에 답변합니다. (FAQ 검색 + Gemini 근거 답변)",
    examples=EXAMPLES,
)

if __name__ == "__main__":
    # share=True: 72시간 공개 URL 생성
    demo.launch(share=True)
