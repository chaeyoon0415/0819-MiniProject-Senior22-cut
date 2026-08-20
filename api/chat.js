import fs from "fs";
import path from "path";

// ============================================================
// FAQ / 동의어 불러오기
// ============================================================

const faqPath = path.resolve(
  process.cwd(),
  "chatbot/faq.json"
);

const synonymsPath = path.resolve(
  process.cwd(),
  "chatbot/synonyms.json"
);

let FAQ = [];
let SYNONYMS = {};

try {
  if (fs.existsSync(faqPath)) {
    FAQ = JSON.parse(
      fs.readFileSync(faqPath, "utf-8")
    );
  }
} catch (error) {
  console.error("FAQ load error:", error);
}

try {
  if (fs.existsSync(synonymsPath)) {
    SYNONYMS = JSON.parse(
      fs.readFileSync(synonymsPath, "utf-8")
    );
  }
} catch (error) {
  console.error("Synonyms load error:", error);
}


// ============================================================
// Gemini 호출
// ============================================================

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
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Gemini API error:", data);
    throw new Error("Gemini API request failed.");
  }

  try {
    return data.candidates[0].content.parts[0].text.trim();
  } catch (error) {
    console.error("Gemini response parsing failed:", data);
    throw new Error("Gemini response parsing failed.");
  }
}


// ============================================================
// 동의어 확장
// ============================================================

function expandSynonyms(text) {
  let result = text;

  // 긴 표현부터 처리
  const entries = Object.entries(SYNONYMS).sort(
    (a, b) => b[0].length - a[0].length
  );

  for (const [short, full] of entries) {
    result = result.replaceAll(short, full);
  }

  return result;
}


// ============================================================
// 검색용 정규화
// ============================================================

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^가-힣a-zA-Z0-9]/g, "");
}


function tokenize(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .match(/[가-힣A-Za-z0-9]+/g) || []
  );
}


// ============================================================
// FAQ 검색
// ============================================================

async function retrieve(question) {

  const originalQuestion = question.trim();

  // 예:
  // 포크레인 시험 가격
  //
  // →
  // 굴착기운전기능사 시험 응시수수료
  const expandedQuestion =
    expandSynonyms(originalQuestion);

  console.log("원래 질문:", originalQuestion);
  console.log("확장 질문:", expandedQuestion);

  // 원래 질문 + 확장 질문을 모두 검색에 사용
  const searchText =
    `${originalQuestion} ${expandedQuestion}`;

  const normalizedSearch =
    normalize(searchText);

  const questionTokens =
    tokenize(searchText);

  const ranked = [];

  for (const row of FAQ) {

    const cert = row.cert || "";
    const title = row.title || "";
    const text = row.text || "";
    const keywords = row.keywords || [];

    let score = 0;

    // --------------------------------------------------------
    // 1. 자격증 이름 일치
    // --------------------------------------------------------

    const normalizedCert =
      normalize(cert);

    if (
      normalizedCert &&
      normalizedSearch.includes(normalizedCert)
    ) {
      score += 8;
    }


    // --------------------------------------------------------
    // 2. 제목 전체가 질문과 관련된 경우
    // --------------------------------------------------------

    const normalizedTitle =
      normalize(title);

    if (
      normalizedTitle &&
      normalizedSearch.includes(normalizedTitle)
    ) {
      score += 6;
    }


    // --------------------------------------------------------
    // 3. FAQ 키워드 일치
    // --------------------------------------------------------

    for (const keyword of keywords) {

      const normalizedKeyword =
        normalize(keyword);

      if (
        normalizedKeyword &&
        normalizedSearch.includes(normalizedKeyword)
      ) {
        score += 5;
      }
    }


    // --------------------------------------------------------
    // 4. 질문 단어와 FAQ 내용의 겹침
    // --------------------------------------------------------

    const documentTokens = tokenize(
      `${cert} ${title} ${text} ${keywords.join(" ")}`
    );

    let overlap = 0;

    for (const token of questionTokens) {
      if (documentTokens.has(token)) {
        overlap++;
      }
    }

    score += overlap * 2;


    // --------------------------------------------------------
    // 5. 사용자가 직접 사용한 표현이 키워드에 있으면 추가점수
    // --------------------------------------------------------

    const normalizedOriginal =
      normalize(originalQuestion);

    for (const keyword of keywords) {

      const normalizedKeyword =
        normalize(keyword);

      if (
        normalizedKeyword &&
        normalizedOriginal.includes(normalizedKeyword)
      ) {
        score += 4;
      }
    }


    ranked.push({
      score,
      row,
    });
  }


  // 점수 높은 순
  ranked.sort((a, b) => {

    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return String(a.row.id || "").localeCompare(
      String(b.row.id || "")
    );
  });


  // 상위 FAQ 10개를 Gemini에게 전달
  const results = ranked
    .filter(item => item.score >= 2)
    .slice(0, 10);

  console.log(
    "검색 결과:",
    results.map(item => ({
      score: item.score,
      id: item.row.id,
      title: item.row.title,
    }))
  );

  return results;
}


