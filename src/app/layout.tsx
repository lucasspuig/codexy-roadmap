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
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "var(--color-s2)",
              border: "1px solid var(--color-b1)",
              color: "var(--color-t1)",
            },
          }}
        />
      </body>
    </html>
  );
}
