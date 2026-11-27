import { cronAuthorized, runStorageCheck } from "@/lib/lectures/lesson-ops";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (
    !cronAuthorized(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  ) {
    return new Response(null, { status: 401 });
  }
  try {
    const { storageCheckDeps } = await import("@/lib/lectures/lesson-db");
    const result = await runStorageCheck(await storageCheckDeps());
    return Response.json({ ok: true, alerted: result.alerted });
  } catch {
    return new Response(null, { status: 500 });
  }
}
