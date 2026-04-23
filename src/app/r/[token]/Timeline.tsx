"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle2,
  Circle,
  Hourglass,
  Printer,
  Sparkles,
  Target,
  WifiOff,
  Zap,
} from "lucide-react";
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
          failureCountRef.current += 1;
          if (failureCountRef.current >= 2) setOffline(true);
          return false;
        }
        const next = (await res.json()) as PublicPayload;
        failureCountRef.current = 0;
        setOffline(false);
        setData((prev) => (shallowEqualPayload(prev, next) ? prev : next));

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
              description: "¡Avanzamos un paso más en tu implementación!",
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

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const tick = async () => {
      if (stopped) return;
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
    const itemsTotal = fases.reduce((acc, f) => acc + f.items.length, 0);
    const itemsDone = fases.reduce(
      (acc, f) => acc + f.items.filter((i) => i.completado).length,
      0,
    );
    const daysSinceStart = proyecto.fecha_inicio
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(proyecto.fecha_inicio).getTime()) / 86_400_000,
          ),
        )
      : null;
    const daysToEnd = proyecto.fecha_estimada_fin
      ? Math.floor(
          (new Date(proyecto.fecha_estimada_fin).getTime() - Date.now()) / 86_400_000,
        )
      : null;
    return {
      total,
      done,
      active,
      pct,
      activeIndex: active ? fases.findIndex((f) => f.id === active.id) + 1 : null,
      itemsTotal,
      itemsDone,
      daysSinceStart,
      daysToEnd,
      isComplete: total > 0 && done === total,
    };
  }, [fases, proyecto.fecha_inicio, proyecto.fecha_estimada_fin]);

  const onPrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  void now;

  return (
    <div className="mx-auto w-full max-w-[760px] px-5 pb-24 pt-8 sm:px-7 sm:pt-14">
      {/* ─────────── Hero ─────────── */}
      <header className="mb-12 sm:mb-14">
        <div className="mb-6 flex items-center gap-2.5 animate-fade-in" style={{ opacity: 0 }}>
          {data.branding?.logo_url ? (
            <div
              className="flex h-9 items-center justify-center overflow-hidden rounded-lg bg-white px-2 py-1 shadow-sm"
              style={{ border: "1px solid var(--color-pub-border)" }}
              aria-hidden
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.branding.logo_url}
                alt={`Logo ${cliente.nombre}`}
                className="max-h-7 w-auto object-contain"
                loading="eager"
              />
            </div>
          ) : (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg shadow-sm"
              style={{ background: "var(--color-pub-accent)", color: "#fff" }}
              aria-hidden
            >
              <svg viewBox="0 0 100 100" width={15} height={15} fill="currentColor">
                <path d="M12 10 L28 10 Q32 10 35 14 L50 36 Q52 39 52 42 L52 58 Q52 61 50 64 L35 86 Q32 90 28 90 L12 90 Q8 90 10 86 L30 54 Q33 50 30 46 L10 14 Q8 10 12 10 Z" />
                <path d="M88 10 L72 10 Q68 10 65 14 L50 36 Q48 39 48 42 L48 58 Q48 61 50 64 L65 86 Q68 90 72 90 L88 90 Q92 90 90 86 L70 54 Q67 50 70 46 L90 14 Q92 10 88 10 Z" />
              </svg>
            </div>
          )}
          <div className="flex flex-col">
            <span
              className="text-[13px] font-semibold leading-tight"
              style={{ color: "var(--color-pub-text)" }}
            >
              {cliente.nombre}
            </span>
            <span
              className="text-[10.5px] font-medium leading-tight tracking-[0.04em]"
              style={{ color: "var(--color-pub-text3)" }}
            >
              {cliente.empresa ?? "Plan personalizado"}
            </span>
          </div>
          <span className="mx-2 h-4 w-px" style={{ background: "var(--color-pub-border)" }} aria-hidden />
          <span
            className="truncate text-[11.5px] font-medium uppercase tracking-[0.08em]"
            style={{ color: "var(--color-pub-text3)" }}
          >
            Powered by Codexy
          </span>
        </div>

        <div className="animate-fade-in" style={{ opacity: 0, animationDelay: "120ms" }}>
          <h1
            className="mb-4 font-normal"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "clamp(34px, 6vw, 52px)",
              color: "var(--color-pub-text)",
              letterSpacing: "-0.015em",
              lineHeight: 1.08,
            }}
          >
            {proyecto.nombre || "Plan de implementación"}
          </h1>
          <p
            className="max-w-[580px] text-[15.5px] leading-[1.7]"
            style={{ color: "var(--color-pub-text2)" }}
          >
            {proyecto.subtitulo ||
              "Seguimiento en tiempo real de las fases de puesta en marcha de tu plataforma con agente de inteligencia artificial."}
          </p>
        </div>

        <div
          className="mt-6 flex flex-wrap items-center gap-2 animate-fade-in"
          style={{ opacity: 0, animationDelay: "220ms" }}
        >
          <LiveChip label="En vivo" sublabel={relativeTime(ultima_actualizacion)} />
          {summary.activeIndex ? (
            <Chip icon={<Target size={12} aria-hidden />}>
              Fase {summary.activeIndex} de {summary.total}
            </Chip>
          ) : summary.isComplete ? (
            <Chip icon={<CheckCircle2 size={12} aria-hidden />} variant="success">
              Proyecto completado
            </Chip>
          ) : null}
          {proyecto.fecha_estimada_fin ? (
            <Chip icon={<Calendar size={12} aria-hidden />}>
              {summary.daysToEnd !== null && summary.daysToEnd > 0
                ? `${summary.daysToEnd} días restantes`
                : summary.daysToEnd !== null && summary.daysToEnd <= 0
                  ? "Finalizando"
                  : `Entrega ${formatDate(proyecto.fecha_estimada_fin)}`}
            </Chip>
          ) : null}
          <button
            type="button"
            onClick={onPrint}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-xs transition hover:brightness-[1.03] print:hidden"
            style={{
              background: "var(--color-pub-surface)",
              borderColor: "var(--color-pub-border)",
              color: "var(--color-pub-text2)",
            }}
            aria-label="Descargar o imprimir"
          >
            <Printer size={12} aria-hidden />
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
            <span>Reintentando conexión…</span>
          </div>
        ) : null}
      </header>

      {/* ─────────── Progress dashboard ─────────── */}
      <section
        className="mb-10 grid grid-cols-1 gap-3 animate-fade-in sm:grid-cols-[1fr_auto] sm:gap-4"
        style={{ opacity: 0, animationDelay: "320ms" }}
        aria-label="Resumen del proyecto"
      >
        <div
          className="relative overflow-hidden rounded-2xl border p-6 sm:p-7"
          style={{
            background:
              "linear-gradient(135deg, var(--color-pub-surface) 0%, var(--color-pub-accent-l) 140%)",
            borderColor: "var(--color-pub-border)",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p
                className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: "var(--color-pub-accent)" }}
              >
                Progreso general
              </p>
              <div className="flex items-baseline gap-2">
                <span
                  className="tabular-nums"
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: 44,
                    color: "var(--color-pub-text)",
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                  }}
                >
                  {summary.pct}
                </span>
                <span
                  className="text-xl font-medium"
                  style={{ color: "var(--color-pub-accent-m)" }}
                >
                  %
                </span>
              </div>
              <p
                className="mt-2 text-[12.5px] leading-snug"
                style={{ color: "var(--color-pub-text2)" }}
              >
                {summary.done} de {summary.total} fases completadas
                {summary.itemsTotal > 0 ? (
                  <>
                    {" · "}
                    {summary.itemsDone}/{summary.itemsTotal} tareas
                  </>
                ) : null}
              </p>
            </div>
            <ProgressRing pct={summary.pct} />
          </div>
          <div
            className="mt-5 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "rgba(26, 107, 74, 0.12)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, var(--color-pub-accent-m), var(--color-pub-accent))",
                width: `${summary.pct}%`,
                transition: "width 1.6s cubic-bezier(.22,1,.36,1)",
              }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={summary.pct}
            />
          </div>
        </div>

        {(summary.daysSinceStart !== null || proyecto.fecha_estimada_fin) && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-1 sm:gap-3">
            {summary.daysSinceStart !== null ? (
              <MiniStat
                label="Días activos"
                value={summary.daysSinceStart.toString()}
                hint="desde el arranque"
              />
            ) : null}
            {summary.daysToEnd !== null ? (
              <MiniStat
                label={summary.daysToEnd >= 0 ? "Días restantes" : "Pasado ETA"}
                value={Math.abs(summary.daysToEnd).toString()}
                hint={
                  summary.daysToEnd >= 0
                    ? "hasta la entrega estimada"
                    : "de la fecha estimada"
                }
                tone={summary.daysToEnd < 0 ? "warn" : "neutral"}
              />
            ) : null}
          </div>
        )}
      </section>

      {/* ─────────── Active phase spotlight ─────────── */}
      {summary.active ? (
        <section
          className="mb-10 animate-fade-in"
          style={{ opacity: 0, animationDelay: "420ms" }}
          aria-label="Fase actual"
        >
          <ActiveSpotlight fase={summary.active} index={summary.activeIndex ?? 0} />
        </section>
      ) : null}

      {/* ─────────── Timeline ─────────── */}
      <section className="relative" aria-label="Línea de tiempo del proyecto">
        <div className="mb-5 flex items-center gap-2">
          <h2
            className="text-[13px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--color-pub-text3)" }}
          >
            Hoja de ruta
          </h2>
          <span
            className="h-px flex-1"
            style={{ background: "var(--color-pub-border)" }}
            aria-hidden
          />
        </div>
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute w-[2px] rounded-sm"
            style={{
              left: 21,
              top: 24,
              bottom: 24,
              background:
                "linear-gradient(to bottom, var(--color-pub-accent-m) 0%, var(--color-pub-accent) 20%, var(--color-pub-border) 65%)",
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
                isLast={idx === fases.length - 1}
              />
            ))
          )}
        </div>
      </section>

      {/* ─────────── Events feed ─────────── */}
      {eventos.length > 0 ? (
        <section
          className="mt-14 animate-fade-in"
          style={{ opacity: 0, animationDelay: "600ms" }}
        >
          <div className="mb-5 flex items-center gap-2">
            <h2
              className="text-[13px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: "var(--color-pub-text3)" }}
            >
              Últimas novedades
            </h2>
            <span
              className="h-px flex-1"
              style={{ background: "var(--color-pub-border)" }}
              aria-hidden
            />
          </div>
          <ol
            className="divide-y rounded-2xl border"
            style={{
              background: "var(--color-pub-surface)",
              borderColor: "var(--color-pub-border)",
              borderTopColor: "var(--color-pub-border)",
            }}
          >
            {eventos.slice(0, 8).map((ev) => (
              <EventRow key={ev.id} ev={ev} />
            ))}
          </ol>
        </section>
      ) : null}

      {/* ─────────── Footer ─────────── */}
      <footer
        className="mt-16 animate-fade-in"
        style={{ opacity: 0, animationDelay: "700ms" }}
      >
        <div
          className="rounded-2xl border p-6 sm:p-7"
          style={{
            background: "var(--color-pub-surface)",
            borderColor: "var(--color-pub-border)",
          }}
        >
          <div className="flex items-start gap-4">
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
              style={{ background: "var(--color-pub-accent)" }}
              aria-hidden
            >
              <Sparkles size={18} style={{ color: "#fff" }} aria-hidden />
            </div>
            <div className="flex-1">
              <p
                className="mb-1.5"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 18,
                  color: "var(--color-pub-text)",
                  letterSpacing: "-0.005em",
                }}
              >
                Tu proyecto es prioridad para nosotros
              </p>
              <p
                className="text-[13px] leading-[1.65]"
                style={{ color: "var(--color-pub-text2)" }}
              >
                Este documento se actualiza automáticamente a medida que avanzamos.
                Ante cualquier consulta, estamos disponibles para acompañarte en
                cada paso de la implementación.
              </p>
              <a
                href="mailto:contact@codexyoficial.com"
                className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium transition hover:underline"
                style={{ color: "var(--color-pub-accent)" }}
              >
                contact@codexyoficial.com
                <ArrowUpRight size={13} aria-hidden />
              </a>
            </div>
          </div>
        </div>
        <div
          className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[11.5px]"
          style={{ color: "var(--color-pub-text3)" }}
        >
          <p>
            <span
              className="font-medium"
              style={{ color: "var(--color-pub-text2)" }}
            >
              Codexy
            </span>{" "}
            · Documento de seguimiento
          </p>
          <p>Confidencial · Uso exclusivo del cliente</p>
        </div>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Subcomponentes
   ═══════════════════════════════════════════════ */

