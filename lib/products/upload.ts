import { bucket, imageKind, imagePath, maxBytes } from "./rules";

export async function inspectImage(file: File) {
  if (file.size === 0 || file.size > maxBytes)
    throw Error("사진은 5MiB 이하의 빈 파일이 아닌 파일을 선택해 주세요.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const kind = imageKind(bytes);
  if (!kind || file.type !== kind.mime)
    throw Error("JPEG·PNG·WebP 사진의 실제 형식과 MIME이 일치해야 합니다.");
  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height) throw Error("사진을 읽을 수 없습니다.");
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
  if (!imagePath(reservedPath) || !reservedPath.endsWith(`.${kind.ext}`))
    throw Error("업로드 경로를 확인해 주세요.");
  const { error } = await client.storage
    .from(bucket)
    .upload(reservedPath, file, {
      upsert: false,
      contentType: kind.mime,
    });
  if (error) throw Error("사진을 업로드하지 못했습니다. 다시 시도해 주세요.");
  return reservedPath;
}
