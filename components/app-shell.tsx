"use client";
import Link from "next/link";
import { BookOpen, Library, Settings } from "lucide-react";
import { Toaster } from "sonner";
import { ThemePicker } from "@/components/theme-picker";

function BrandMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 52">
      <path d="M24 2 36 27 24 43 12 27 24 2Z" fill="currentColor" />
      <path d="M24 9v26" stroke="var(--ink)" strokeWidth="2" />
      <circle cx="24" cy="27" fill="var(--gold)" r="2.5" />
      <path
        d="M11 37c-5-1-8 1-9 5 5 1 8-1 9-5Zm26 0c5-1 8 1 9 5-5 1-8-1-9-5ZM15 43c-4 0-6 2-6 5 4 0 6-2 6-5Zm18 0c4 0 6 2 6 5-4 0-6-2-6-5Z"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-50 border-b hairline bg-[color-mix(in_srgb,var(--ink)_92%,transparent)] backdrop-blur-xl">
        <div className="app-header-container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="brand-mark grid h-10 w-10 place-items-center">
              <BrandMark />
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
            <ThemePicker />
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <Toaster position="top-center" toastOptions={{ className: "toast" }} />
    </>
  );
}
