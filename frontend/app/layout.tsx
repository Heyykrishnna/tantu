import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "tantu — Your work, considered",
  description: "A private, connected place for your tasks and pages.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
