import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mockterview — Practice out loud",
  description:
    "A private, instant practice partner for technical interviews and presentations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
