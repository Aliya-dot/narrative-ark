import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { APP_THEME_BOOTSTRAP_SCRIPT } from "@/lib/app-theme";

export const metadata: Metadata = {
  applicationName: "叙界 / Narrative Ark",
  title: "叙界 · AI 文字冒险工坊",
  description: "生成、编辑并游玩可持续记忆的 AI 文字冒险",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/narrative-ark.svg", type: "image/svg+xml" },
      {
        url: "/icons/narrative-ark-32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
    shortcut: "/favicon.ico",
    apple: [
      {
        url: "/icons/narrative-ark-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#faf9ee",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: APP_THEME_BOOTSTRAP_SCRIPT }}
        />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
