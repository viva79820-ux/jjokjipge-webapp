export function homeBannerCounselors<
  T extends { isRecommended: boolean; imageUrl: string | null },
>(counselors: readonly T[]) {
  return counselors.filter(
    (counselor) => counselor.isRecommended && Boolean(counselor.imageUrl),
  );
}

export function visibleCareers(careers: readonly string[]) {
  return careers.map((career) => career.trim()).filter(Boolean);
}
