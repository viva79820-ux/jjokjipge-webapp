export const orderConfig = {
  maxLines: 30,
  maxQuantity: 99,
  // D-14 확정 전 임시값이다. 주문서에 미확정 사실을 함께 표시한다.
  shippingFee: 0,
  shippingFeeConfirmed: false,
} as const;
