"use client";

import { useState, useTransition } from "react";
import {
  Banknote,
  CheckCircle2,
  ChevronDown,
  Copy,
  CreditCard,
  Loader2,
} from "lucide-react";

import { crearPreferenciaPago } from "@/app/pagar/actions";
import type {
  PagoPublicoCuota,
  PagoPublicoPayload,
} from "@/app/pagar/types";
import { formatFechaCorta, formatUSD } from "@/lib/cuotas";

export interface PagarClientProps {
  token: string;
  payload: PagoPublicoPayload;
  initialError: string | null;
}

export function PagarClient({ token, payload, initialError }: PagarClientProps) {
  const cuotas = payload.cuotas ?? [];
  const cliente = payload.cliente_nombre ?? "Cliente";
  const pagoData = payload.pago_data ?? {
    banco: null,
    cbu_pesos: null,
    alias_pesos: null,
    cvu_usd: null,
    alias_usd: null,
    cuil: null,
    mercadopago_activo: false,
  };
  const mpActivo = pagoData.mercadopago_activo === true;

  return (
    <>
      <header style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "var(--color-pub-text3, #a1a1aa)",
            fontWeight: 600,
          }}
        >
          CODEXY
        </div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            margin: "8px 0 4px",
            color: "var(--color-pub-text, #fafafa)",
          }}
        >
          Hola {cliente.split(" ")[0]}, gracias por confiar en Codexy.
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--color-pub-text2, #d4d4d8)",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {cuotas.length === 0
            ? "Tu cuenta está al día. ¡Gracias!"
            : cuotas.length === 1
              ? "Tenés una cuota pendiente. Podés pagarla por transferencia o con MercadoPago."
              : `Tenés ${cuotas.length} cuotas pendientes. Podés pagarlas por transferencia o con MercadoPago.`}
        </p>
      </header>

      {initialError ? (
        <div
          style={{
            background: "rgba(248,113,113,0.12)",
            border: "1px solid rgba(248,113,113,0.35)",
            color: "#fecaca",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {initialError}
        </div>
      ) : null}

      {cuotas.length === 0 ? (
        <div
          style={{
            background: "rgba(34,197,94,0.10)",
            border: "1px solid rgba(34,197,94,0.35)",
            color: "#86efac",
            borderRadius: 12,
            padding: 16,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <CheckCircle2 size={18} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            No tenés cuotas pendientes.
          </span>
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          {cuotas.map((c) => (
            <li key={c.id}>
              <CuotaCard
                cuota={c}
                token={token}
                pagoData={pagoData}
                mpActivo={mpActivo}
              />
            </li>
          ))}
        </ul>
      )}

      <footer
        style={{
          marginTop: 32,
          borderTop: "1px solid var(--color-pub-border, #27272a)",
          paddingTop: 16,
          fontSize: 11.5,
          color: "var(--color-pub-text3, #a1a1aa)",
        }}
      >
        Cualquier duda, escribinos por WhatsApp y respondemos a la brevedad.
      </footer>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card por cuota
// ─────────────────────────────────────────────────────────────────────────────

function CuotaCard({
  cuota,
  token,
  pagoData,
  mpActivo,
}: {
  cuota: PagoPublicoCuota;
  token: string;
  pagoData: PagoPublicoPayload["pago_data"];
  mpActivo: boolean;
}) {
  const [openTransfer, setOpenTransfer] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleMP() {
    setError(null);
    startTransition(async () => {
      const res = await crearPreferenciaPago({
        token,
        cuota_id: cuota.id,
        currencyMode: "ARS",
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.location.href = res.data.init_point;
    });
  }

  return (
    <div
      style={{
        background: "var(--color-pub-card, rgba(255,255,255,0.04))",
        border: "1px solid var(--color-pub-border, #27272a)",
        borderRadius: 14,
        padding: "18px 20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--color-pub-text3, #a1a1aa)",
              fontWeight: 600,
            }}
          >
            Cuota {cuota.periodo}
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: "var(--ff-mono)",
              color: "var(--color-pub-text, #fafafa)",
              marginTop: 2,
            }}
          >
            USD {formatUSD(cuota.monto_usd)}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--color-pub-text3, #a1a1aa)",
              marginTop: 2,
            }}
          >
            Vence {formatFechaCorta(cuota.fecha_vencimiento)}
          </div>
        </div>
      </div>

      {error ? (
        <div
          style={{
            background: "rgba(248,113,113,0.12)",
            border: "1px solid rgba(248,113,113,0.35)",
            color: "#fecaca",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12.5,
            marginTop: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 14,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => setOpenTransfer((s) => !s)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 9,
            background: "transparent",
            border: "1px solid var(--color-pub-border-strong, #3f3f46)",
            color: "var(--color-pub-text, #fafafa)",
            cursor: "pointer",
          }}
        >
          <Banknote size={14} />
          Datos de transferencia
          <ChevronDown
            size={13}
            style={{
              transition: "transform 150ms ease",
              transform: openTransfer ? "rotate(180deg)" : "none",
            }}
          />
        </button>

        {mpActivo ? (
          <button
            type="button"
            onClick={handleMP}
            disabled={pending}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 9,
              background: pending
                ? "rgba(0,158,228,0.45)"
                : "#009ee3",
              color: "#fff",
              border: "none",
              cursor: pending ? "wait" : "pointer",
              boxShadow: pending
                ? "none"
                : "0 8px 20px -8px rgba(0,158,228,0.5)",
            }}
          >
            {pending ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Generando link…
              </>
            ) : (
              <>
                <CreditCard size={14} />
                Pagar online (MercadoPago)
              </>
            )}
          </button>
        ) : null}
      </div>

      {openTransfer ? (
        <div
          style={{
            marginTop: 14,
            padding: "12px 14px",
            background: "var(--color-pub-card-2, rgba(255,255,255,0.025))",
            border: "1px solid var(--color-pub-border, #27272a)",
            borderRadius: 10,
            fontSize: 12.5,
            color: "var(--color-pub-text2, #d4d4d8)",
          }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            {pagoData.banco ? (
              <Field label="Banco" value={pagoData.banco} copy={false} />
            ) : null}
            {pagoData.cbu_pesos ? (
              <Field label="CBU (ARS)" value={pagoData.cbu_pesos} copy />
            ) : null}
            {pagoData.alias_pesos ? (
              <Field label="Alias (ARS)" value={pagoData.alias_pesos} copy />
            ) : null}
            {pagoData.cvu_usd ? (
              <Field label="CVU (USD)" value={pagoData.cvu_usd} copy />
            ) : null}
            {pagoData.alias_usd ? (
              <Field label="Alias (USD)" value={pagoData.alias_usd} copy />
            ) : null}
            {pagoData.cuil ? (
              <Field label="CUIL/CUIT" value={pagoData.cuil} copy />
            ) : null}
          </div>
          <p
            style={{
              marginTop: 12,
              marginBottom: 0,
              fontSize: 11.5,
              color: "var(--color-pub-text3, #a1a1aa)",
            }}
          >
            Una vez transferido, mandanos el comprobante por WhatsApp y lo
            registramos al instante.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  copy,
}: {
  label: string;
  value: string;
  copy: boolean;
}) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          fontSize: 10.5,
          textTransform: "uppercase",
          letterSpacing: "0.10em",
          color: "var(--color-pub-text3, #a1a1aa)",
          minWidth: 90,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--ff-mono)",
          fontSize: 13,
          color: "var(--color-pub-text, #fafafa)",
          flex: 1,
          minWidth: 0,
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
      {copy ? (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copiar ${label}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11.5,
            color: copied ? "#86efac" : "var(--color-pub-text3, #a1a1aa)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      ) : null}
    </div>
  );
}
