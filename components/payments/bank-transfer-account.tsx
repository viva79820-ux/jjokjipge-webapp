import { bankTransferConfig } from "@/lib/bank-transfer-config";

export function BankTransferAccount() {
  if (bankTransferConfig.status === "preparing") {
    return (
      <p className="mt-2 font-bold text-foreground">
        {bankTransferConfig.notice}
      </p>
    );
  }

  return (
    <div className="mt-2">
      <p className="break-words">
        {bankTransferConfig.bankName} {bankTransferConfig.accountNumber}
      </p>
      <p className="break-words">예금주: {bankTransferConfig.holder}</p>
    </div>
  );
}
