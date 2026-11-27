import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { InquiryCategory } from "@/lib/inquiries/types";

export type MemberInquiry = {
  id: string;
  inquiry_no: string;
  category: InquiryCategory;
  created_at: string;
  status: "pending" | "answered";
  content: string;
  answer: string | null;
  answered_at: string | null;
};

const memberInquiryColumns =
  "id,inquiry_no,category,created_at,status,content,answer,answered_at";

export async function getMemberInquiries(memberId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inquiries")
    .select(memberInquiryColumns)
    .eq("user_id", memberId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .returns<MemberInquiry[]>();

  if (error || !data) {
    throw new Error("회원 문의 내역을 불러오지 못했습니다.");
  }
  return data;
}
