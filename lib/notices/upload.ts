import { maxBytes, bucket, imagePath } from "./rules";
export async function inspectImage(file: File) {
  if (file.size === 0 || file.size > maxBytes)
    throw Error("이미지는 5MiB 이하의 빈 파일이 아닌 파일을 선택해 주세요.");
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ext =
    b[0] === 255 && b[1] === 216 && b[2] === 255
      ? "jpg"
      : b.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
        ? "png"
        : String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...b.slice(8, 12)) === "WEBP"
          ? "webp"
          : null;
  const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  if (!ext || file.type !== mime)
    throw Error("JPEG·PNG·WebP 이미지의 실제 형식과 MIME이 일치해야 합니다.");
  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height)
      throw Error("이미지를 읽을 수 없습니다.");
  } finally {
    image.close();
  }
  return { ext, mime };
}
export async function uploadImage(
  client: ReturnType<typeof import("@/lib/supabase/client").createClient>,
  file: File,
  reservedPath?: string,
) {
  const { ext, mime } = await inspectImage(file);
  const path = reservedPath || `notices/${crypto.randomUUID()}.${ext}`;
  if (!imagePath(path) || !path.endsWith(`.${ext}`))
    throw Error("업로드 경로를 확인해 주세요.");
  const { error } = await client.storage
    .from(bucket)
    .upload(path, file, { upsert: false, contentType: mime });
  if (error) throw Error("이미지를 업로드하지 못했습니다. 다시 시도해 주세요.");
  return path;
}
