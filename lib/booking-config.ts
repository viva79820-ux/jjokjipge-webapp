import { bankTransferConfig } from "@/lib/bank-transfer-config";

export const bookingConfig = {
  openHour: 12,
  closeHour: 22,
  slotMinutes: 30,
  maxDaysAhead: 14,
  minLeadMinutes: 120,
  depositHours: 24,
  maxPendingPerContact: 2,
  minSubmitSeconds: 3,
  bank: bankTransferConfig,
} as const;