function LiveChip({ label, sublabel }: { label: string; sublabel: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-[6px] text-xs"
      style={{
        background: "var(--color-pub-surface)",
        borderColor: "var(--color-pub-border)",
        color: "var(--color-pub-text2)",
      }}
    >
      <span className="relative flex h-2 w-2 items-center justify-center">
        <span
          className="absolute h-2 w-2 rounded-full animate-pulse-soft"
          style={{ background: "var(--color-pub-accent-m)" }}
          aria-hidden
        />
        <span
          className="relative h-2 w-2 rounded-full"
          style={{ background: "var(--color-pub-accent)" }}
          aria-hidden
        />
      </span>
      <span className="font-medium" style={{ color: "var(--color-pub-accent)" }}>
        {label}
      </span>
      <span style={{ color: "var(--color-pub-border)" }} aria-hidden>·</span>
      <span style={{ color: "var(--color-pub-text3)" }}>{sublabel}</span>
    </span>
  );
}

function Chip({
  children,
  icon,
  variant = "neutral",
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  variant?: "neutral" | "success";
}) {
  const styles: React.CSSProperties =
    variant === "success"
      ? {
          background: "var(--color-pub-accent-l)",
          borderColor: "var(--color-pub-accent-m)",
          color: "var(--color-pub-accent)",
        }
      : {
          background: "var(--color-pub-surface)",
          borderColor: "var(--color-pub-border)",
          color: "var(--color-pub-text2)",
        };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-xs font-medium"
      style={styles}
    >
      {icon}
      {children}
    </span>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const size = 64;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--color-pub-border)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--color-pub-accent)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(.22,1,.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {pct === 100 ? (
          <CheckCircle2
            size={22}
            style={{ color: "var(--color-pub-accent)" }}
            strokeWidth={2}
            aria-hidden
          />
        ) : (
          <Zap size={20} style={{ color: "var(--color-pub-accent-m)" }} strokeWidth={2} aria-hidden />
        )}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "warn";
}) {
  const valueColor =
    tone === "warn" ? "#b45309" : "var(--color-pub-text)";
  return (
    <div
      className="rounded-2xl border p-4 sm:min-w-[150px]"
      style={{
        background: "var(--color-pub-surface)",
        borderColor: "var(--color-pub-border)",
      }}
    >
      <p
        className="text-[10.5px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--color-pub-text3)" }}
      >
        {label}
      </p>
      <p
        className="mt-1.5 tabular-nums"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 28,
          color: valueColor,
          lineHeight: 1,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </p>
      <p
        className="mt-1.5 text-[11px] leading-snug"
        style={{ color: "var(--color-pub-text3)" }}
      >
        {hint}
      </p>
    </div>
  );
}

