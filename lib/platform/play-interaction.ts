export type PlayShortcutAction =
  | "fullscreen"
  | "save"
  | "immersive"
  | "status"
  | "story"
  | "world"
  | "escape"
  | { choiceIndex: number };

export type ShortcutInput = {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  editable?: boolean;
};

export function resolvePlayShortcut(
  input: ShortcutInput,
): PlayShortcutAction | null {
  const key = input.key.toLowerCase();
  if (key === "f11") return "fullscreen";
  if (key === "escape") return "escape";
  if (input.editable) return null;

  const command = Boolean(input.ctrlKey || input.metaKey);
  if (command && !input.shiftKey && key === "s") return "save";
  if (command && input.shiftKey && key === "f") return "immersive";
  if (input.altKey && key === "1") return "status";
  if (input.altKey && key === "2") return "story";
  if (input.altKey && key === "3") return "world";
  if (!command && !input.altKey && /^[1-9]$/.test(key)) {
    return { choiceIndex: Number(key) - 1 };
  }
  return null;
}

export type AndroidBackState = {
  modalOpen: boolean;
  menuOpen: boolean;
  confirmationOpen: boolean;
  section: "status" | "story" | "world";
  editing: boolean;
  canGoBack: boolean;
};

export type AndroidBackAction =
  | "close-modal"
  | "close-menu"
  | "close-confirmation"
  | "show-story"
  | "dismiss-keyboard"
  | "history-back"
  | "home";

export function resolveAndroidBackAction(
  state: AndroidBackState,
): AndroidBackAction {
  if (state.modalOpen) return "close-modal";
  if (state.menuOpen) return "close-menu";
  if (state.confirmationOpen) return "close-confirmation";
  if (state.section !== "story") return "show-story";
  if (state.editing) return "dismiss-keyboard";
  return state.canGoBack ? "history-back" : "home";
}
