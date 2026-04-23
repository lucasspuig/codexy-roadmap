"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Hourglass, Printer, Circle, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { cn, formatDate, relativeTime } from "@/lib/utils";
import type { FaseEstado } from "@/types/database";

import type { PublicPayload } from "@/app/api/public/[token]/route";

const POLL_INTERVAL_MS = 8_000;

const STATUS_LABEL: Record<FaseEstado, string> = {
  done: "Completado",
  active: "En curso",
  pending: "Pendiente",
};

type Props = {
  token: string;
  initial: PublicPayload;
};

export function Timeline({ token, initial }: Props) {
  const [data, setData] = useState<PublicPayload>(initial);
  const [now, setNow] = useState<number>(() => Date.now());
  const [offline, setOffline] = useState(false);
  const failureCountRef = useRef(0);
  const prevDoneIdsRef = useRef<Set<string>>(
    new Set(initial.fases.filter((f) => f.estado === "done").map((f) => f.id)),
  );

  const poll = useCallback(
    async (signal: AbortSignal): Promise<boolean> => {
      try {
        const res = await fetch(`/api/public/${encodeURIComponent(token)}`, {
          cache: "no-store",
          signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          // 404 / 429 / 500 — no spameamos toasts; contamos para fallback offline.
          failureCountRef.current += 1;
          if (failureCountRef.current >= 2) setOffline(true);
          return false;
        }
        const next = (await res.json()) as PublicPayload;
        failureCountRef.current = 0;
        setOffline(false);
        setData((prev) => (shallowEqualPayload(prev, next) ? prev : next));

        // Detectar fases recién completadas y celebrarlas.
        const nextDone = new Set(
          next.fases.filter((f) => f.estado === "done").map((f) => f.id),
        );
        const prevDone = prevDoneIdsRef.current;
        const justCompleted = next.fases.filter(
          (f) => nextDone.has(f.id) && !prevDone.has(f.id),
        );
        if (justCompleted.length > 0) {
          for (const f of justCompleted) {
            toast.success(`Fase completada: ${f.titulo}`, {
              description: `¡Avanzamos un paso más en tu implementación!`,
              duration: 6_000,
            });
          }
        }
        prevDoneIdsRef.current = nextDone;
        return true;
      } catch (err) {
        if ((err as Error).name === "AbortError") return false;
        failureCountRef.current += 1;
        if (failureCountRef.current >= 2) setOffline(true);
        return false;
      }
    },
    [token],
  );

  // Loop de polling con backoff suave en errores consecutivos.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const tick = async () => {
      if (stopped) return;
      // Pausamos si la pestaña está oculta — ahorra requests y batería.
      if (document.visibilityState !== "visible") {
        timer = setTimeout(tick, 2_000);
        return;
      }
      await poll(controller.signal);
      if (stopped) return;
      const backoff =
        failureCountRef.current > 0
          ? Math.min(POLL_INTERVAL_MS * 2 ** (failureCountRef.current - 1), 60_000)
          : POLL_INTERVAL_MS;
      timer = setTimeout(tick, backoff);
    };

    timer = setTimeout(tick, POLL_INTERVAL_MS);

    const onFocus = () => {
      // Al volver al tab, refrescamos inmediatamente.
      if (timer) clearTimeout(timer);
      tick();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [poll]);

  // Tick cada 30s para refrescar los "hace X min" sin requests extra.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { fases, eventos, proyecto, cliente, ultima_actualizacion } = data;

  const summary = useMemo(() => {
    const total = fases.length;
    const done = fases.filter((f) => f.estado === "done").length;
    const active = fases.find((f) => f.estado === "active");
    const pct = total === 0 ? 0 : Math.round(((done + (active ? 0.5 : 0)) / total) * 100);
    return {
      total,
      done,
      active,
      pct,
      activeIndex: active ? fases.findIndex((f) => f.id === active.id) + 1 : null,
    };
  }, [fases]);

  const onPrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  // `now` se usa implícitamente en relativeTime; forzamos re-render al tick.
  void now;

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-20 pt-8 sm:px-6 sm:pt-14">
      {/* Hero */}
      <header className="mb-10 sm:mb-12">
        <div className="mb-5 flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: "var(--color-pub-accent)" }}
            aria-hidden
          >
            <svg viewBox="0 0 16 16" width={13} height={13} style={{ fill: "#fff" }}>
              <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" />
            </svg>
          </div>
          <span
            className="text-[13px] font-medium"
            style={{ color: "var(--color-pub-text2)", letterSpacing: "0.03em" }}
          >
            Codexy
          </span>
          <span style={{ color: "var(--color-pub-border)" }} aria-hidden>
            ·
          </span>
          <span
            className="truncate text-[13px] font-medium"
            style={{ color: "var(--color-pub-text3)" }}
          >
            {cliente.nombre}
            {cliente.empresa ? ` — ${cliente.empresa}` : ""}
          </span>
        </div>

        <h1
          className="mb-3.5 font-normal leading-[1.15]"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "clamp(30px, 5.5vw, 44px)",
            color: "var(--color-pub-text)",
            letterSpacing: "-0.01em",
          }}
        >
          {proyecto.nombre || "Plan de implementación"}
        </h1>
        <p
          className="max-w-[540px] text-[15px] leading-[1.65]"
          style={{ color: "var(--color-pub-text2)" }}
        >
          {proyecto.subtitulo ||
            "Seguimiento de las fases de puesta en marcha de tu plataforma."}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Chip>
            <span
              className="inline-block h-1.5 w-1.5 rounded-full animate-pulse-soft"
              style={{ background: "var(--color-pub-accent-m)" }}
              aria-hidden
            />
            <span>Actualizado {relativeTime(ultima_actualizacion)}</span>
          </Chip>
          <Chip>
            {summary.activeIndex
              ? `Fase actual: ${summary.activeIndex} de ${summary.total}`
              : summary.done === summary.total && summary.total > 0
                ? "Todas las fases completadas"
                : `${summary.done}/${summary.total} completadas`}
          </Chip>
          {proyecto.fecha_estimada_fin ? (
            <Chip>Entrega estimada: {formatDate(proyecto.fecha_estimada_fin)}</Chip>
          ) : null}
          <button
            type="button"
            onClick={onPrint}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-[5px] text-xs transition hover:brightness-[1.03] print:hidden"
            style={{
              background: "var(--color-pub-surface)",
              borderColor: "var(--color-pub-border)",
              color: "var(--color-pub-text2)",
            }}
            aria-label="Descargar o imprimir"
          >
            <Printer size={13} aria-hidden />
            <span>PDF</span>
          </button>
        </div>

        {offline ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs print:hidden"
            style={{
              background: "var(--color-pub-surface)",
              borderColor: "var(--color-pub-border)",
              color: "var(--color-pub-text2)",
            }}
          >
            <WifiOff size={13} aria-hidden />
            <span>Reintentando conexión...</span>
          </div>
        ) : null}
      </header>

      {/* Progress bar */}
      <section
        className="mb-9 flex items-center gap-5 rounded-xl border px-6 py-5"
        style={{
          background: "var(--color-pub-surface)",
          borderColor: "var(--color-pub-border)",
        }}
        aria-label="Progreso general del proyecto"
      >
        <span
          className="whitespace-nowrap text-[13px]"
          style={{ color: "var(--color-pub-text2)" }}
        >
          Progreso general
        </span>
        <div
          className="relative flex-1 overflow-hidden rounded-full"
          style={{ background: "var(--color-pub-border)", height: 5 }}
        >
          <div
            className="h-full rounded-full"
            style={{
              background: "var(--color-pub-accent)",
              width: `${summary.pct}%`,
              transition: "width 1.2s cubic-bezier(.22,1,.36,1)",
            }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={summary.pct}
          />
        </div>
        <span
          className="min-w-[42px] text-right text-base font-medium tabular-nums"
          style={{ color: "var(--color-pub-accent)" }}
        >
          {summary.pct}%
        </span>
      </section>

      {/* Timeline */}
      <section className="relative" aria-label="Línea de tiempo del proyecto">
        <div
          aria-hidden
          className="pointer-events-none absolute top-6 bottom-6 w-[1.5px] rounded-sm"
          style={{
            left: 20,
            background:
              "linear-gradient(to bottom, var(--color-pub-accent-m), var(--color-pub-border) 50%)",
          }}
        />
        {fases.length === 0 ? (
          <EmptyState />
        ) : (
          fases.map((fase, idx) => (
            <PhaseCard
              key={fase.id}
              fase={fase}
              index={idx}
              totalPhases={fases.length}
            />
          ))
        )}
      </section>

      {/* Eventos recientes (si hay) */}
      {eventos.length > 0 ? (
        <section
          className="mt-10 rounded-xl border p-5"
          style={{
            background: "var(--color-pub-surface)",
            borderColor: "var(--color-pub-border)",
          }}
        >
          <h2
            className="mb-4 text-[11px] font-medium uppercase tracking-[0.08em]"
            style={{ color: "var(--color-pub-text3)" }}
          >
            Últimas novedades
          </h2>
          <ol className="space-y-3">
            {eventos.slice(0, 6).map((ev) => (
              <li key={ev.id} className="flex items-start gap-3 text-[13px]">
                <span
                  className="mt-[6px] h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ background: "var(--color-pub-accent-m)" }}
                  aria-hidden
                />
                <div>
                  <p style={{ color: "var(--color-pub-text)" }}>
                    {ev.mensaje || labelFromTipo(ev.tipo)}
                  </p>
                  <p
                    className="mt-0.5 text-[11.5px]"
                    style={{ color: "var(--color-pub-text3)" }}
                  >
                    {relativeTime(ev.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Footer */}
      <footer
        className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t pt-6"
        style={{ borderColor: "var(--color-pub-border)" }}
      >
        <p className="text-xs" style={{ color: "var(--color-pub-text3)" }}>
          <strong
            className="font-medium"
            style={{ color: "var(--color-pub-text2)" }}
          >
            Codexy
          </strong>{" "}
          · Sistemas inteligentes para clínicas
        </p>
        <p className="text-xs" style={{ color: "var(--color-pub-text3)" }}>
          Documento de seguimiento · Confidencial
        </p>
      </footer>
    </div>
  );
}

/* ───────────── Subcomponentes ───────────── */

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-[5px] text-xs"
      style={{
        background: "var(--color-pub-surface)",
        borderColor: "var(--color-pub-border)",
        color: "var(--color-pub-text3)",
      }}
    >
      {children}
    </span>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-xl border px-6 py-12 text-center text-sm"
      style={{
        background: "var(--color-pub-surface)",
        borderColor: "var(--color-pub-border)",
        color: "var(--color-pub-text2)",
      }}
    >
      Todavía no hay fases cargadas. Pronto verás aquí el plan detallado.
    </div>
  );
}

type PhaseCardProps = {
  fase: PublicPayload["fases"][number];
  index: number;
  totalPhases: number;
};

function PhaseCard({ fase, index }: PhaseCardProps) {
  const estado = fase.estado;
  const indicatorStyles: Record<FaseEstado, React.CSSProperties> = {
    done: {
      background: "var(--color-pub-accent-l)",
      border: "1.5px solid var(--color-pub-accent-m)",
      color: "var(--color-pub-accent)",
      fontWeight: 500,
    },
    active: {
      background: "var(--color-pub-info-l)",
      border: "1.5px solid var(--color-pub-info)",
      color: "var(--color-pub-info)",
      boxShadow: "0 0 0 5px rgba(29,95,166,.07)",
    },
    pending: {
      background: "var(--color-pub-surface)",
      border: "1.5px solid var(--color-pub-border)",
      color: "var(--color-pub-text3)",
    },
  };

  const cardStyle: React.CSSProperties = {
    background: "var(--color-pub-surface)",
    borderColor:
      estado === "active" ? "rgba(29,95,166,.3)" : "var(--color-pub-border)",
    boxShadow:
      estado === "active"
        ? "0 0 0 3px rgba(29,95,166,.05), 0 4px 16px rgba(0,0,0,.04)"
        : undefined,
  };

  const animationDelay = `${80 + index * 80}ms`;

  return (
    <article
      className="relative mb-3.5 flex gap-5 animate-fade-in"
      style={{
        animationDelay,
        opacity: 0,
      }}
    >
      <div
        className="relative z-10 mt-[3px] flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[15px]"
        style={indicatorStyles[estado]}
        aria-hidden
      >
        <PhaseIndicator fase={fase} />
      </div>
      <div
        className={cn(
          "flex-1 rounded-xl border px-6 py-5 transition",
          estado === "done" && "opacity-[0.78]",
        )}
        style={cardStyle}
      >
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span
            className="text-[11px] font-medium uppercase tracking-[0.06em]"
            style={{ color: "var(--color-pub-text3)" }}
          >
            Fase {fase.orden}
            {estado === "active" ? " · En curso" : ""}
          </span>
          <PublicBadge estado={estado} />
        </div>
        <h2
          className="mb-2 font-normal leading-[1.3]"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 19,
            color: "var(--color-pub-text)",
            letterSpacing: "-0.005em",
          }}
        >
          {fase.titulo}
        </h2>
        <p
          className="text-[13.5px] leading-[1.65]"
          style={{ color: "var(--color-pub-text2)" }}
        >
          {fase.descripcion}
        </p>
        {fase.items.length > 0 ? (
          <ul
            className="mt-4 space-y-2 border-t pt-4"
            style={{ borderColor: "var(--color-pub-border)" }}
          >
            {fase.items.map((item) => (
              <ItemRow key={item.id} item={item} phaseEstado={estado} />
            ))}
          </ul>
        ) : null}
        {estado === "done" && fase.completada_at ? (
          <p
            className="mt-3 text-[11.5px]"
            style={{ color: "var(--color-pub-text3)" }}
          >
            Completada el {formatDate(fase.completada_at)}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function PhaseIndicator({ fase }: { fase: PublicPayload["fases"][number] }) {
  if (fase.estado === "done") return <Check size={15} strokeWidth={2.5} aria-hidden />;
  if (fase.estado === "active") {
    // Usamos el ícono definido en la fase (emoji o texto corto) si existe.
    if (fase.icono) return <span>{fase.icono}</span>;
    return <Hourglass size={15} strokeWidth={2} aria-hidden />;
  }
  return (
    <span className="text-[13px] font-medium tabular-nums">{fase.orden}</span>
  );
}

function PublicBadge({ estado }: { estado: FaseEstado }) {
  const styles: Record<FaseEstado, React.CSSProperties> = {
    done: {
      background: "var(--color-pub-accent-l)",
      color: "var(--color-pub-accent)",
    },
    active: {
      background: "var(--color-pub-info-l)",
      color: "var(--color-pub-info)",
    },
    pending: {
      background: "var(--color-pub-bg)",
      color: "var(--color-pub-text3)",
      border: "0.5px solid var(--color-pub-border)",
    },
  };
  const dotColor: Record<FaseEstado, string> = {
    done: "var(--color-pub-accent-m)",
    active: "var(--color-pub-info)",
    pending: "var(--color-pub-text3)",
  };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-medium"
      style={styles[estado]}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: dotColor[estado] }}
        aria-hidden
      />
      {STATUS_LABEL[estado]}
    </span>
  );
}

function ItemRow({
  item,
  phaseEstado,
}: {
  item: PublicPayload["fases"][number]["items"][number];
  phaseEstado: FaseEstado;
}) {
  const done = item.completado;
  const icon = done ? (
    <Check size={12} strokeWidth={2.5} aria-hidden />
  ) : phaseEstado === "active" ? (
    <Hourglass size={12} strokeWidth={1.75} aria-hidden />
  ) : (
    <Circle size={10} strokeWidth={1.5} aria-hidden />
  );
  return (
    <li
      className="flex items-start gap-2.5 text-[13px] leading-[1.5]"
      style={{
        color: done ? "var(--color-pub-text3)" : "var(--color-pub-text2)",
        textDecoration: done ? "line-through" : undefined,
        textDecorationColor: done ? "var(--color-pub-border)" : undefined,
      }}
    >
      <span
        className="mt-[3px] flex-shrink-0"
        style={{ opacity: done ? 0.65 : 0.7 }}
      >
        {icon}
      </span>
      <span>{item.texto}</span>
    </li>
  );
}

/* ───────────── Helpers ───────────── */

function labelFromTipo(tipo: string): string {
  switch (tipo) {
    case "fase_completada":
      return "Fase completada";
    case "fase_iniciada":
      return "Nueva fase iniciada";
    case "item_completado":
      return "Tarea completada";
    case "proyecto_actualizado":
      return "Proyecto actualizado";
    default:
      return tipo.replace(/_/g, " ");
  }
}

/** Comparación superficial del payload para evitar re-renders innecesarios. */
function shallowEqualPayload(a: PublicPayload, b: PublicPayload): boolean {
  if (a.ultima_actualizacion !== b.ultima_actualizacion) return false;
  if (a.fases.length !== b.fases.length) return false;
  if (a.eventos.length !== b.eventos.length) return false;
  for (let i = 0; i < a.fases.length; i++) {
    const fa = a.fases[i]!;
    const fb = b.fases[i]!;
    if (
      fa.id !== fb.id ||
      fa.estado !== fb.estado ||
      fa.updated_at !== fb.updated_at ||
      fa.items.length !== fb.items.length
    ) {
      return false;
    }
    for (let j = 0; j < fa.items.length; j++) {
      const ia = fa.items[j]!;
      const ib = fb.items[j]!;
      if (
        ia.id !== ib.id ||
        ia.completado !== ib.completado ||
        ia.completado_at !== ib.completado_at ||
        ia.texto !== ib.texto
      ) {
        return false;
      }
    }
  }
  for (let i = 0; i < a.eventos.length; i++) {
    if (a.eventos[i]!.id !== b.eventos[i]!.id) return false;
  }
  return true;
}
