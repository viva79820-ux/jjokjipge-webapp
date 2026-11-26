import type { OrderStatus } from "../types";

export type OrderLookupValues = {
  orderNo: string;
  email: string;
};

export type OrderLookupErrors = Partial<
  Record<keyof OrderLookupValues, string>
>;

export type OrderLookupItem = {
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type OrderLookupResult = {
  orderNo: string;
  status: OrderStatus;
  items: OrderLookupItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
  postalCode: string;
  addressLine1: string;
  addressLine2?: string;
  trackingNumber?: string;
};

export type OrderLookupState = {
  errors?: OrderLookupErrors;
  message?: string;
  result?: OrderLookupResult;
};
