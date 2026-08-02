import { NextRequest, NextResponse } from "next/server";
import { getBackendDatabase } from "@/server/backend-db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const project = getBackendDatabase().getProject(id);
  if (!project) {
    return NextResponse.json(
      { error: "项目不存在", code: "project_not_found" },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: project });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const deleted = getBackendDatabase().deleteProject(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "项目不存在", code: "project_not_found" },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: { id, deleted: true } });
}
