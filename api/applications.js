export default async function handler(req, res) {

  // ==========================================
  // POST 요청만 허용
  // ==========================================

  if (req.method !== "POST") {

    return res.status(405).json({
      message: "POST 요청만 사용할 수 있습니다."
    });

  }


  // ==========================================
  // 환경변수 확인
  // ==========================================

  const supabaseUrl =
    process.env.SUPABASE_URL;

  const supabaseKey =
  process.env.SUPABASE_ANON_KEY;


  if (!supabaseUrl || !supabaseKey) {

    console.error("Supabase 환경변수가 없습니다.");

    return res.status(500).json({
      message: "서버 설정에 문제가 있습니다."
    });

  }


  // ==========================================
  // 입력 데이터 확인
  // ==========================================

  const {
    name,
    phone,
    certificate
  } = req.body || {};


  if (!name || !phone || !certificate) {

    return res.status(400).json({
      message: "필수 정보를 모두 입력해주세요."
    });

  }


  // ==========================================
  // Supabase에 데이터 저장
  // ==========================================

  try {

    const response = await fetch(
      `${supabaseUrl}/rest/v1/applications`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          "apikey": supabaseKey,

          "Authorization": `Bearer ${supabaseKey}`,

          "Prefer": "return=representation"
        },

        body: JSON.stringify({
          name: name,
          phone: phone,
          certificate: certificate
        })
      }
    );


    const data = await response.json();


    // ----------------------------------------
    // Supabase 저장 실패
    // ----------------------------------------

    if (!response.ok) {

      console.error("Supabase 오류:", data);

      return res.status(500).json({
        message: "접수 정보를 저장하지 못했습니다."
      });

    }


    // ----------------------------------------
    // 저장 성공
    // ----------------------------------------

    return res.status(200).json({
      success: true,
      data: data
    });


  } catch (error) {

    console.error("서버 오류:", error);

    return res.status(500).json({
      message: "서버에서 오류가 발생했습니다."
    });

  }
}