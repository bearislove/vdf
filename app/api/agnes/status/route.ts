import { NextResponse } from "next/server";
import { agnesTestConnection } from "@/lib/providers/agnes";

export async function GET() {
  const result = await agnesTestConnection();
  return NextResponse.json(result);
}
