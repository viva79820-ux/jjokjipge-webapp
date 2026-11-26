export type OrderLineInput = {
  productId: string;
  quantity: number;
};

export type OrderStatus =
  | "pending_payment"
  | "payment_confirmed"
  | "shipping"
  | "completed"
  | "cancelled";

export type OrderSuccess = {
  orderNo: string;
  subtotal: number;
  shippingFee: number;
  total: number;
  status: OrderStatus;
  replayed: boolean;
};

export type OrderField =
  | "name"
  | "phone"
  | "email"
  | "postalCode"
  | "addressLine1"
  | "addressLine2"
  | "items"
  | "privacyConsent";

export type OrderState = {
  errors?: Partial<Record<OrderField, string>>;
  message?: string;
  success?: OrderSuccess;
};
