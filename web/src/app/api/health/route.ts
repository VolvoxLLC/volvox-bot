import { NextResponse } from "next/server";

/**
 * Health check endpoint for container orchestration (Docker HEALTHCHECK, Railway).
 * Returns 200 with a simple JSON payload. No authentication required.
 */
export function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
