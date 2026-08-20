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

function retrieve(question, top_k = 3, min_score = 1) {
  const qLower = question.toLowerCase();
  const qTokens = _tokens(question);

  // Define certificate synonyms / aliases map
  const certAliases = {
    "굴착기": ["굴착기", "굴삭기", "포크레인", "포클레인"],
    "포크레인": ["굴착기", "굴삭기", "포크레인", "포클레인"],
    "지게차": ["지게차"],
    "한식조리기능사": ["한식", "한식조리", "한식조리기능사", "요리"],
    "요양보호사": ["요양보호사", "요양사", "간병"],
    "전기기능사": ["전기", "전기기능사"],
    "위생사": ["위생사", "위생"],
    "손해평가사": ["손해평가사", "손해평가"],
    "공인중개사": ["공인중개사", "중개사", "부동산"]
  };

  // Identify which certificate is requested in the question
  let targetCertKeyword = "";
  for (const [certKey, aliases] of Object.entries(certAliases)) {
    if (aliases.some(alias => qLower.includes(alias))) {
      targetCertKeyword = certKey;
      break;
    }
  }

  const ranked = [];
  for (const row of FAQ) {
    let score = 0;
    const title = (row.title || "").toLowerCase();
    const text = (row.text || "").toLowerCase();
    const keywords = (row.keywords || []).map(k => k.toLowerCase());

    // 1. Certificate matching (strict check if cert is specified in question)
    if (targetCertKeyword) {
      const matchesCert = title.includes(targetCertKeyword) || 
                          keywords.some(k => k.includes(targetCertKeyword)) ||
                          (targetCertKeyword === "굴착기" && (title.includes("굴삭기") || title.includes("굴착기"))) ||
                          (targetCertKeyword === "한식" && title.includes("한식조리"));

      if (matchesCert) {
        score += 50; // Heavy bonus for matching the correct certificate
      } else {
        score -= 100; // Penalty if user asked for a specific cert but this FAQ is for another cert
      }
    }

    // 2. Intent matching (과목 / 수수료 / 자격 / 방식 등)
    const isFeeQ = qLower.includes("수수료") || qLower.includes("응시료") || qLower.includes("비용") || qLower.includes("얼마");
    const isQualQ = qLower.includes("자격") || qLower.includes("조건") || qLower.includes("응시자격") || qLower.includes("필요한가요");
    const isSubjectQ = qLower.includes("과목") || qLower.includes("1차") || qLower.includes("2차") || qLower.includes("시험과목") || qLower.includes("시험 범위");
    const isMethodQ = qLower.includes("방식") || qLower.includes("어떻게") || qLower.includes("CBT") || qLower.includes("컴퓨터");

    if (isFeeQ) {
      if (title.includes("응시수수료") || title.includes("수수료")) score += 70;
      else score -= 40;
    }
    if (isQualQ) {
      if (title.includes("응시자격") || title.includes("자격")) score += 70;
      else score -= 40;
    }
    if (isSubjectQ) {
      if (title.includes("과목") || title.includes("시험 과목") || title.includes("1차 2차") || title.includes("시험 방식") || title.includes("시험 구성")) score += 70;
      else score -= 40;
    }
    if (isMethodQ) {
      if (title.includes("방식") || title.includes("CBT") || title.includes("시험 방식")) score += 70;
      else score -= 40;
    }

    // 3. Keyword hits from FAQ row keywords
    for (const kw of keywords) {
      if (qLower.includes(kw)) {
        score += 10;
      }
    }

    // 4. Token overlap with title & text
    const rowTokens = _tokens(title + " " + text);
    const overlap = [...qTokens].filter(t => rowTokens.has(t)).length;
    score += overlap * 3;

    ranked.push({ score, row });
  }

  ranked.sort((a, b) => b.score - a.score);
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
      source: `${best.row.cert || ''}${best.row.cert ? ' - ' : ''}${best.row.title}`
    });

  } catch (error) {
    console.error("Chat API error:", error);
    return res.status(500).json({
      success: false,
      message: "챗봇 응답 중 오류가 발생했습니다."
    });
  }
}
