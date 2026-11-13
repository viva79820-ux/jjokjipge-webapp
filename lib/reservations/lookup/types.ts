export const reservationStatuses = [
  "pending_payment",
  "confirmed",
  "completed",
  "cancelled",
] as const;
export type ReservationStatus = (typeof reservationStatuses)[number];
export const paymentMethods = ["bank_transfer", "card"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export type LookupValues = { reservationNo: string; email: string };
export type LookupErrors = Partial<Record<keyof LookupValues, string>>;
export type LookupResult = {
  reservationNo: string;
  status: ReservationStatus;
  counselorName: string;
  productName: string;
  startsAt: string;
  endsAt: string;
  minutes: number;
  price: number;
  paymentMethod: PaymentMethod;
  cancelReason?: string;
};
export type LookupState = {
  errors?: LookupErrors;
  message?: string;
  result?: LookupResult;
};