function ActiveSpotlight({
  fase,
  index,
}: {
  fase: PublicPayload["fases"][number];
  index: number;
}) {
  const itemsDone = fase.items.filter((i) => i.completado).length;
  const itemsTotal = fase.items.length;
  const facePct = itemsTotal === 0 ? 0 : Math.round((itemsDone / itemsTotal) * 100);
  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-6 sm:p-7"
      style={{
        background: "var(--color-pub-surface)",
        borderColor: "rgba(29, 95, 166, 0.28)",
        boxShadow:
          "0 0 0 4px rgba(29,95,166,0.05), 0 8px 30px -12px rgba(29,95,166,0.18)",
      }}
    >
      <div
        className="absolute right-[-40px] top-[-40px] h-[140px] w-[140px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(29,95,166,0.12) 0%, transparent 65%)",
        }}
        aria-hidden
      />
      <div className="relative flex items-start gap-4">
        <div
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
          style={{
            background: "var(--color-pub-info-l)",
            border: "1.5px solid var(--color-pub-info)",
            color: "var(--color-pub-info)",
          }}
          aria-hidden
        >
          <Hourglass size={20} strokeWidth={1.8} className="animate-pulse-soft" />
        </div>
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.07em]"
              style={{
                background: "var(--color-pub-info-l)",
                color: "var(--color-pub-info)",
              }}
            >
              <Target size={10} strokeWidth={2.5} aria-hidden />
              En curso ahora
            </span>
            <span
              className="text-[11px] font-medium"
              style={{ color: "var(--color-pub-text3)" }}
            >
              Fase {index}
            </span>
          </div>
          <h3
            className="mb-2"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 22,
              color: "var(--color-pub-text)",
              letterSpacing: "-0.01em",
              lineHeight: 1.25,
            }}
          >
            {fase.titulo}
          </h3>
          <p
            className="text-[14px] leading-[1.65]"
            style={{ color: "var(--color-pub-text2)" }}
          >
            {fase.descripcion}
          </p>
          {itemsTotal > 0 ? (
            <div className="mt-4 flex items-center gap-3">
              <div
                className="flex-1 overflow-hidden rounded-full"
                style={{ background: "rgba(29, 95, 166, 0.1)", height: 4 }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    background: "var(--color-pub-info)",
                    width: `${facePct}%`,
                    transition: "width 1s ease-out",
                  }}
                />
              </div>
              <span
                className="text-[11.5px] font-medium tabular-nums"
                style={{ color: "var(--color-pub-info)" }}
              >
                {itemsDone}/{itemsTotal}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-2xl border px-6 py-14 text-center text-sm"
      style={{
        background: "var(--color-pub-surface)",
        borderColor: "var(--color-pub-border)",
        color: "var(--color-pub-text2)",
      }}
    >
      <Calendar
        size={28}
        className="mx-auto mb-3 opacity-40"
        style={{ color: "var(--color-pub-text3)" }}
        aria-hidden
      />
      <p style={{ color: "var(--color-pub-text2)" }}>
        Todavía no hay fases cargadas.
      </p>
      <p
        className="mt-1 text-[12.5px]"
        style={{ color: "var(--color-pub-text3)" }}
      >
        Pronto verás aquí el plan detallado de tu implementación.
      </p>
    </div>
  );
}

