import "server-only";

// 저장소 호출 형태만 고정한다. mock·bunny 구현과 서버 액션은 다음 작업이다.
// LECTURE_VIDEO_PROVIDER=mock|bunny 로 구현을 고른다. API 키는 이 파일에 두지 않는다.

export const lectureVideoProviders = ["mock", "bunny"] as const;

export type LectureVideoProviderName = (typeof lectureVideoProviders)[number];

export const lessonVideoStatuses = [
  "created",
  "uploading",
  "processing",
  "ready",
  "failed",
] as const;

export type LessonVideoStatus = (typeof lessonVideoStatuses)[number];

// Get Video status와 웹훅 Status는 번호가 다르다. 한 표로 같이 쓰지 않는다.
// Get Video: https://docs.bunny.net/api-reference/stream/manage-videos/get-video
// 0 Created, 1 Uploaded, 2 Processing, 3 Transcoding, 4 Finished, 5 Error, 6 UploadFailed
// 4만 ready. 1(Uploaded)은 수신이 끝나 변환 대기이므로 processing.
export const bunnyGetVideoFinished = 4;

export const bunnyGetVideoStatusToLesson: Record<number, LessonVideoStatus> = {
  0: "created",
  1: "processing",
  2: "processing",
  3: "processing",
  4: "ready",
  5: "failed",
  6: "failed",
};

// 웹훅: https://docs.bunny.net/stream/webhooks
// 0 Queued, 1 Processing, 2 Encoding, 3 Finished, 4 해상도 하나 완료,
// 5 Failed, 6 업로드 시작, 7 업로드 완료, 8 업로드 실패
// 3만 ready. 4는 재생이 시작돼도 processing으로 둔다.
export const bunnyWebhookFinished = 3;

export const bunnyWebhookResolutionFinished = 4;

export const bunnyWebhookStatusToLesson: Record<number, LessonVideoStatus> = {
  0: "processing",
  1: "processing",
  2: "processing",
  3: "ready",
  4: "processing",
  5: "failed",
  6: "uploading",
  7: "processing",
  8: "failed",
};

// 표에 없는 번호는 ready로 올리지 않고 processing으로 둔다.
export function lessonStatusFromBunnyGetVideo(
  status: number,
): LessonVideoStatus {
  return bunnyGetVideoStatusToLesson[status] ?? "processing";
}

export function lessonStatusFromBunnyWebhook(
  status: number,
): LessonVideoStatus {
  return bunnyWebhookStatusToLesson[status] ?? "processing";
}

// TUS 서명 헤더. AccessKey와 API 키는 여기 넣지 않는다.
// signature는 SHA256(libraryId + apiKey + expiration + videoId) 결과만 담는다.
export const bunnyUploadHeader = {
  signature: "AuthorizationSignature",
  expire: "AuthorizationExpire",
  libraryId: "LibraryId",
  videoId: "VideoId",
} as const;

export type LectureUploadAuthorization = {
  videoId: string;
  endpoint: string;
  signature: string;
  expireUnix: number;
  libraryId: string;
  metadata: {
    filetype: string;
    title: string;
  };
};

export type LectureVideoStatusReport = {
  status: LessonVideoStatus;
  encodeProgress: number | null;
  durationSeconds: number | null;
  storageBytes: number | null;
};

export type LecturePlayback = {
  embedUrl: string;
};

export type LectureStorageUsage = {
  usedBytes: number;
};

export interface LectureVideoStore {
  createVideo(input: { title: string }): Promise<{ videoId: string }>;
  // 이어 올리기용 서명. 반환 값에 API 키를 넣지 않는다.
  issueUpload(input: { videoId: string }): Promise<LectureUploadAuthorization>;
  getStatus(videoId: string): Promise<LectureVideoStatusReport>;
  // 저장소가 404를 주면 이미 지워진 것으로 보고 성공 처리한다.
  deleteVideo(videoId: string): Promise<void>;
  // ready일 때만 임베드 주소. 그 외 상태(웹훅 4 포함)는 null.
  getPlayback(videoId: string): Promise<LecturePlayback | null>;
  getStorageUsage(): Promise<LectureStorageUsage>;
}
