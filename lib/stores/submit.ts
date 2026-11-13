// 브라우저 저장 순서. 응답을 확인하기 전에는 새 파일을 지우지 않는다.
import type { Result } from "./actions";

export async function submitStoreAttempt(
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
          ? "사진 업로드에 실패했습니다. DB는 변경하지 않았습니다."
          : "사진 업로드 응답을 확인하지 못했습니다. 파일은 지우지 않고 결과를 확인해 주세요.",
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
    result.row?.image_path !== uploaded
  ) {
    try {
      if (await deps.discard(uploaded)) uploaded = null;
    } catch {
      /* 정리 실패는 파일을 보존한다. */
    }
  }
  return { result, uploaded };
}
