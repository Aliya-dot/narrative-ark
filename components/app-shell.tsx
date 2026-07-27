"use client";
import Link from "next/link";
import { BookOpen, Feather, Library, Settings, SunMoon } from "lucide-react";
import { Toaster } from "sonner";
import { useEffect, useState } from "react";
import {
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
  nextAppTheme,
  resolveAppTheme,
  type AppThemeId,
} from "@/lib/app-theme";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AppThemeId>(DEFAULT_APP_THEME);

  useEffect(() => {
    const storedTheme = resolveAppTheme(
      localStorage.getItem(APP_THEME_STORAGE_KEY),
    );
    setTheme(storedTheme);
    document.documentElement.dataset.theme = storedTheme;
  }, []);

  function toggle() {
    const nextTheme = nextAppTheme(theme);
    setTheme(nextTheme);
    localStorage.setItem(APP_THEME_STORAGE_KEY, nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b hairline bg-[color-mix(in_srgb,var(--ink)_92%,transparent)] backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="brand-mark grid h-9 w-9 place-items-center rounded-full border hairline">
              <Feather size={17} className="gold" />
            </span>
            <span>
              <b className="display tracking-[.18em]">叙界</b>
              <small className="desktop-only ml-3 muted">NARRATIVE ARK</small>
            </span>
          </Link>
          <nav className="header-actions flex items-center gap-1">
            <Link
              className="btn border-transparent bg-transparent"
              href="/create"
            >
              <BookOpen size={16} />
              <span className="nav-create-label">创作</span>
            </Link>
            <Link
              className="btn border-transparent bg-transparent"
              href="/settings"
            >
              <Settings size={16} />
              <span className="desktop-only">API 设置</span>
            </Link>
            <Link
              className="btn border-transparent bg-transparent"
              href="/worldbooks"
              title="管理可复用的世界设定"
            >
              <Library size={16} />
              <span className="desktop-only">世界书</span>
            </Link>
            <span
              aria-hidden="true"
              className="mx-1 hidden h-6 w-px bg-[var(--line)] sm:block"
            />
            <div className="flex items-center gap-1" id="app-shell-actions" />
            <button
              aria-label="切换主题"
              className="btn icon-btn border-transparent bg-transparent"
              onClick={toggle}
            >
              <SunMoon size={17} />
            </button>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <Toaster position="top-center" toastOptions={{ className: "toast" }} />
    </>
  );
}
