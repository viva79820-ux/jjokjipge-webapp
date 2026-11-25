export function homeBannerCounselors<T extends { isRecommended: boolean }>(
  counselors: readonly T[],
) {
  return counselors.filter((counselor) => counselor.isRecommended);
}

export function visibleCareers(careers: readonly string[]) {
  return careers.map((career) => career.trim()).filter(Boolean);
}
