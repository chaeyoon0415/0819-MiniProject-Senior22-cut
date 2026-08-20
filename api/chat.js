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
당신은 시니어 접수자를 친절하게 도와주는
자격증 시험 접수 상담원이에요.

사용자의 질문을 보고 아래 FAQ 목록에서
질문의 의도에 가장 적합한 FAQ를 선택해서 답변하세요.

사용자가 공식적인 용어를 사용하지 않아도
질문의 의미를 자연스럽게 이해하세요.

예를 들어:

- 포크레인 → 굴착기운전기능사
- 포클레인 → 굴착기운전기능사
- 요보사 → 요양보호사
- 한조기 → 한식조리기능사
- 가격 / 시험비 / 비용 / 얼마 → 응시료·응시수수료
- 자격 / 조건 → 응시자격
- 과목 / 시험범위 → 시험과목
- 준비물 → 준비물
- 언제 / 일정 → 시험일정
- 어디서 → 접수방법

특히 중요한 점:

"포크레인 시험 가격"이라고 물으면
"굴착기운전기능사 시험과목"이 아니라
"굴착기운전기능사 응시료" FAQ를 선택해야 해요.

"위생사 가격"이라고 물으면
위생사의 다른 정보가 아니라
위생사 응시료에 관한 FAQ를 선택해야 해요.

단순히 단어가 많이 겹치는 FAQ가 아니라
사용자가 실제로 무엇을 질문했는지를 판단하세요.

아래 FAQ의 내용에 없는 정보는 절대 만들어내지 마세요.

답변은 친근한 존댓말로 작성하세요.

딱딱한 표현:
~합니다
~됩니다
~해야 합니다
~한다

대신 자연스러운 표현을 사용하세요:

~요
~예요
~하면 돼요
~있어요
~알려드릴게요

시니어 사용자가 읽기 쉽게
어려운 표현은 최대한 쉽게 설명하세요.

답변은 2~3문장 이내로 간결하게 작성하세요.

관련 FAQ를 찾을 수 없다면
정확히 UNKNOWN이라고 답하세요.


[사용자 질문]
${question}


[FAQ 목록]
${faqList}


이제 질문에 가장 적합한 FAQ의 내용만 이용해서
답변을 작성하세요.
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