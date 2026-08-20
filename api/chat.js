import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Load FAQ from chatbot/faq.json
const faqPath = path.resolve(process.cwd(), "chatbot/faq.json");
let FAQ = [];

try {
  if (fs.existsSync(faqPath)) {
    FAQ = JSON.parse(fs.readFileSync(faqPath, "utf-8"));
  }
} catch (e) {
  console.error("FAQ load error:", e);
}

// Load synonyms from chatbot/synonyms.json
const synonymsPath = path.resolve(process.cwd(), "chatbot/synonyms.json");
let SYNONYMS = {};

try {
  if (fs.existsSync(synonymsPath)) {
    SYNONYMS = JSON.parse(fs.readFileSync(synonymsPath, "utf-8"));
  }
} catch (e) {
  console.error("Synonyms load error:", e);
}

async function callGemini(prompt) {
  const apiKey =
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    "";

  const model =
    process.env.GEMINI_MODEL ||
    "gemini-3.5-flash-lite";

  if (!apiKey) {
    throw new Error("API key is not configured.");
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    }),
  });

  const data = await response.json();

  try {
    return data.candidates[0].content.parts[0].text.trim();
  } catch (err) {
    throw new Error("Gemini response parsing failed.");
  }
}

async function retrieve(question) {
  // 1. 동의어를 정식 표현으로 변환
  let expandedQuestion = question;

  for (const [short, full] of Object.entries(SYNONYMS)) {
    expandedQuestion = expandedQuestion.replaceAll(short, full);
  }

  // 2. FAQ 목록 준비
  const faqListSummary = FAQ.map((item, index) => {
    return `[ID: ${index}] 자격증: ${item.cert || "기본"} | 제목: ${item.title} | 키워드: ${(item.keywords || []).join(", ")}`;
  }).join("\n");

  // 3. Gemini가 질문의 의도에 맞는 FAQ 선택
  const selectionPrompt = `당신은 자격증 FAQ 검색 의도 분석 전문가입니다.

사용자의 질문에서 자격증과 질문 의도를 정확히 파악하세요.
일상적인 표현도 의미를 이해해야 합니다.
예: 가격, 시험비, 시험비용, 돈, 얼마 → 응시수수료
자격, 조건 → 응시자격
과목, 시험범위 → 시험과목

아래 FAQ 중 가장 적절한 항목의 ID 하나만 출력하세요.
적절한 FAQ가 없으면 NONE이라고 답하세요.
다른 설명은 하지 마세요.

[FAQ 목록]
${faqListSummary}

[사용자 질문]
${expandedQuestion}

FAQ ID:`;

  try {
    const selectedIdStr = await callGemini(selectionPrompt);

    const matchId = parseInt(
      selectedIdStr.replace(/[^0-9]/g, ""),
      10
    );

    if (!isNaN(matchId) && FAQ[matchId]) {
      return FAQ[matchId];
    }
  } catch (err) {
    console.error("Gemini intent retrieval error:", err);
  }

  // 4. Gemini 실패 시 기본 검색
  const qLower = expandedQuestion.toLowerCase();

  let bestRow = null;
  let bestScore = -1;

  for (const row of FAQ) {
    let score = 0;

    const title = (row.title || "").toLowerCase();
    const keywords = (row.keywords || []).map(k =>
      k.toLowerCase()
    );

    // 자격증 일치
    const certMatch =
      (row.cert &&
        qLower.includes(row.cert.toLowerCase())) ||
      keywords.some(
        k => k.length >= 2 && qLower.includes(k)
      );

    if (certMatch) {
      score += 30;
    }

    // 응시수수료
    if (
      qLower.includes("수수료") ||
      qLower.includes("응시료") ||
      qLower.includes("가격") ||
      qLower.includes("비용") ||
      qLower.includes("얼마") ||
      qLower.includes("시험비")
    ) {
      if (
        title.includes("수수료") ||
        title.includes("응시수수료") ||
        title.includes("응시료")
      ) {
        score += 50;
      }
    }

    // 응시자격
    if (
      qLower.includes("자격") ||
      qLower.includes("조건") ||
      qLower.includes("응시자격")
    ) {
      if (title.includes("응시자격")) {
        score += 50;
      }
    }

    // 시험과목
    if (
      qLower.includes("과목") ||
      qLower.includes("시험과목") ||
      qLower.includes("1차") ||
      qLower.includes("2차")
    ) {
      if (
        title.includes("과목") ||
        title.includes("시험 과목")
      ) {
        score += 50;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestRow = row;
    }
  }

  return bestScore > 0 ? bestRow : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "허용되지 않는 요청입니다.",
    });
  }

  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        message: "질문이 입력되지 않았습니다.",
      });
    }

    const bestRow = await retrieve(question);

    if (!bestRow) {
      return res.status(200).json({
        success: true,
        status: "UNKNOWN",
        answer:
          "제공된 FAQ에서 확인할 수 없는 내용입니다. 상단 '자격증 문의'를 이용해주세요.",
        source: "없음",
      });
    }

    // Gemini가 선택한 FAQ 근거로 최종 답변 생성
    const answerPrompt = `당신은 자격증 시험 접수 FAQ 상담원입니다.
아래 근거에 있는 내용만 사용하세요.
근거에 없는 내용은 만들지 마세요.
질문의 표현이 일상적이어도 의미를 이해해서 답하세요.
답변할 수 없으면 UNKNOWN이라고 답하세요.

[질문]
${question}

[근거]
${bestRow.text}

한국어 두 문장 이내로 답하세요.`;

    let generated = "";

    try {
      generated = await callGemini(answerPrompt);
    } catch (err) {
      generated = bestRow.text;
    }

    if (
      !generated ||
      generated.toUpperCase() === "UNKNOWN"
    ) {
      generated = bestRow.text;
    }

    return res.status(200).json({
      success: true,
      status: "ANSWERED",
      answer: generated,
      source: `${bestRow.cert || ""}${
        bestRow.cert ? " - " : ""
      }${bestRow.title}`,
    });
  } catch (error) {
    console.error("Chat API error:", error);

    return res.status(500).json({
      success: false,
      message: "챗봇 응답 중 오류가 발생했습니다.",
    });
  }
}