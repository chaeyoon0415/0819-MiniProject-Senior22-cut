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

async function callGemini(prompt) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

  if (!apiKey) {
    throw new Error("API key is not configured.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
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
  // Prepare FAQ summary list for Gemini intent matching
  const faqListSummary = FAQ.map((item, index) => {
    return `[ID: ${index}] 자격증: ${item.cert || '기본'} | 제목: ${item.title} | 키워드: ${(item.keywords || []).join(", ")}`;
  }).join("\n");

  const selectionPrompt = `당신은 자격증 FAQ 검색 의도 분석 전문가입니다.
사용자의 질문에 담긴 자격증 이름과 의도(예: 가격, 시험비, 수수료 -> 응시수수료 / 자격, 조건 -> 응시자격 / 과목 -> 시험과목 등 유의어 포함)를 정확히 파악하여, 아래 FAQ 목록 중 가장 알맞은 항목의 ID(숫자)를 정확히 하나만 골라주세요.
적절한 FAQ가 없으면 정확히 "NONE"이라고 답하세요. 다른 설명은 절대 하지 마세요.

[FAQ 목록]
${faqListSummary}

[사용자 질문]
${question}

가장 적절한 FAQ의 ID 숫자만 출력하세요 (예: 13):`;

  try {
    const selectedIdStr = await callGemini(selectionPrompt);
    const matchId = parseInt(selectedIdStr.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(matchId) && FAQ[matchId]) {
      return FAQ[matchId];
    }
  } catch (err) {
    console.error("Gemini intent retrieval error:", err);
  }

  // Fallback heuristic matching if Gemini selection fails
  const qLower = question.toLowerCase();
  let bestRow = null;
  let bestScore = -1;

  for (const row of FAQ) {
    let score = 0;
    const title = (row.title || "").toLowerCase();
    const keywords = (row.keywords || []).map(k => k.toLowerCase());

    const certMatch = (row.cert && qLower.includes(row.cert.toLowerCase())) || keywords.some(k => k.length >= 2 && qLower.includes(k));
    if (certMatch) score += 30;

    if ((qLower.includes("수수료") || qLower.includes("응시료") || qLower.includes("가격") || qLower.includes("비용") || qLower.includes("얼마") || qLower.includes("시험비")) && (title.includes("수수료") || title.includes("응시수수료") || title.includes("응시료"))) {
      score += 50;
    }
    if ((qLower.includes("자격") || qLower.includes("조건") || qLower.includes("응시자격")) && title.includes("응시자격")) {
      score += 50;
    }
    if ((qLower.includes("과목") || qLower.includes("시험과목") || qLower.includes("1차") || qLower.includes("2차")) && (title.includes("과목") || title.includes("시험 과목"))) {
      score += 50;
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
    return res.status(405).json({ success: false, message: "허용되지 않는 요청입니다." });
  }

  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ success: false, message: "질문이 입력되지 않았습니다." });
    }

    const bestRow = await retrieve(question);
    if (!bestRow) {
      return res.status(200).json({
        success: true,
        status: "UNKNOWN",
        answer: "제공된 FAQ에서 확인할 수 없는 내용입니다. 상단 '자격증 문의'를 이용해주세요.",
        source: "없음"
      });
    }

    const answerPrompt = `당신은 자격증 시험 접수 FAQ 상담원입니다.
아래 근거 안에서만 답하세요. 근거에 없는 내용을 만들지 마세요.
근거로 답할 수 없으면 정확히 UNKNOWN이라고 답하세요.

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

    if (!generated || generated.toUpperCase() === "UNKNOWN") {
      generated = bestRow.text;
    }

    return res.status(200).json({
      success: true,
      status: "ANSWERED",
      answer: generated,
      source: `${bestRow.cert || ''}${bestRow.cert ? ' - ' : ''}${bestRow.title}`
    });

  } catch (error) {
    console.error("Chat API error:", error);
    return res.status(500).json({
      success: false,
      message: "챗봇 응답 중 오류가 발생했습니다."
    });
  }
}
