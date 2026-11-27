import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  lessonStatusFromBunnyGetVideo,
  type LectureUploadAuthorization,
  type LectureVideoStore,
} from "./types";

const streamApi = "https://video.bunnycdn.com";
const tusEndpoint = "https://video.bunnycdn.com/tusupload";
const accountApi = "https://api.bunny.net";
const uploadTtlSeconds = 24 * 60 * 60;

type Env = Record<string, string | undefined>;

export type BunnyLectureVideoOptions = {
  fetch?: typeof fetch;
  env?: Env;
  now?: () => number;
};

function setting(env: Env, name: string) {
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`강의 영상 환경변수 ${name}이 없습니다.`);
  }
  return value.trim();
}

function pathPart(value: string) {
  if (!/^[A-Za-z0-9-]+$/.test(value)) {
    throw new Error("Bunny 영상 주소 형식이 아니에요.");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function bunnyUploadSignature(input: {
  libraryId: string;
  apiKey: string;
  expireUnix: number;
  videoId: string;
}) {
  return createHash("sha256")
    .update(
      `${input.libraryId}${input.apiKey}${input.expireUnix}${input.videoId}`,
    )
    .digest("hex");
}

export function bunnyWebhookSignatureMatches(input: {
  rawBody: string;
  signature: string | null;
  version: string | null;
  algorithm: string | null;
  secret: string;
}) {
  if (input.version && input.version !== "v1") return false;
  if (input.algorithm && input.algorithm !== "hmac-sha256") return false;
  if (!input.secret || !input.signature) return false;
  const expected = createHmac("sha256", input.secret)
    .update(input.rawBody, "utf8")
    .digest("hex");
  const actual = Buffer.from(input.signature);
  const expectedBytes = Buffer.from(expected);
  if (actual.length !== expectedBytes.length) return false;
  return timingSafeEqual(actual, expectedBytes);
}

async function bunnyFetch(
  fetchImpl: typeof fetch,
  url: string,
  accessKey: string,
  method: string,
  body?: string,
) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    AccessKey: accessKey,
  };
  if (body != null) headers["Content-Type"] = "application/json";
  return fetchImpl(url, {
    method,
    headers,
    body,
    redirect: "error",
    cache: "no-store",
  });
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Bunny 요청이 실패했어요. (${response.status})`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Bunny 응답을 읽지 못했어요.");
  }
}

function optionalCount(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("Bunny 영상 수치를 읽지 못했어요.");
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error("Bunny 영상 수치가 너무 커요.");
  }
  return value;
}

export function createBunnyLectureVideoStore(
  options: BunnyLectureVideoOptions = {},
): LectureVideoStore {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;

  function libraryId() {
    return pathPart(setting(env, "BUNNY_STREAM_LIBRARY_ID"));
  }

  function streamKey() {
    return setting(env, "BUNNY_STREAM_API_KEY");
  }

  function videoUrl(videoId: string) {
    return `${streamApi}/library/${libraryId()}/videos/${pathPart(videoId)}`;
  }

  return {
    async createVideo({ title }) {
      if (typeof title !== "string" || !title.trim()) {
        throw new Error("영상 제목이 필요해요.");
      }
      const response = await bunnyFetch(
        fetchImpl,
        `${streamApi}/library/${libraryId()}/videos`,
        streamKey(),
        "POST",
        JSON.stringify({ title }),
      );
      const payload = await readJson(response);
      if (!isRecord(payload) || typeof payload.guid !== "string") {
        throw new Error("Bunny 영상 번호를 받지 못했어요.");
      }
      pathPart(payload.guid);
      return { videoId: payload.guid };
    },
    async issueUpload({ videoId }) {
      const id = pathPart(videoId);
      const library = libraryId();
      const apiKey = streamKey();
      const expireUnix = Math.floor(now() / 1000) + uploadTtlSeconds;
      const signature = bunnyUploadSignature({
        libraryId: library,
        apiKey,
        expireUnix,
        videoId: id,
      });
      const upload: LectureUploadAuthorization = {
        videoId: id,
        endpoint: tusEndpoint,
        signature,
        expireUnix,
        libraryId: library,
        metadata: {
          filetype: "video/mp4",
          title: "",
        },
      };
      return upload;
    },
    async getStatus(videoId) {
      const response = await bunnyFetch(
        fetchImpl,
        videoUrl(videoId),
        streamKey(),
        "GET",
      );
      const payload = await readJson(response);
      if (!isRecord(payload) || typeof payload.status !== "number") {
        throw new Error("Bunny 영상 상태를 읽지 못했어요.");
      }
      if (!Number.isInteger(payload.status)) {
        throw new Error("Bunny 영상 상태를 읽지 못했어요.");
      }
      return {
        status: lessonStatusFromBunnyGetVideo(payload.status),
        encodeProgress: optionalCount(payload.encodeProgress),
        durationSeconds: optionalCount(payload.length),
        storageBytes: optionalCount(payload.storageSize),
      };
    },
    async deleteVideo(videoId) {
      const response = await bunnyFetch(
        fetchImpl,
        videoUrl(videoId),
        streamKey(),
        "DELETE",
      );
      if (response.status === 404) {
        await response.arrayBuffer();
        return;
      }
      if (!response.ok) {
        await response.arrayBuffer();
        throw new Error(`Bunny 영상 삭제가 실패했어요. (${response.status})`);
      }
      await response.arrayBuffer();
    },
    async getPlayback(videoId) {
      const status = await this.getStatus(videoId);
      if (status.status !== "ready") return null;
      const id = pathPart(videoId);
      return {
        embedUrl: `https://player.mediadelivery.net/embed/${libraryId()}/${id}`,
      };
    },
    async getStorageUsage() {
      const response = await bunnyFetch(
        fetchImpl,
        `${accountApi}/videolibrary/${libraryId()}`,
        setting(env, "BUNNY_ACCOUNT_API_KEY"),
        "GET",
      );
      const payload = await readJson(response);
      if (
        !isRecord(payload) ||
        typeof payload.StorageUsage !== "number" ||
        !Number.isSafeInteger(payload.StorageUsage) ||
        payload.StorageUsage < 0
      ) {
        throw new Error("저장소 사용량을 읽지 못했어요.");
      }
      return { usedBytes: payload.StorageUsage };
    },
  };
}
