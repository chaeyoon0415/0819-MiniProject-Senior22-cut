import fs from "fs";
import path from "path";

// FAQ 불러오기
const faqPath = path.resolve(process.cwd(), "chatbot/faq.json");
let FAQ = [];

try {
  if (fs.existsSync(faqPath)) {
    FAQ = JSON.parse(fs.readFileSync(faqPath, "utf-8"));
  }
} catch (e) {
  console.error("FAQ load error:", e);
}

// 동의어 불러오기
const synonymsPath = path.resolve(process.cwd(), "chatbot/synonyms.json");
let SYNONYMS = {};

try {
  if (fs.existsSync(synonymsPath)) {
    SYNONYMS = JSON.parse(fs.readFileSync(synonymsPath, "utf-8"));
  }
} catch (e) {
  console.error("Synonyms load error:", e);
}


// Gemini 호출
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
    console.error("Gemini error:", data);
    throw new Error("Gemini response parsing failed.");
  }
}


// 동의어 변환
function expandSynonyms(question) {
  let result = question;

  for (const [short, full] of Object.entries(SYNONYMS)) {
    result = result.replaceAll(short, full);
  }

  return result;
}


// 자격증 찾기
function findCertificate(question) {
  const q = question.toLowerCase();

  // FAQ에 실제 존재하는 자격증 목록
  const certificates = [
    ...new Set(
      FAQ
        .map(row => row.cert)
        .filter(Boolean)
    )
  ];

  // 정확한 자격증명이 질문에 포함되어 있는지 확인
  for (const cert of certificates) {
    if (q.includes(cert.toLowerCase())) {
      return cert;
    }
  }

  return null;
}


// FAQ 검색
async function retrieve(question) {

  // 1. 동의어 변환
  const expandedQuestion = expandSynonyms(question);

  console.log("원래 질문:", question);
  console.log("변환된 질문:", expandedQuestion);

  // 2. 자격증 먼저 확인
  const targetCert = findCertificate(expandedQuestion);

  console.log("찾은 자격증:", targetCert);

  // 3. 해당 자격증의 FAQ만 가져오기
  let candidateFAQ = FAQ;

  if (targetCert) {
    candidateFAQ = FAQ.filter(
      row =>
        row.cert &&
        row.cert.toLowerCase() === targetCert.toLowerCase()
    );
  }

  // 4. 해당 자격증 FAQ가 없다면 UNKNOWN
  if (candidateFAQ.length === 0) {
    return null;
  }

  // 5. Gemini에게 의도에 맞는 FAQ 선택 요청
  const faqListSummary = candidateFAQ
    .map((item, index) => {
      return `[ID: ${index}] 제목: ${item.title} | 키워드: ${(item.keywords || []).join(", ")}`;
    })
    .join("\n");

  const selectionPrompt = `자격증 FAQ 검색 도우미입니다.

사용자의 질문 의도를 파악해서 가장 적절한 FAQ ID 하나를 선택하세요.

일상적인 표현도 의미를 이해하세요.
가격, 시험비, 시험비용, 돈, 얼마 → 응시수수료
자격, 조건 → 응시자격
과목, 시험범위 → 시험과목
시험방법, 어떻게 → 시험방식

${targetCert ? `자격증은 반드시 "${targetCert}"에 대한 FAQ만 선택하세요.` : ""}

적절한 항목이 없으면 NONE이라고 답하세요.
숫자 하나만 출력하세요.

[FAQ]
${faqListSummary}

[질문]
${expandedQuestion}

ID:`;

  try {
    const selected = await callGemini(selectionPrompt);

    const match = selected.match(/\d+/);

    if (match) {
      const index = parseInt(match[0], 10);

      if (candidateFAQ[index]) {
        return candidateFAQ[index];
      }
    }
  } catch (err) {
    console.error("Gemini intent error:", err);
  }


  // 6. Gemini 실패 시 기본 검색
  const q = expandedQuestion.toLowerCase();

  let bestRow = null;
  let bestScore = -1;

  for (const row of candidateFAQ) {
    let score = 0;

    const title = (row.title || "").toLowerCase();
    const keywords = (row.keywords || []).map(k =>
      k.toLowerCase()
    );

    // 자격증
    if (
      targetCert &&
      row.cert &&
      row.cert.toLowerCase() === targetCert.toLowerCase()
    ) {
      score += 50;
    }

    // 키워드
    for (const keyword of keywords) {
      if (q.includes(keyword)) {
        score += 10;
      }
    }

    // 수수료
    if (
      q.includes("응시수수료") ||
      q.includes("응시료") ||
      q.includes("가격") ||
      q.includes("비용") ||
      q.includes("얼마") ||
      q.includes("시험비")
    ) {
      if (
        title.includes("수수료") ||
        title.includes("응시료")
      ) {
        score += 50;
      }
    }

    // 자격
    if (
      q.includes("응시자격") ||
      q.includes("자격") ||
      q.includes("조건")
    ) {
      if (title.includes("응시자격")) {
        score += 50;
      }
    }

    // 과목
    if (
      q.includes("과목") ||
      q.includes("시험범위") ||
      q.includes("1차") ||
      q.includes("2차")
    ) {
      if (title.includes("과목")) {
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


// API
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

    // 최종 답변 생성
    const answerPrompt = `당신은 자격증 시험 접수 FAQ 상담원입니다.

아래 근거에 있는 내용만 사용하세요.
근거에 없는 내용을 만들지 마세요.
사용자가 일상적인 표현으로 질문해도 질문의 의미를 이해해서 답하세요.

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
      source:
        `${bestRow.cert || ""}${
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