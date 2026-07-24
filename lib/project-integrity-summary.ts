import type { ProjectIntegrityIssue } from "./project-integrity";

function formatId(label: "entityId" | "relatedId", value?: string): string {
  if (value === undefined) return "";
  const limit = 80;
  const bounded = value.slice(0, limit);
  const suffix = value.length > limit ? "…" : "";
  return ` ${label}=${JSON.stringify(`${bounded}${suffix}`)}`;
}

export function formatProjectIntegrityFailure(
  issues: readonly ProjectIntegrityIssue[],
): string {
  const visibleLimit = 3;
  const visible = issues.slice(0, visibleLimit).map(
    (issue) =>
      `${issue.code} @ ${issue.path}${formatId("entityId", issue.entityId)}${formatId("relatedId", issue.relatedId)}`,
  );
  const remaining =
    issues.length > visibleLimit ? `；另有 ${issues.length - visibleLimit} 项` : "";
  return `项目完整性检查未通过（${issues.length} 项）：${visible.join("；")}${remaining}`;
}
