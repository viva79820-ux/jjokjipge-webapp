export type BookingSuccess = {
  reservationNo: string;
  counselorName: string;
  productName: string;
  startsAt: string;
  endsAt: string;
  price: number;
  paymentMethod: "bank_transfer";
};
export type BookingState = {
  errors?: Partial<
    Record<
      | "name"
      | "phone"
      | "email"
      | "depositor"
      | "paymentMethod"
      | "refundConsent"
      | "privacyConsent"
      | "startsAt"
      | "productId"
      | "counselorSlug",
      string
    >
  >;
  message?: string;
  success?: BookingSuccess;
};
