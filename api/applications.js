import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {

  // POST 요청만 허용
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "POST 요청만 가능합니다."
    });
  }

  try {

    const {
      certificate,
      name,
      birth,
      phone
    } = req.body;

    // 필수값 확인
    if (!certificate || !name || !birth || !phone) {
      return res.status(400).json({
        success: false,
        message: "필수 정보가 누락되었습니다."
      });
    }

    // Supabase 연결
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // applications 테이블에 저장
    const { data, error } = await supabase
      .from("applications")
      .insert([
        {
          certificate: certificate,
          name: name,
          birth_date: birth,
          phone: phone
        }
      ])
      .select()
      .single();

    if (error) {

      console.error("Supabase 오류:", error);

      return res.status(500).json({
        success: false,
        message: "Supabase 저장에 실패했습니다."
      });
    }

    return res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {

    console.error("서버 오류:", error);

    return res.status(500).json({
      success: false,
      message: "서버에서 오류가 발생했습니다."
    });
  }
}