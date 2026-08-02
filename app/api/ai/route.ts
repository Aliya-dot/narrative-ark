import { NextRequest, NextResponse } from "next/server";
import {
  executeAiRequest,
  type ModelExecutionContext,
} from "@/lib/model-execution";

const serverContext: ModelExecutionContext = {
  network: {
    transport: "browser",
    fetch(input, init) {
      return globalThis.fetch(input, init);
    },
  },
  runtime: {
    platform: "windows",
    native: true,
    supportsLoopbackOllama: true,
    supportsLanOllama: false,
  },
};

export async function POST(req: NextRequest) {
  const result = await executeAiRequest(await req.json(), serverContext);
  return NextResponse.json(result.body, { status: result.status });
}
