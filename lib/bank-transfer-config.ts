export type BankTransferConfig =
  | {
      status: "preparing";
      notice: "[입금 계좌 준비 중]";
    }
  | {
      status: "confirmed";
      bankName: string;
      accountNumber: string;
      holder: string;
    };

// D-07 확정 전에는 실제처럼 보이는 예시 계좌도 넣지 않는다.
export const bankTransferConfig: BankTransferConfig = {
  status: "preparing",
  notice: "[입금 계좌 준비 중]",
};
