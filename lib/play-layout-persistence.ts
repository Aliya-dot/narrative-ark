export interface PlayLayout {
  leftOpen: boolean;
  rightOpen: boolean;
  immersive: boolean;
}

export const DEFAULT_PLAY_LAYOUT: PlayLayout = {
  leftOpen: true,
  rightOpen: true,
  immersive: false,
};

type LayoutStorage = Pick<Storage, "getItem" | "setItem">;

function booleanOrDefault(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function readPlayLayout(
  storage: LayoutStorage,
  key: string,
): PlayLayout {
  try {
    const parsed = JSON.parse(storage.getItem(key) || "{}") as Record<
      string,
      unknown
    >;
    return {
      leftOpen: booleanOrDefault(parsed.leftOpen, DEFAULT_PLAY_LAYOUT.leftOpen),
      rightOpen: booleanOrDefault(
        parsed.rightOpen,
        DEFAULT_PLAY_LAYOUT.rightOpen,
      ),
      immersive: booleanOrDefault(
        parsed.immersive,
        DEFAULT_PLAY_LAYOUT.immersive,
      ),
    };
  } catch {
    return { ...DEFAULT_PLAY_LAYOUT };
  }
}

export function writePlayLayout(
  storage: LayoutStorage,
  key: string,
  layout: PlayLayout,
) {
  try {
    storage.setItem(key, JSON.stringify(layout));
    return true;
  } catch {
    return false;
  }
}