type PhaseCardProps = {
  fase: PublicPayload["fases"][number];
  index: number;
  totalPhases: number;
  isLast: boolean;
};

function PhaseCard({ fase, index, isLast }: PhaseCardProps) {
  const estado = fase.estado;
  const indicatorStyles: Record<FaseEstado, React.CSSProperties> = {
    done: {
      background: "var(--color-pub-accent)",
      border: "2.5px solid var(--color-pub-bg)",
      color: "#fff",
      boxShadow: "0 0 0 1.5px var(--color-pub-accent)",
    },
    active: {
      background: "var(--color-pub-info-l)",
      border: "2px solid var(--color-pub-info)",
      color: "var(--color-pub-info)",
      boxShadow: "0 0 0 5px rgba(29,95,166,0.1)",
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
      estado === "active"
        ? "rgba(29,95,166,0.22)"
        : "var(--color-pub-border)",
    boxShadow:
      estado === "active"
        ? "0 4px 20px -8px rgba(29,95,166,0.12)"
        : undefined,
  };

  const animationDelay = `${120 + index * 90}ms`;

  return (
    <article
      className={cn(
        "relative flex gap-5 animate-fade-in",
        isLast ? "mb-0" : "mb-3.5",
      )}
      style={{ animationDelay, opacity: 0 }}
    >
      <div
        className="relative z-10 mt-[3px] flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center rounded-full text-[15px]"
        style={indicatorStyles[estado]}
        aria-hidden
      >
        <PhaseIndicator fase={fase} />
      </div>
      <div
        className={cn(
          "group flex-1 rounded-2xl border px-5 py-5 transition-all duration-300 sm:px-6",
          estado === "done" && "opacity-[0.82] hover:opacity-100",
          estado === "pending" && "hover:brightness-[1.02]",
        )}
        style={cardStyle}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <span
            className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--color-pub-text3)" }}
          >
            Fase {fase.orden}
          </span>
          <PublicBadge estado={estado} />
        </div>
        <h3
          className="mb-2 font-normal"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 20,
            color: "var(--color-pub-text)",
            letterSpacing: "-0.008em",
            lineHeight: 1.28,
          }}
        >
          {fase.titulo}
        </h3>
        <p
          className="text-[13.5px] leading-[1.65]"
          style={{ color: "var(--color-pub-text2)" }}
        >
          {fase.descripcion}
        </p>
        {fase.items.length > 0 ? (
          <ul
            className="mt-4 space-y-[9px] border-t pt-4"
            style={{ borderColor: "var(--color-pub-border)" }}
          >
            {fase.items.map((item) => (
              <ItemRow key={item.id} item={item} phaseEstado={estado} />
            ))}
          </ul>
        ) : null}
        {estado === "done" && fase.completada_at ? (
          <p
            className="mt-3 flex items-center gap-1.5 text-[11.5px]"
            style={{ color: "var(--color-pub-accent-m)" }}
          >
            <CheckCircle2 size={11} aria-hidden />
            Completada el {formatDate(fase.completada_at)}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function PhaseIndicator({ fase }: { fase: PublicPayload["fases"][number] }) {
  if (fase.estado === "done") return <Check size={18} strokeWidth={3} aria-hidden />;
  if (fase.estado === "active") {
    if (fase.icono) return <span className="text-[16px]">{fase.icono}</span>;
    return <Hourglass size={16} strokeWidth={2} aria-hidden />;
  }
  return (
    <span className="text-[13px] font-semibold tabular-nums">{fase.orden}</span>
  );
}

function PublicBadge({ estado }: { estado: FaseEstado }) {
  const styles: Record<FaseEstado, React.CSSProperties> = {
    done: {
      background: "var(--color-pub-accent-l)",
      color: "var(--color-pub-accent)",
      border: "1px solid rgba(26,107,74,0.15)",
    },
    active: {
      background: "var(--color-pub-info-l)",
      color: "var(--color-pub-info)",
      border: "1px solid rgba(29,95,166,0.2)",
    },
    pending: {
      background: "var(--color-pub-bg)",
      color: "var(--color-pub-text3)",
      border: "1px solid var(--color-pub-border)",
    },
  };
  const dotColor: Record<FaseEstado, string> = {
    done: "var(--color-pub-accent-m)",
    active: "var(--color-pub-info)",
    pending: "var(--color-pub-text3)",
  };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold"
      style={styles[estado]}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          estado === "active" && "animate-pulse-soft",
        )}
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
  const iconBgStyle: React.CSSProperties = done
    ? {
        background: "var(--color-pub-accent-l)",
        border: "1px solid rgba(26,107,74,0.2)",
        color: "var(--color-pub-accent)",
      }
    : phaseEstado === "active"
      ? {
          background: "var(--color-pub-info-l)",
          border: "1px solid rgba(29,95,166,0.15)",
          color: "var(--color-pub-info)",
        }
      : {
          background: "var(--color-pub-bg)",
          border: "1px solid var(--color-pub-border)",
          color: "var(--color-pub-text3)",
        };
  const iconEl = done ? (
    <Check size={11} strokeWidth={3} aria-hidden />
  ) : phaseEstado === "active" ? (
    <Hourglass size={10} strokeWidth={2} aria-hidden />
  ) : (
    <Circle size={8} strokeWidth={2} aria-hidden />
  );
  return (
    <li
      className="flex items-start gap-3 text-[13px] leading-[1.55]"
      style={{
        color: done ? "var(--color-pub-text3)" : "var(--color-pub-text2)",
      }}
    >
      <span
        className="mt-[1px] flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-md"
        style={iconBgStyle}
      >
        {iconEl}
      </span>
      <span
        style={{
          textDecoration: done ? "line-through" : undefined,
          textDecorationColor: done ? "var(--color-pub-border)" : undefined,
          textDecorationThickness: "1px",
        }}
      >
        {item.texto}
      </span>
    </li>
  );
}

