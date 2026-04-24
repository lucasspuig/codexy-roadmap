import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://plan.codexyoficial.com";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Codexy · Panel de roadmaps",
    template: "%s · Codexy",
  },
  description:
    "Seguimiento en tiempo real del plan de implementación con Codexy. Sistemas inteligentes para clínicas.",
  applicationName: "Codexy Roadmaps",
  authors: [{ name: "Codexy", url: "https://codexyoficial.com" }],
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "Codexy",
    title: "Codexy · Plan de implementación",
    description:
      "Seguimiento en tiempo real del plan de implementación con Codexy. Sistemas inteligentes para clínicas.",
    images: [
      {
        url: "/brand/codexy-full-black.png",
        width: 1200,
        height: 630,
        alt: "Codexy",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Codexy · Plan de implementación",
    description: "Seguimiento en tiempo real con Codexy",
    images: ["/brand/codexy-full-black.png"],
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        {/*
          Script inline que aplica el theme ANTES de React para evitar flash.
          No puede fallar — corre en todos los clientes.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('codexy-theme');var t=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(_){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster
          position="bottom-right"
          offset={16}
          toastOptions={{
            unstyled: false,
            style: {
              background:
                "color-mix(in srgb, var(--color-s1) 78%, transparent)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              border: "1px solid var(--color-b1)",
              color: "var(--color-t1)",
              borderRadius: "10px",
              fontFamily: "var(--ff-sans)",
              fontSize: "13px",
              padding: "10px 14px",
              boxShadow:
                "var(--shadow-lg), inset 0 1px 0 color-mix(in srgb, var(--color-b3) 30%, transparent)",
            },
            classNames: {
              success: "!border-l-4 !border-l-[var(--color-brand)]",
              error: "!border-l-4 !border-l-[var(--color-danger)]",
              warning: "!border-l-4 !border-l-[var(--color-warn)]",
              info: "!border-l-4 !border-l-[var(--color-info)]",
            },
          }}
        />
      </body>
    </html>
  );
}
