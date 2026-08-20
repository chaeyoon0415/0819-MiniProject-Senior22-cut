import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Load FAQ and Gemini helper from chatbot/stage2_share_basic or chatbot/
const faqPath = path.resolve(process.cwd(), "chatbot/faq.json");
let FAQ = [];
try {
  if (fs.existsSync(faqPath)) {
    FAQ = JSON.parse(fs.readFileSync(faqPath, "utf-8"));
  }
} catch (e) {
  console.error("FAQ load error:", e);
}

function _tokens(text) {
  return new Set((text || "").toLowerCase().match(/[가-힣A-Za-z0-9]+/g) || []);
}

function retrieve(question, top_k = 3, min_score = 2) {
  const q = _tokens(question);
  const ranked = [];
  for (const row of FAQ) {
    const keywordHits = (row.keywords || []).reduce(
      (acc, key) => acc + (question.toLowerCase().includes(key.toLowerCase()) ? 2 : 0),
      0
    );
    const overlap = [...q].filter(token => _tokens(row.title + " " + row.text).has(token)).length;
    const score = keywordHits + overlap;
    ranked.push({ score, row });
  }
  ranked.sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
  return ranked.filter(item => item.score >= min_score).slice(0, top_k);
}

async function callGemini(prompt) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "허용되지 않는 요청입니다." });
  }

  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ success: false, message: "질문이 입력되지 않았습니다." });
    }

    const results = retrieve(question);
    if (results.length === 0) {
      return res.status(200).json({
        success: true,
        status: "UNKNOWN",
        answer: "제공된 FAQ에서 확인할 수 없는 내용입니다. 상단 '자격증 문의'를 이용해주세요.",
        source: "없음"
      });
    }

    const best = results[0];
    const prompt = `당신은 자격증 시험 접수 FAQ 상담원입니다.
아래 근거 안에서만 답하세요. 근거에 없는 내용을 만들지 마세요.
근거로 답할 수 없으면 정확히 UNKNOWN이라고 답하세요.

[질문]
${question}

[근거]
${best.row.text}

한국어 두 문장 이내로 답하세요.`;

    let generated = "";
    try {
      generated = await callGemini(prompt);
    } catch (err) {
      // Fallback to FAQ text if Gemini fails or quota is exceeded
      generated = best.row.text;
    }

    if (!generated || generated.toUpperCase() === "UNKNOWN") {
      generated = best.row.text;
    }

    return res.status(200).json({
      success: true,
      status: "ANSWERED",
      answer: generated,
      source: `${best.row.cert} - ${best.row.title}`
    });

  } catch (error) {
    console.error("Chat API error:", error);
    return res.status(500).json({
      success: false,
      message: "챗봇 응답 중 오류가 발생했습니다."
    });
  }
}
