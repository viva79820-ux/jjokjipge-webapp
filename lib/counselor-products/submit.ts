import type { Result } from "./actions";

// 저장 응답이 끊기면 성공으로 보지 않고, 같은 입력으로 다시 확인한다.
export async function submitProductAttempt(
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
