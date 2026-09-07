import { NextRequest, NextResponse } from "next/server";
import { generateGroqNarrative } from "@/lib/narration/groqProvider";
import { NarrationContext } from "@/lib/narration/types";

export async function POST(req: NextRequest) {
  try {
    const context: NarrationContext = await req.json();
    const narrative = await generateGroqNarrative(context);
    return NextResponse.json({ narrative, success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal narration error", success: false },
      { status: 500 }
    );
  }
}
