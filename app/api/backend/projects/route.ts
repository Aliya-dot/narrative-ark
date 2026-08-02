import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  BackendConflictError,
  getBackendDatabase,
  type StoredProject,
} from "@/server/backend-db";

export const runtime = "nodejs";

const storedProjectSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    updatedAt: z.string().datetime(),
  })
  .passthrough();

const putProjectSchema = z.object({
  project: storedProjectSchema,
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
});

export async function GET() {
  return NextResponse.json({
    data: getBackendDatabase().listProjects(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const input = putProjectSchema.parse(await request.json());
    const project = getBackendDatabase().putProject(
      input.project as StoredProject,
      input.expectedUpdatedAt,
    );
    return NextResponse.json({ data: project });
  } catch (error) {
    if (error instanceof BackendConflictError) {
      return NextResponse.json(
        { error: error.message, code: "project_version_conflict" },
        { status: 409 },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "项目数据格式不正确", code: "invalid_project" },
        { status: 400 },
      );
    }
    throw error;
  }
}
