import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // 동의어 목록 조회
  if (req.method === "GET") {
    try {
      const { data, error } = await supabase
        .from("synonyms")
        .select("id, short, full, created_at")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("동의어 조회 오류:", error);

        return res.status(500).json({
          success: false,
          message: "동의어 목록을 불러오지 못했습니다."
        });
      }

      return res.status(200).json({
        success: true,
        synonyms: data
      });

    } catch (error) {
      console.error("동의어 조회 서버 오류:", error);

      return res.status(500).json({
        success: false,
        message: "서버에서 오류가 발생했습니다."
      });
    }
  }

  // 동의어 추가
  if (req.method === "POST") {
    try {
      const { short, full } = req.body;

      if (!short || !full) {
        return res.status(400).json({
          success: false,
          message: "동의어와 정식 명칭을 모두 입력해주세요."
        });
      }

      const { data, error } = await supabase
        .from("synonyms")
        .insert([
          {
            short: short.trim(),
            full: full.trim()
          }
        ])
        .select()
        .single();

      if (error) {
        console.error("동의어 저장 오류:", error);

        return res.status(500).json({
          success: false,
          message: "동의어 저장에 실패했습니다."
        });
      }

      return res.status(200).json({
        success: true,
        data
      });

    } catch (error) {
      console.error("동의어 추가 서버 오류:", error);

      return res.status(500).json({
        success: false,
        message: "서버에서 오류가 발생했습니다."
      });
    }
  }

  // 동의어 삭제
  if (req.method === "DELETE") {
    try {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "삭제할 동의어 ID가 없습니다."
        });
      }

      const { error } = await supabase
        .from("synonyms")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("동의어 삭제 오류:", error);

        return res.status(500).json({
          success: false,
          message: "동의어 삭제에 실패했습니다."
        });
      }

      return res.status(200).json({
        success: true,
        message: "동의어가 삭제되었습니다."
      });

    } catch (error) {
      console.error("동의어 삭제 서버 오류:", error);

      return res.status(500).json({
        success: false,
        message: "서버에서 오류가 발생했습니다."
      });
    }
  }

  return res.status(405).json({
    success: false,
    message: "허용되지 않는 요청입니다."
  });
}