import type { InquiryCategory } from "../inquiries/types";
export type FaqRow = {
  id: string;
  category: string;
  question: string;
  answer: string;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
};
export type InquirySummary = {
  id: string;
  inquiry_no: string;
  customer_name: string;
  category: InquiryCategory;
  created_at: string;
  status: "pending" | "answered";
};
export type InquiryDetail = InquirySummary & {
  customer_email: string;
  customer_phone: string;
  reservation_no: string | null;
  content: string;
  answer: string | null;
  answered_at: string | null;
  updated_at: string;
};
export type SupportResult<T> = {
  success: boolean;
  message: string;
  errors?: Record<string, string>;
  conflict?: boolean;
  row?: T;
  deleted?: boolean;
};
