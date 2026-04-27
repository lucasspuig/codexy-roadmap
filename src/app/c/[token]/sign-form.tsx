"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { firmarContratoCliente } from "@/app/(admin)/contratos/actions";

export interface ContratoSignClientProps {
  token: string;
  isSigned: boolean;
  contractoNumero: string;
  fechaFirma: string | null;
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 200;
const STROKE_COLOR = "#0a0a0a";
const STROKE_WIDTH = 2.5;

export function ContratoSignClient({
  token,
  isSigned,
  contractoNumero,
  fechaFirma,
}: ContratoSignClientProps) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // Init canvas con fondo blanco + escala HiDPI
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = CANVAS_WIDTH * ratio;
    canvas.height = CANVAS_HEIGHT * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = STROKE_WIDTH;
  }, []);

  useEffect(() => {
    if (isSigned) return;
    setupCanvas();
  }, [isSigned, setupCanvas]);

  function getPos(
    canvas: HTMLCanvasElement,
    e: ReactPointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * CANVAS_WIDTH) / rect.width,
      y: ((e.clientY - rect.top) * CANVAS_HEIGHT) / rect.height,
    };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = getPos(canvas, e);
    lastPointRef.current = p;
    // Marca un punto inicial (útil para puntitos cortos)
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, STROKE_WIDTH / 2, 0, Math.PI * 2);
    ctx.fillStyle = STROKE_COLOR;
    ctx.fill();
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = getPos(canvas, e);
    const last = lastPointRef.current;
    if (!last) {
      lastPointRef.current = p;
      return;
    }
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
    if (!hasInk) setHasInk(true);
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  function handleClear() {
    setupCanvas();
    setHasInk(false);
  }

  async function handleSubmit() {
    if (!hasInk) {
      toast.error("Firmá en el recuadro antes de enviar");
      return;
    }
    if (!accepted) {
      toast.error("Confirmá la aceptación de los términos");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSubmitting(true);
    try {
      // Generamos un data URL en lugar de subir un archivo: el RPC del
      // server (sign_contrato_publico) guarda la firma inline en el
      // contrato. Esto evita la dependencia con storage/service_role.
      const dataUrl = canvas.toDataURL("image/png");
      if (!dataUrl || !dataUrl.startsWith("data:image/")) {
        toast.error("No se pudo generar la imagen de la firma");
        setSubmitting(false);
        return;
      }
      const res = await firmarContratoCliente({
        token,
        firma_data_url: dataUrl,
        ua: typeof navigator !== "undefined" ? navigator.userAgent : null,
      });
      if (!res.ok) {
        toast.error(res.error);
        setSubmitting(false);
        return;
      }
      toast.success("Contrato firmado");
      // Refresh server component → muestra "ya firmado"
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al firmar");
      setSubmitting(false);
    }
  }

  // ─── Estado: ya firmado ─────────────────────────────────
  if (isSigned) {
    return (
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "14px 16px 18px",
          background:
            "linear-gradient(0deg, var(--color-pub-bg) 0%, color-mix(in srgb, var(--color-pub-bg) 92%, transparent) 100%)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderTop: "1px solid var(--color-pub-border)",
          zIndex: 40,
        }}
      >
        <div
          className="max-w-3xl mx-auto"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "rgba(34,197,94,0.18)",
                border: "1px solid rgba(34,197,94,0.45)",
                color: "#86efac",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Check size={14} />
            </span>
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--color-pub-text)",
                }}
              >
                Contrato firmado
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--color-pub-text3)",
                }}
              >
                {contractoNumero} · {formatNiceDate(fechaFirma)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 999,
              background: "var(--color-pub-accent-m)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Download size={14} />
            Descargar PDF
          </button>
        </div>
      </div>
    );
  }

  // ─── Estado: a firmar ───────────────────────────────────
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        background:
          "linear-gradient(0deg, var(--color-pub-bg) 6%, color-mix(in srgb, var(--color-pub-bg) 92%, transparent) 100%)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid var(--color-pub-border)",
      }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--color-pub-text3)",
              fontWeight: 600,
            }}
          >
            Tu firma
          </span>
          <button
            type="button"
            onClick={handleClear}
            disabled={!hasInk || submitting}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11.5,
              color: "var(--color-pub-text3)",
              background: "transparent",
              border: "none",
              cursor: hasInk ? "pointer" : "default",
              opacity: hasInk ? 1 : 0.5,
            }}
          >
            <RotateCcw size={11} />
            Limpiar
          </button>
        </div>
        <div
          style={{
            position: "relative",
            background: "#ffffff",
            borderRadius: 10,
            border: "1px solid var(--color-pub-border-strong)",
            overflow: "hidden",
            boxShadow: "0 12px 30px -12px rgba(0,0,0,0.45)",
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
            style={{
              width: "100%",
              height: 130,
              display: "block",
              touchAction: "none",
              cursor: "crosshair",
            }}
            aria-label="Firmá con el mouse o el dedo"
          />
          {!hasInk ? (
            <span
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                color: "#a1a1aa",
                fontSize: 12.5,
                letterSpacing: "0.04em",
              }}
            >
              Firmá aquí con el mouse o el dedo
            </span>
          ) : null}
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: 12,
            color: "var(--color-pub-text2)",
            cursor: "pointer",
            marginTop: 10,
          }}
        >
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            Declaro haber leído y aceptado los términos y condiciones del
            contrato {contractoNumero}.
          </span>
        </label>

        <div className="flex items-center justify-end mt-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!hasInk || !accepted || submitting}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 20px",
              fontSize: 13.5,
              fontWeight: 600,
              borderRadius: 10,
              background:
                !hasInk || !accepted || submitting
                  ? "rgba(139,92,246,0.35)"
                  : "var(--color-pub-info)",
              color: "#fff",
              border: "none",
              cursor:
                !hasInk || !accepted || submitting ? "not-allowed" : "pointer",
              boxShadow:
                !hasInk || !accepted || submitting
                  ? "none"
                  : "0 12px 30px -8px rgba(124,58,237,0.55)",
              transition: "all 150ms ease",
            }}
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Firmando…
              </>
            ) : (
              <>
                <Check size={14} />
                Firmar contrato
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatNiceDate(input: string | null): string {
  if (!input) return "—";
  const d = new Date(input);
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