function EventRow({ ev }: { ev: PublicPayload["eventos"][number] }) {
  const { Icon, color } = eventVisuals(ev.tipo);
  return (
    <li
      className="flex items-start gap-3 px-5 py-3.5 text-[13px]"
      style={{ borderColor: "var(--color-pub-border)" }}
    >
      <span
        className="mt-[2px] flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
        style={{
          background:
            color === "accent" ? "var(--color-pub-accent-l)" : "var(--color-pub-info-l)",
          color:
            color === "accent" ? "var(--color-pub-accent)" : "var(--color-pub-info)",
        }}
        aria-hidden
      >
        <Icon size={13} strokeWidth={2.25} />
      </span>
      <div className="flex-1">
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
  );
}

/* ═══════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════ */

function eventVisuals(tipo: string): {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  color: "accent" | "info";
} {
  switch (tipo) {
    case "fase_completada":
      return { Icon: CheckCircle2, color: "accent" };
    case "fase_activada":
    case "fase_iniciada":
      return { Icon: Target, color: "info" };
    case "item_completado":
      return { Icon: Check, color: "accent" };
    case "roadmap_creado":
      return { Icon: Sparkles, color: "accent" };
    default:
      return { Icon: Circle, color: "info" };
  }
}

function labelFromTipo(tipo: string): string {
  switch (tipo) {
    case "fase_completada":
      return "Fase completada";
    case "fase_iniciada":
    case "fase_activada":
      return "Nueva fase iniciada";
    case "item_completado":
      return "Tarea completada";
    case "roadmap_creado":
      return "Proyecto iniciado";
    case "proyecto_actualizado":
      return "Proyecto actualizado";
    default:
      return tipo.replace(/_/g, " ");
  }
}

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
