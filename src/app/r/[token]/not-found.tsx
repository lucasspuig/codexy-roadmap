import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Link no disponible",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "var(--color-pub-bg)", color: "var(--color-pub-text)" }}
    >
      <div
        className="w-full max-w-md rounded-xl border p-8 text-center"
        style={{
          background: "var(--color-pub-surface)",
          borderColor: "var(--color-pub-border)",
          boxShadow: "0 4px 24px rgba(0,0,0,.04)",
        }}
      >
        <div
          className="mx-auto mb-5 flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ background: "var(--color-pub-accent)" }}
          aria-hidden
        >
          <svg viewBox="0 0 16 16" width={18} height={18} style={{ fill: "#fff" }}>
            <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" />
          </svg>
        </div>
        <h1
          className="mb-2 text-2xl"
          style={{
            fontFamily: "var(--font-serif)",
            color: "var(--color-pub-text)",
            letterSpacing: "-0.01em",
          }}
        >
          Link no disponible
        </h1>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--color-pub-text2)" }}
        >
          Este enlace puede haber expirado o ya no estar activo. Si pensás que es un error,
          contactanos para que te compartamos uno nuevo.
        </p>
        <p
          className="mt-6 text-xs"
          style={{ color: "var(--color-pub-text3)" }}
        >
          Codexy · Sistemas inteligentes para clínicas
        </p>
      </div>
    </div>
  );
}
