export type InquiryCategory =
  | "reservation_payment"
  | "cancellation_refund"
  | "consultation"
  | "shop"
  | "other";

export type InquiryValues = {
  category: string;
  name: string;
  email: string;
  phone: string;
  reservationNo: string;
  content: string;
  privacyConsent: boolean;
};
export type InquiryField = keyof InquiryValues;
export type InquiryErrors = Partial<Record<InquiryField, string>>;
export type LookupValues = { inquiryNo: string; email: string };
export type LookupErrors = Partial<Record<keyof LookupValues, string>>;
export type InquiryReceipt = { inquiryNo: string; createdAt: string };
export type InquiryResult = InquiryReceipt & {
  category: InquiryCategory;
  status: "pending" | "answered";
  reservationNo: string | null;
  content: string;
  answer: string | null;
  answeredAt: string | null;
};
export type CreateInquiryState = {
  errors?: InquiryErrors;
  message?: string;
  success?: InquiryReceipt;
};
export type LookupInquiryState = {
  errors?: LookupErrors;
  message?: string;
  result?: InquiryResult;
};
