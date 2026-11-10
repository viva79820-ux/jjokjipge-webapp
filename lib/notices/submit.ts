// Browser orchestration: a lost response never authorizes deleting the new file.
import type { Result } from "./actions";
export async function submitNoticeAttempt(
  deps: {
    upload: () => Promise<string>;
    save: (path: string) => Promise<Result>;
    discard: (path: string) => Promise<boolean>;
  },
  path: string,
  hasFile: boolean,
) {
  let uploaded: string | null = null;
  try {
    if (hasFile) uploaded = await deps.upload();
  } catch {
    return {
      result: {
        state: "rejected",
        message: "이미지 업로드에 실패했습니다. DB는 변경하지 않았습니다.",
      } as Result,
      uploaded: null,
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
    (result.state === "rejected" || result.state === "conflict")
  ) {
    try {
      if (await deps.discard(uploaded)) uploaded = null;
    } catch {
      /* 정리 실패는 파일을 보존한다. */
    }
  }
  return { result, uploaded };
}
