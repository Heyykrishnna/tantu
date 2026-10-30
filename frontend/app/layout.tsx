import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({ src: "./fonts/Inter-Variable.woff2", variable: "--font-inter", weight: "100 900", display: "swap" });
const poppins = localFont({ src: [{ path: "./fonts/Poppins-Medium.woff2", weight: "500", style: "normal" }, { path: "./fonts/Poppins-SemiBold.woff2", weight: "600", style: "normal" }], variable: "--font-poppins", display: "swap" });

export const metadata: Metadata = {
  title: "tantu — Your work, considered",
  description: "A private, connected place for your tasks and pages.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" className={`${inter.variable} ${poppins.variable} scheme-light dark:scheme-dark`}>
      <body className="min-h-dvh bg-[#f8f9fc] font-sans text-[13px] leading-relaxed text-[#30394a] antialiased selection:bg-violet-400/25 dark:bg-[#1b1b1b] dark:text-[#e8e8ec]">{children}</body>
    </html>
  );
}
