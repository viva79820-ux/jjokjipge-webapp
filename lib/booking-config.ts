export const bookingConfig = {
  openHour: 12,
  closeHour: 22,
  slotMinutes: 30,
  maxDaysAhead: 14,
  minLeadMinutes: 120,
  depositHours: 24,
  bank: {
    name: "예시은행",
    account: "000-0000-0000",
    holder: "쪽집게천사(예시)",
  },
} as const;
