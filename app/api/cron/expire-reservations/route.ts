import { NextResponse } from "next/server";
import { handleDepositExpiryRequest } from "@/lib/reservations/expire-reservations";

export const dynamic = "force-dynamic";

function quiet(status: number) {
  return new NextResponse(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const result = await handleDepositExpiryRequest(
    request.headers.get("authorization"),
    process.env.CRON_SECRET,
  );
  if (result.status !== 200) return quiet(result.status);
  return NextResponse.json(
    { count: result.count },
    { headers: { "Cache-Control": "no-store" } },
  );
}
