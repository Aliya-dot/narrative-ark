import type { ModuleKey } from "./types";

export interface EditorTabProgress {
  pageY: number;
  panelY: number;
}

export type EditorTabProgressMap = Partial<
  Record<ModuleKey, EditorTabProgress>
>;

const EMPTY_PROGRESS: EditorTabProgress = { pageY: 0, panelY: 0 };

function validPosition(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function saveEditorTabProgress(
  progress: EditorTabProgressMap,
  key: ModuleKey,
  position: EditorTabProgress,
) {
  progress[key] = {
    pageY: validPosition(position.pageY),
    panelY: validPosition(position.panelY),
  };
}

export function readEditorTabProgress(
  progress: EditorTabProgressMap,
  key: ModuleKey,
): EditorTabProgress {
  const position = progress[key];
  return position ? { ...position } : { ...EMPTY_PROGRESS };
}
