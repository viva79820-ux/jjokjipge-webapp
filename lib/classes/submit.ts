import type { Result } from "./actions";

// 저장 응답이 끊기면 성공으로 보지 않고, 같은 입력으로 다시 확인한다.
export async function submitClassAttempt(
  save: () => Promise<Result>,
): Promise<Result> {
  try {
    return await save();
  } catch {
    return {
      state: "unknown",
      message:
        "저장 응답을 확인하지 못했습니다. 저장 결과를 다시 확인해 주세요.",
    };
  }
}

// 업로드가 확정되기 전에는 파일을 지우지 않고, 저장 응답이 끊겨도 다시 쓰지 않는다.
export async function submitClassPosterAttempt(
  deps: {
    upload: () => Promise<string>;
    save: (path: string) => Promise<Result>;
    discard: (path: string) => Promise<boolean>;
    pendingUpload?: () => string | null;
  },
  path: string,
  hasFile: boolean,
) {
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
          ? "포스터 업로드에 실패했습니다. 클래스 정보는 바꾸지 않았습니다."
          : "포스터 업로드 응답을 확인하지 못했습니다. 파일은 지우지 않고 결과를 확인해 주세요.",
      } as Result,
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
      } as Result,
      uploaded,
    };
  }
  if (
    uploaded &&
    (result.state === "rejected" || result.state === "conflict") &&
    result.row?.poster_path !== uploaded
  ) {
    try {
      if (await deps.discard(uploaded)) uploaded = null;
    } catch {
      /* 정리에 실패하면 새 파일을 남겨 둔다. */
    }
  }
  return { result, uploaded };
}
