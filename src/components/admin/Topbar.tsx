"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ChevronRight, LogOut, Search } from "lucide-react";

import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/admin/ThemeToggle";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/login/actions";

export interface TopbarProps {
  userEmail: string | null;
  userName: string | null;
  avatarUrl: string | null;
}

export function Topbar({ userEmail, userName, avatarUrl }: TopbarProps) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const initials = (userName || userEmail || "??")
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  const crumbs = breadcrumbsFromPath(pathname);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-all duration-200",
        scrolled
          ? "glass-panel shadow-[var(--shadow-md)]"
          : "border-b border-[var(--color-b1)] bg-[var(--color-bg)]/60 backdrop-blur",
      )}
    >
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-7 py-2.5">
        {/* Left: Logo + breadcrumbs */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 hover:opacity-90 transition-opacity shrink-0"
          >
            <Logo size={30} />
            <span className="hidden sm:inline text-[13.5px] font-semibold text-[var(--color-t1)] tracking-[-0.015em]">
              Codexy
            </span>
          </Link>
          {/* Breadcrumbs */}
          {crumbs.length > 0 ? (
            <nav
              aria-label="Breadcrumb"
              className="hidden md:flex items-center gap-1.5 text-[12px] min-w-0"
            >
              <ChevronRight
                size={13}
                className="text-[var(--color-b2)] shrink-0"
                aria-hidden
              />
              {crumbs.map((c, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                  <span key={c.href} className="flex items-center gap-1.5 min-w-0">
                    {isLast ? (
                      <span
                        className="truncate font-medium text-[var(--color-t1)]"
                        style={{ fontFamily: "var(--ff-mono)", fontSize: "12px" }}
                      >
                        {c.label}
                      </span>
                    ) : (
                      <Link
                        href={c.href}
                        className="truncate text-[var(--color-t3)] hover:text-[var(--color-t1)] transition-colors"
                        style={{ fontFamily: "var(--ff-mono)", fontSize: "12px" }}
                      >
                        {c.label}
                      </Link>
                    )}
                    {!isLast ? (
                      <ChevronRight
                        size={13}
                        className="text-[var(--color-b2)] shrink-0"
                        aria-hidden
                      />
                    ) : null}
                  </span>
                );
              })}
            </nav>
          ) : null}
        </div>

        {/* Right: search pill + realtime + theme + user */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Search pill (⌘K trigger) */}
          <button
            type="button"
            disabled
            title="Command palette (próximamente)"
            className={cn(
              "hidden md:inline-flex items-center gap-2 h-9 px-3 rounded-[8px]",
              "bg-[var(--color-s2)] border border-[var(--color-b1)]",
              "text-[var(--color-t3)] text-[12px] w-[220px] lg:w-[260px]",
              "hover:border-[var(--color-b2)] hover:text-[var(--color-t2)] transition-colors",
              "disabled:opacity-70",
            )}
            aria-label="Buscar (⌘K)"
          >
            <Search size={13} strokeWidth={2} />
            <span className="flex-1 text-left">Buscar cliente, fase, ítem…</span>
            <span className="flex items-center gap-0.5">
              <kbd className="kbd">⌘</kbd>
              <kbd className="kbd">K</kbd>
            </span>
          </button>

          {/* Realtime dot — verde pulsante = conectado */}
          <div
            className="hidden lg:flex items-center gap-1.5 pr-1"
            title="Realtime activo · los cambios se sincronizan en vivo"
          >
            <span className="relative flex h-2 w-2 items-center justify-center">
              <span className="absolute h-2 w-2 rounded-full bg-emerald-500/50 animate-ping" />
              <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--color-t3)]">
              Live
            </span>
          </div>

          <ThemeToggle />

          {/* User info */}
          <div className="hidden sm:flex items-center gap-2 pl-1.5 ml-0.5 border-l border-[var(--color-b1)]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="w-7 h-7 rounded-full border border-[var(--color-b1)] object-cover"
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-brand), color-mix(in srgb, var(--color-brand) 60%, #000))",
                }}
              >
                {initials}
              </div>
            )}
            <div className="hidden lg:block leading-tight min-w-0">
              {userName ? (
                <div className="text-[12px] font-medium text-[var(--color-t1)] truncate max-w-[140px]">
                  {userName}
                </div>
              ) : null}
              <div className="text-[10.5px] text-[var(--color-t3)] truncate max-w-[160px]">
                {userEmail}
              </div>
            </div>
          </div>

          <form
            action={() => {
              startTransition(async () => {
                await logoutAction();
              });
            }}
          >
            <button
              type="submit"
              disabled={pending}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className={cn(
                "inline-flex items-center justify-center h-9 w-9 rounded-[8px]",
                "border border-[var(--color-b1)] bg-[var(--color-s1)]",
                "text-[var(--color-t2)] hover:text-[var(--color-danger)]",
                "hover:border-[rgba(248,113,113,0.35)] hover:bg-[var(--color-danger-muted)]",
                "transition-all duration-200 disabled:opacity-50",
              )}
            >
              <LogOut size={13} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

/** Deriva los breadcrumbs del pathname actual. */
function breadcrumbsFromPath(pathname: string): Array<{ label: string; href: string }> {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [];

  const crumbs: Array<{ label: string; href: string }> = [];
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    acc += `/${p}`;
    // Si es un UUID (proyecto id), mostrá algo simbólico
    const isId = /^[0-9a-f-]{36}$/.test(p);
    if (isId) {
      crumbs.push({ label: "…proyecto", href: acc });
    } else {
      const label =
        p === "dashboard"
          ? "Clientes"
          : p === "proyectos"
            ? "Proyectos"
            : p.charAt(0).toUpperCase() + p.slice(1);
      crumbs.push({ label, href: acc });
    }
  }
  return crumbs;
}
