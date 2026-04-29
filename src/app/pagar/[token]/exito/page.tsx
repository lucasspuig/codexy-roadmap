import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pago confirmado · Codexy",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function PagoExitoPage({ params }: PageProps) {
  const { token } = await params;
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-pub-bg, #0a0a0a)",
        color: "var(--color-pub-text, #fafafa)",
        padding: 16,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          textAlign: "center",
          padding: 32,
          borderRadius: 16,
          background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.30)",
        }}
      >
        <div
          style={{
            fontSize: 48,
            color: "#86efac",
            marginBottom: 8,
            lineHeight: 1,
          }}
          aria-hidden
        >
          ✓
        </div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            margin: "8px 0",
          }}
        >
          ¡Pago recibido!
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--color-pub-text2, #d4d4d8)",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Estamos confirmando el pago con MercadoPago. Te llega un mensaje por
          WhatsApp en cuanto se acredita.
        </p>
        <div style={{ marginTop: 22 }}>
          <Link
            href={`/pagar/${token}`}
            style={{
              display: "inline-block",
              padding: "10px 18px",
              borderRadius: 9,
              background: "transparent",
              border: "1px solid var(--color-pub-border-strong, #3f3f46)",
              color: "var(--color-pub-text, #fafafa)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Volver al detalle
          </Link>
        </div>
      </div>
    </div>
  );
}
