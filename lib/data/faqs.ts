import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import type { InquiryCategory } from "@/lib/inquiries/types";

export type Faq = {
  id: string;
  category: Exclude<InquiryCategory, "other">;
  question: string;
  answer: string;
};
export async function getFaqs(): Promise<{ faqs: Faq[]; error: boolean }> {
  try {
    const { data, error } = await createPublicClient()
      .from("faqs")
      .select("id,category,question,answer")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .returns<Faq[]>();
    if (error || !data) return { faqs: [], error: true };
    return { faqs: data, error: false };
  } catch {
    return { faqs: [], error: true };
  }
}
