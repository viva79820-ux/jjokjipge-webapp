import type { Result } from "./actions";

// 업로드가 확정되기 전에는 파일을 지우지 않고, 저장 응답이 끊겨도 다시 쓰지 않는다.
export function submitContentAttempt(
  save: () => Promise<Result>,
): Promise<Result>;
export function submitContentAttempt(
  deps: {
    upload: () => Promise<string>;
    save: (path: string) => Promise<Result>;
    discard: (path: string) => Promise<boolean>;
    pendingUpload?: () => string | null;
  },
  path: string,
  hasFile: boolean,
): Promise<{ result: Result; uploaded: string | null }>;
export async function submitContentAttempt(
  deps:
    | (() => Promise<Result>)
    | {
        upload: () => Promise<string>;
        save: (path: string) => Promise<Result>;
        discard: (path: string) => Promise<boolean>;
        pendingUpload?: () => string | null;
      },
  path = "",
  hasFile = false,
): Promise<
  | Result
  | {
      result: Result;
      uploaded: string | null;
    }
> {
  if (typeof deps === "function") {
    try {
      return await deps();
    } catch {
      return {
        state: "unknown",
        message:
          "저장 응답을 확인하지 못했습니다. 저장 결과를 다시 확인해 주세요.",
      };
    }
  }
  let uploaded: string | null = null;
  try {
    if (hasFile) uploaded = await deps.upload();
  } catch (error) {
    const definite = Boolean(
      error &&
      typeof error === "object" &&
      "definite" in error &&
      error.definite === true,
    );
    return {
      result: {
        state: definite ? "rejected" : "unknown",
        message: definite
          ? "썸네일 업로드에 실패했습니다. 콘텐츠 정보는 바꾸지 않았습니다."
          : "썸네일 업로드 응답을 확인하지 못했습니다. 파일은 지우지 않고 결과를 확인해 주세요.",
      },
      uploaded: deps.pendingUpload?.() || null,
    };
  }
  let result: Result;
  try {
    result = await deps.save(uploaded || path);
  } catch {
    return {
      result: {
        state: "unknown",
        message:
          "저장 응답을 확인하지 못했습니다. 저장 결과를 다시 확인해 주세요.",
      },
      uploaded,
    };
  }
  if (
    uploaded &&
    (result.state === "rejected" || result.state === "conflict") &&
    result.row?.thumbnail_path !== uploaded
  ) {
    try {
      if (await deps.discard(uploaded)) uploaded = null;
    } catch {
      /* 정리에 실패하면 새 파일을 남겨 둔다. */
    }
  }
  return { result, uploaded };
}
