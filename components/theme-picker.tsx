"use client";

import { Check, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  APP_THEMES,
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
  resolveAppTheme,
  type AppThemeId,
} from "@/lib/app-theme";

export function ThemePicker() {
  const [theme, setTheme] = useState<AppThemeId>(DEFAULT_APP_THEME);
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const storedTheme = resolveAppTheme(
      localStorage.getItem(APP_THEME_STORAGE_KEY),
    );
    setTheme(storedTheme);
    document.documentElement.dataset.theme = storedTheme;
  }, []);

  useEffect(() => {
    function closeWhenClickingOutside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        menuRef.current?.removeAttribute("open");
      }
    }

    document.addEventListener("pointerdown", closeWhenClickingOutside);
    return () =>
      document.removeEventListener("pointerdown", closeWhenClickingOutside);
  }, []);

  function selectTheme(nextTheme: AppThemeId) {
    setTheme(nextTheme);
    localStorage.setItem(APP_THEME_STORAGE_KEY, nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    menuRef.current?.removeAttribute("open");
  }

  const activeTheme =
    APP_THEMES.find(({ id }) => id === theme) ?? APP_THEMES[0];

  return (
    <details className="theme-picker" ref={menuRef}>
      <summary
        aria-label={`主题设置，当前为${activeTheme.label}`}
        className="btn icon-btn border-transparent bg-transparent"
        title={`主题：${activeTheme.label}`}
      >
        <Palette size={17} />
      </summary>
      <div
        aria-label="选择界面主题"
        className="theme-picker-menu panel"
        role="menu"
      >
        <div className="theme-picker-heading">
          <strong>界面主题</strong>
          <small className="muted">选择后自动保存</small>
        </div>
        <div className="theme-picker-options">
          {APP_THEMES.map((option) => {
            const isActive = option.id === theme;

            return (
              <button
                aria-checked={isActive}
                className="theme-picker-option"
                key={option.id}
                onClick={() => selectTheme(option.id)}
                role="menuitemradio"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="theme-picker-swatch"
                  data-theme-swatch={option.id}
                />
                <span>{option.label}</span>
                {isActive ? (
                  <Check className="theme-picker-check" size={16} />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </details>
  );
}
