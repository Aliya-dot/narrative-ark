import { NextResponse } from "next/server";
import { getBackendDatabase } from "@/server/backend-db";

export const runtime = "nodejs";

export async function GET() {
  const health = getBackendDatabase().health();
  return NextResponse.json({
    ...health,
    service: "narrative-ark-backend",
  });
}
