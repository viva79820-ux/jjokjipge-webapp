import { bucket, imageKind, maxBytes, thumbnailPath } from "./rules";

export function uploadLookupMessage(state: string) {
  if (state === "missing") return "업로드된 파일이 없습니다.";
  if (state === "forbidden")
    return "썸네일 조회 권한이 없습니다. 파일은 지우지 않습니다.";
  if (state === "unavailable")
    return "썸네일 저장소를 일시적으로 확인하지 못했습니다. 파일은 지우지 않습니다.";
  if (state === "unknown")
    return "썸네일 조회 응답을 확인하지 못했습니다. 파일은 지우지 않습니다.";
  if (state === "rejected")
    return "업로드 썸네일의 크기·형식을 확인하지 못했습니다. 파일은 지우지 않습니다.";
  return "";
}

export async function inspectImage(file: File) {
  if (file.size === 0 || file.size > maxBytes)
    throw Error("썸네일은 5MiB 이하의 빈 파일이 아닌 파일을 선택해 주세요.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const kind = imageKind(bytes);
  if (!kind || file.type !== kind.mime)
    throw Error("JPEG·PNG·WebP 썸네일의 실제 형식과 MIME이 일치해야 합니다.");
  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height)
      throw Error("썸네일을 읽을 수 없습니다.");
  } finally {
    image.close();
  }
  return kind;
}

export async function uploadImage(
  client: ReturnType<typeof import("@/lib/supabase/client").createClient>,
  file: File,
  reservedPath: string,
) {
  const kind = await inspectImage(file);
  if (
    !thumbnailPath(reservedPath) ||
    !(
      reservedPath.endsWith(`.${kind.ext}`) ||
      (kind.ext === "jpg" && reservedPath.endsWith(".jpeg"))
    )
  )
    throw Error("업로드 경로를 확인해 주세요.");
  const { error } = await client.storage
    .from(bucket)
    .upload(reservedPath, file, {
      upsert: false,
      contentType: kind.mime,
    });
  if (error) throw Error("썸네일을 업로드하지 못했습니다. 다시 시도해 주세요.");
  return reservedPath;
}
