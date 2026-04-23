"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, LayoutDashboard } from "lucide-react";
import { useTransition } from "react";

import { Logo } from "@/components/ui/Logo";
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

  const navItems: Array<{ href: string; label: string; icon: typeof LayoutDashboard }> = [
    { href: "/dashboard", label: "Clientes", icon: LayoutDashboard },
  ];

  const initials = (userName || userEmail || "??")
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-[var(--color-bg)]/95 backdrop-blur border-b border-[var(--color-b1)] px-4 sm:px-6 lg:px-7 py-3">
      <div className="flex items-center gap-4 min-w-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
        >
          <Logo size={36} />
          <div className="flex flex-col leading-tight">
            <span className="text-[15px] font-semibold text-[var(--color-t1)] tracking-[-0.01em]">
              Codexy
            </span>
            <span className="text-[10px] font-medium text-[var(--color-t3)] uppercase tracking-[0.08em]">
              Roadmaps
            </span>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-1 ml-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex items-center gap-1.5 text-[13px] px-3 h-8 rounded-[7px] transition-colors",
                  active
                    ? "bg-[var(--color-s2)] text-[var(--color-t1)]"
                    : "text-[var(--color-t2)] hover:bg-[var(--color-s2)] hover:text-[var(--color-t1)]",
                )}
              >
                <Icon size={14} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2.5 pr-1">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="w-7 h-7 rounded-full border border-[var(--color-b1)]"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-[var(--color-s2)] border border-[var(--color-b1)] flex items-center justify-center text-[10px] font-semibold text-[var(--color-t2)]">
              {initials}
            </div>
          )}
          <div className="leading-tight min-w-0">
            {userName ? (
              <div className="text-[12px] font-medium text-[var(--color-t1)] truncate max-w-[160px]">
                {userName}
              </div>
            ) : null}
            <div className="text-[11px] text-[var(--color-t3)] truncate max-w-[180px]">
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
            className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[7px] border border-[var(--color-b1)] text-[var(--color-t2)] hover:border-[var(--color-b2)] hover:text-[var(--color-t1)] hover:bg-[var(--color-s2)] transition-all disabled:opacity-50"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </form>
      </div>
    </header>
  );
}
