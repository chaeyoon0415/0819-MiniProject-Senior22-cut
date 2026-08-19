import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {

  // Supabase 연결
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // =========================
  // GET: 관리자 접수 내역 조회
  // =========================
  if (req.method === "GET") {
    try {

      const { data, error } = await supabase
        .from("applications")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Supabase 조회 오류:", error);

        return res.status(500).json({
          success: false,
          message: "접수 내역을 불러오지 못했습니다."
        });
      }

      return res.status(200).json({
        success: true,
        applications: data
      });

    } catch (error) {

      console.error("조회 서버 오류:", error);

      return res.status(500).json({
        success: false,
        message: "서버에서 오류가 발생했습니다."
      });
    }
  }

  // =========================
  // POST: 접수 내용 저장
  // =========================
  if (req.method === "POST") {
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

        console.error("Supabase 저장 오류:", error);

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

  // 그 외 요청은 허용하지 않음
  return res.status(405).json({
    success: false,
    message: "허용되지 않는 요청입니다."
  });
}