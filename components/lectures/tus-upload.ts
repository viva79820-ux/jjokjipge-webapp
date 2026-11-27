import { Upload, type UploadOptions } from "tus-js-client";
import type { UploadAuthorization } from "./upload-flow";

export function tusHeaders(authorization: UploadAuthorization) {
  return {
    AuthorizationSignature: authorization.signature,
    AuthorizationExpire: String(authorization.expireUnix),
    LibraryId: authorization.libraryId,
    VideoId: authorization.videoId,
  };
}

// 같은 파일이어도 차시(영상 번호)가 다르면 다른 업로드로 기억한다.
export function lectureUploadFingerprint(videoId: string) {
  return (file: { name?: string; size: number; type?: string }) =>
    Promise.resolve(
      [
        "lecture",
        videoId,
        file.name || "video",
        String(file.size),
        file.type || "",
      ].join(":"),
    );
}

type TusHandlers = {
  onProgress: (percent: number) => void;
  onSuccess: () => void;
  onError: (error: Error) => void;
  suppressed: () => boolean;
};

function tusOptions(
  file: { size: number },
  authorization: UploadAuthorization,
  handlers: TusHandlers,
): UploadOptions {
  return {
    endpoint: authorization.endpoint,
    headers: tusHeaders(authorization),
    metadata: {
      filetype: authorization.metadata.filetype,
      title: authorization.metadata.title,
    },
    fingerprint: lectureUploadFingerprint(authorization.videoId),
    retryDelays: [0, 1000, 3000, 5000],
    storeFingerprintForResuming: true,
    removeFingerprintOnSuccess: true,
    uploadSize: file.size,
    onProgress(bytesSent, bytesTotal) {
      const percent =
        bytesTotal > 0
          ? Math.min(100, Math.floor((bytesSent / bytesTotal) * 100))
          : 0;
      handlers.onProgress(percent);
    },
    onSuccess() {
      handlers.onSuccess();
    },
    onError(error) {
      if (handlers.suppressed()) return;
      handlers.onError(
        error instanceof Error ? error : new Error("업로드에 실패했어요."),
      );
    },
  };
}

export function startFreshUpload(input: {
  file: Blob;
  authorization: UploadAuthorization;
  handlers: TusHandlers;
  UploadImpl?: typeof Upload;
}) {
  const Impl = input.UploadImpl ?? Upload;
  const upload = new Impl(
    input.file,
    tusOptions(input.file, input.authorization, input.handlers),
  );
  upload.start();
  return upload;
}

// 재서명한 권한으로 업로드를 만든 뒤, 이전 업로드가 있으면 이어 올린다.
export async function openResumableUpload(input: {
  file: Blob;
  authorization: UploadAuthorization;
  handlers: TusHandlers;
  UploadImpl?: typeof Upload;
}) {
  const Impl = input.UploadImpl ?? Upload;
  const upload = new Impl(
    input.file,
    tusOptions(input.file, input.authorization, input.handlers),
  );
  const previous = await upload.findPreviousUploads();
  const found = previous[0];
  if (found?.uploadUrl) upload.resumeFromPreviousUpload(found);
  upload.start();
  return upload;
}
