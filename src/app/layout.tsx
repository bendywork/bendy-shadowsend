import type { Metadata } from "next";
import "./globals.css";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export const metadata: Metadata = {
  title: "Temp Bendy",
  description: "Temporary encrypted chat app built with Next.js, PostgreSQL and S3.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
