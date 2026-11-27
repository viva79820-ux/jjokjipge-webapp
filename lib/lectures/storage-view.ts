// 관리자 저장소 카드에 보여줄 사용률. 키와 데이터베이스 조회는 두지 않는다.

export type StorageAmounts = {
  usedBytes: number;
  limitBytes: number | null;
  alerted80At: string | null;
};

export type StorageUsageView = {
  usedLabel: string;
  usedExactLabel: string;
  limitLabel: string;
  limitExactLabel: string | null;
  percentLabel: string | null;
  barPercent: number | null;
  warn: boolean;
  checkedLabel: string;
  alertedLabel: string | null;
};

const byteUnits = ["B", "KB", "MB", "GB", "TB"] as const;

export function parseByteCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return null;
}

export function storageAtLeast80(
  usedBytes: number,
  limitBytes: number | null,
): boolean {
  if (limitBytes == null) return false;
  if (!Number.isSafeInteger(usedBytes) || !Number.isSafeInteger(limitBytes)) {
    return false;
  }
  if (usedBytes < 0 || limitBytes < 0) return false;
  return BigInt(usedBytes) * BigInt(10) >= BigInt(limitBytes) * BigInt(8);
}

export function storagePercentPoints(
  usedBytes: number,
  limitBytes: number | null,
): number | null {
  if (limitBytes == null) return null;
  if (!Number.isSafeInteger(usedBytes) || !Number.isSafeInteger(limitBytes)) {
    return null;
  }
  if (usedBytes < 0 || limitBytes < 0) return null;
  if (limitBytes === 0) return 10_000;
  return Number((BigInt(usedBytes) * BigInt(10_000)) / BigInt(limitBytes));
}

export function formatStoragePercent(points: number): string {
  const whole = Math.trunc(points / 100);
  const fraction = Math.abs(points % 100);
  if (fraction === 0) return `${whole}%`;
  if (fraction % 10 === 0) return `${whole}.${fraction / 10}%`;
  return `${whole}.${String(fraction).padStart(2, "0")}%`;
}

export function formatByteSize(bytes: number | null): string {
  if (bytes == null || !Number.isSafeInteger(bytes) || bytes < 0) return "없음";
  if (bytes < 1000) return `${bytes}B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < byteUnits.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const rounded =
    value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}${byteUnits[unit]}`;
}

export function formatByteCount(bytes: number): string {
  return `${bytes.toLocaleString("ko-KR")}바이트`;
}

export function formatStorageTime(value: string | null): string {
  if (!value) return "기록 없음";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "기록 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(time));
}

export function storageUsageView(
  row: StorageAmounts,
  checkedAt: string | null,
): StorageUsageView {
  const points = storagePercentPoints(row.usedBytes, row.limitBytes);
  const alerted = row.alerted80At ? formatStorageTime(row.alerted80At) : null;
  return {
    usedLabel: formatByteSize(row.usedBytes),
    usedExactLabel: formatByteCount(row.usedBytes),
    limitLabel:
      row.limitBytes == null ? "한도 미설정" : formatByteSize(row.limitBytes),
    limitExactLabel:
      row.limitBytes == null ? null : formatByteCount(row.limitBytes),
    percentLabel: points == null ? null : formatStoragePercent(points),
    barPercent: points == null ? null : Math.min(100, points / 100),
    warn: storageAtLeast80(row.usedBytes, row.limitBytes),
    checkedLabel: formatStorageTime(checkedAt),
    alertedLabel: alerted === "기록 없음" ? null : alerted,
  };
}
