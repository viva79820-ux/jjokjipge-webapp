import { receiveBunnyWebhook } from "@/lib/lectures/lesson-ops";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  return receiveBunnyWebhook({
    rawBody,
    signature: request.headers.get("x-bunnystream-signature"),
    version: request.headers.get("x-bunnystream-signature-version"),
    algorithm: request.headers.get("x-bunnystream-signature-algorithm"),
    secret: process.env.BUNNY_STREAM_READONLY_API_KEY ?? "",
    libraryId: process.env.BUNNY_STREAM_LIBRARY_ID ?? "",
    openDb: async () => {
      const { webhookDb } = await import("@/lib/lectures/lesson-db");
      return webhookDb();
    },
  });
}
