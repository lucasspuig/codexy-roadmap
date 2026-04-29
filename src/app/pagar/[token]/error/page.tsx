import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pago no completado · Codexy",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function PagoErrorPage({ params }: PageProps) {
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
          background: "rgba(248,113,113,0.08)",
          border: "1px solid rgba(248,113,113,0.30)",
        }}
      >
        <div
          style={{
            fontSize: 48,
            color: "#fca5a5",
            marginBottom: 8,
            lineHeight: 1,
          }}
          aria-hidden
        >
          !
        </div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            margin: "8px 0",
          }}
        >
          El pago no se completó
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--color-pub-text2, #d4d4d8)",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Podés volver atrás e intentarlo de nuevo, o pagarnos por
          transferencia. Cualquier duda, escribinos por WhatsApp.
        </p>
        <div style={{ marginTop: 22 }}>
          <Link
            href={`/pagar/${token}`}
            style={{
              display: "inline-block",
              padding: "10px 18px",
              borderRadius: 9,
              background: "#009ee3",
              border: "none",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Volver e intentar de nuevo
          </Link>
        </div>
      </div>
    </div>
  );
}