// ============================================================
// Gemini에게 FAQ 선택 + 답변 요청
// ============================================================

function buildAnswerPrompt(question, results) {

  const faqList = results
    .map((item, index) => {
      const row = item.row;

      return `
[FAQ ${index + 1}]
자격증: ${row.cert || ""}
제목: ${row.title || ""}
내용: ${row.text || ""}
키워드: ${(row.keywords || []).join(", ")}
`;
    })
    .join("\n");

  return `
당신은 시니어 접수자를 도와주는 친절한 자격증 시험 상담원이에요.

사용자의 질문을 정확히 이해하고, 아래 FAQ 중 가장 관련 있는 내용만 이용해서 짧게 답변하세요.

[질문 의도 이해]
- 포크레인, 포클레인 → 굴착기운전기능사
- 요보사 → 요양보호사
- 한조기 → 한식조리기능사
- 가격, 시험비, 비용, 얼마 → 응시료 또는 응시수수료
- 자격, 조건 → 응시자격
- 과목, 시험범위 → 시험과목
- 준비물 → 준비물
- 언제, 일정 → 시험일정
- 어디서 → 접수방법

예를 들어,
"포크레인 시험 가격"이라고 물으면
굴착기운전기능사의 응시료에 대한 답변을 해야 해요.

"위생사 가격"이라고 물으면
위생사의 응시료에 대한 답변을 해야 해요.

[답변 규칙]
1. 질문에 대한 핵심 답만 말하세요.
2. 최대 1~2문장으로 아주 짧게 답하세요.
3. 불필요한 설명, 조언, 주의사항을 추가하지 마세요.
4. FAQ 내용에 없는 정보는 절대 만들지 마세요.
5. "~합니다", "~됩니다", "~해야 합니다" 같은 딱딱한 표현은 사용하지 마세요.
6. "~요", "~예요", "~하면 돼요"처럼 자연스럽고 친근하게 말하세요.
7. 사용자가 가격을 물으면 가격을 가장 먼저 알려주세요.
8. 사용자가 무엇을 물었는지에 해당하는 정보만 답하세요.

예시:

질문: 포크레인 시험 가격
답변: 굴착기운전기능사 필기시험은 14,500원이고, 실기시험은 27,800원이에요.

질문: 요보사 합격 기준
답변: 요양보호사는 필기와 실기에서 각각 60점 이상이면 합격이에요.

질문: 한조기 시험 과목
답변: 한식조리기능사는 필기와 실기시험으로 진행돼요.

관련 FAQ가 없다면 정확히 UNKNOWN이라고 답하세요.


[사용자 질문]
${question}

[FAQ 목록]
${faqList}

위 규칙을 지키면서 사용자의 질문에 대한 답변만 작성하세요.
`.trim();
}


// ============================================================
// API
// ============================================================

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "허용되지 않는 요청입니다.",
    });
  }


  try {

    const { question } = req.body;


    if (
      !question ||
      typeof question !== "string" ||
      !question.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "질문이 입력되지 않았습니다.",
      });
    }


    // --------------------------------------------------------
    // FAQ 검색
    // --------------------------------------------------------

    const results =
      await retrieve(question);


    if (!results.length) {

      return res.status(200).json({
        success: true,
        status: "UNKNOWN",
        answer:
          "죄송해요. 제공된 FAQ에서는 확인하기 어려운 내용이에요. 상단 '자격증 문의'를 이용해주세요.",
        source: "없음",
      });
    }


    // --------------------------------------------------------
    // Gemini에게 상위 FAQ들을 전달
    // --------------------------------------------------------

    const prompt =
      buildAnswerPrompt(
        question,
        results
      );


    let generated = "";

    try {

      generated =
        await callGemini(prompt);

    } catch (error) {

      console.error(
        "Gemini answer error:",
        error
      );

      // Gemini 실패 시 가장 높은 점수 FAQ의
      // 원문을 그대로 보여줌
      generated =
        results[0].row.text || "";
    }


    if (
      !generated ||
      generated.trim().toUpperCase() === "UNKNOWN"
    ) {

      return res.status(200).json({
        success: true,
        status: "UNKNOWN",
        answer:
          "죄송해요. 제공된 FAQ에서는 확인하기 어려운 내용이에요.",
        source: "없음",
      });
    }


    // --------------------------------------------------------
    // 출처
    // --------------------------------------------------------

    const bestRow =
      results[0].row;


    return res.status(200).json({

      success: true,

      status: "ANSWERED",

      answer: generated.trim(),

      source:
        `${bestRow.cert || ""}${
          bestRow.cert ? " - " : ""
        }${bestRow.title || ""}`,
    });


  } catch (error) {

    console.error(
      "Chat API error:",
      error
    );

    return res.status(500).json({

      success: false,

      message:
        "챗봇 응답 중 오류가 발생했습니다.",
    });
  }
}