import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "AI Operator",
    template: "%s · AI Operator",
  },
  description:
    "Comentario a DM automático en Instagram, sobre la API oficial de Meta. Sin cuota mensual y sin límite de envíos.",
  applicationName: "AI Operator",
  appleWebApp: { capable: true, title: "AI Operator" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfcf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" },
  ],
};

/**
 * Fija data-theme antes del primer paint, para que no haya flash.
 *
 * El defecto es CLARO a propósito, no el del sistema: el tema claro cálido es
 * la identidad de Rodri OS, y con muchos usando el SO en oscuro el defecto de
 * sistema hacía que la app casi nunca se viese como su marca. Quien quiera
 * oscuro lo elige y queda guardado.
 */
const themeScript = `(function(){try{var t=localStorage.getItem("theme");document.documentElement.dataset.theme=t==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`h-full ${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full bg-background text-foreground font-sans antialiased">
        <div className="ambient-glow" aria-hidden>
          <div className="ambient-blob ambient-blob-1" />
          <div className="ambient-blob ambient-blob-2" />
        </div>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
