export const APP_THEME_STORAGE_KEY = "theme";

export const APP_THEMES = [
  { id: "dark", label: "深色" },
  { id: "light", label: "浅色" },
  { id: "mint", label: "青柠薄荷" },
  { id: "celadon", label: "雾海青瓷" },
] as const;

export type AppThemeId = (typeof APP_THEMES)[number]["id"];

export const DEFAULT_APP_THEME: AppThemeId = "dark";
export const ANDROID_DEFAULT_APP_THEME: AppThemeId = "celadon";

const APP_THEME_IDS = APP_THEMES.map((theme) => theme.id);

export function resolveDefaultAppTheme(userAgent: string): AppThemeId {
  return userAgent.toLowerCase().includes("android")
    ? ANDROID_DEFAULT_APP_THEME
    : DEFAULT_APP_THEME;
}

export function resolveAppTheme(
  value: string | null,
  userAgent = "",
): AppThemeId {
  return APP_THEME_IDS.includes(value as AppThemeId)
    ? (value as AppThemeId)
    : resolveDefaultAppTheme(userAgent);
}

export function applyStoredAppTheme(
  storage: Pick<Storage, "getItem">,
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
) {
  let theme = resolveDefaultAppTheme(userAgent);
  try {
    theme = resolveAppTheme(storage.getItem(APP_THEME_STORAGE_KEY), userAgent);
  } catch {
    // Keep the deterministic default when storage is unavailable.
  }
  document.documentElement.dataset.theme = theme;
  return theme;
}

export const APP_THEME_BOOTSTRAP_SCRIPT = `(()=>{const ua=typeof navigator==="undefined"?"":navigator.userAgent;const fallback=ua.toLowerCase().includes("android")?${JSON.stringify(ANDROID_DEFAULT_APP_THEME)}:${JSON.stringify(DEFAULT_APP_THEME)};try{const themes=${JSON.stringify(APP_THEME_IDS)};const stored=localStorage.getItem(${JSON.stringify(APP_THEME_STORAGE_KEY)});document.documentElement.dataset.theme=themes.includes(stored)?stored:fallback}catch{document.documentElement.dataset.theme=fallback}})()`;
