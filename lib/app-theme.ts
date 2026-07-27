export const APP_THEME_STORAGE_KEY = "theme";

export const APP_THEMES = [
  { id: "dark", label: "深色" },
  { id: "light", label: "浅色" },
  { id: "mint", label: "青柠薄荷" },
] as const;

export type AppThemeId = (typeof APP_THEMES)[number]["id"];

export const DEFAULT_APP_THEME: AppThemeId = "dark";

const APP_THEME_IDS = APP_THEMES.map((theme) => theme.id);

export function resolveAppTheme(value: string | null): AppThemeId {
  return APP_THEME_IDS.includes(value as AppThemeId)
    ? (value as AppThemeId)
    : DEFAULT_APP_THEME;
}

export const APP_THEME_BOOTSTRAP_SCRIPT = `(()=>{try{const themes=${JSON.stringify(APP_THEME_IDS)};const stored=localStorage.getItem(${JSON.stringify(APP_THEME_STORAGE_KEY)});document.documentElement.dataset.theme=themes.includes(stored)?stored:${JSON.stringify(DEFAULT_APP_THEME)}}catch{document.documentElement.dataset.theme=${JSON.stringify(DEFAULT_APP_THEME)}}})()`;
