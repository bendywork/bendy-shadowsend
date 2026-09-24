import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/context";

export const metadata: Metadata = {
  title: "Temp Bendy",
  description: "Temporary encrypted chat app built with Next.js, PostgreSQL and S3.",
};

// 预水合脚本：首帧绘制前依据 localStorage 同步 <html data-theme> 与 <html lang>，
// 规避「深色/中文默认值」与用户实际偏好不一致造成的闪烁（FOUC）。
// 键名需与来源保持一致：tb:theme（theme-toggle）、tb:lang（i18n LANG_STORAGE_KEY）。
const PREHYDRATION_INIT = `(function(){try{var d=document.documentElement;var t=localStorage.getItem("tb:theme");d.setAttribute("data-theme",t==="light"||t==="dark"?t:"dark");var l=localStorage.getItem("tb:lang");d.setAttribute("lang",l==="en"?"en":"zh-CN");}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREHYDRATION_INIT }} />
      </head>
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
