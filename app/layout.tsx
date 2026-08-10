import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Operator — automatización de DMs de Instagram",
  description:
    "Comentario a DM automático en Instagram, sobre la API oficial de Meta. Sin cuota mensual y sin límite de envíos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full bg-background text-foreground font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
