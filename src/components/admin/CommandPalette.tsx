"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Clock,
  CornerDownLeft,
  LayoutGrid,
  Layers,
  LogOut,
  Moon,
  Plus,
  Search,
  Sun,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { logoutAction } from "@/app/login/actions";

/* ════════════════════════════════════════════════════════
   Constants & types
   ════════════════════════════════════════════════════════ */

const THEME_STORAGE_KEY = "codexy-theme";
const RECENT_STORAGE_KEY = "codexy-cmdk-recent";
const RECENT_MAX = 5;
const GROUP_LIMIT = 6;

/** Evento global que DashboardClient puede escuchar para abrir el dialog "nuevo roadmap". */
export const CMDK_NEW_ROADMAP_EVENT = "cmdk:new-roadmap";

type ClienteResult = {
  id: string;
  nombre: string;
  empresa: string | null;
  proyecto_id: string;
};

type FaseResult = {
  id: string;
  titulo: string;
  proyecto_id: string;
  orden: number;
};

type GroupId = "acciones" | "clientes" | "fases" | "recientes";

type Item = {
  id: string;
  group: GroupId;
  label: string;
  hint?: string;
  icon: ReactNode;
  /** Cada grupo aporta un shortcut display opcional. */
  shortcut?: string[];
  onSelect: () => void | Promise<void>;
  /** Texto a usar para scoring (default: label + hint). */
  searchText?: string;
  /** ID de cliente para trackear "Recientes" al ejecutar. */
  trackClienteId?: string;
};

type PaletteCtx = {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
};

/* ════════════════════════════════════════════════════════
   Context + hook
   ════════════════════════════════════════════════════════ */

const CommandPaletteContext = createContext<PaletteCtx | null>(null);

export function useCommandPalette(): {
  open: () => void;
  close: () => void;
  toggle: () => void;
} {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error("useCommandPalette must be used within <CommandPaletteProvider>");
  }
  return {
    open: () => ctx.setOpen(true),
    close: () => ctx.setOpen(false),
    toggle: ctx.toggle,
  };
}

/* ════════════════════════════════════════════════════════
   Provider
   ════════════════════════════════════════════════════════ */

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  // ⌘K / Ctrl+K global
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isK = e.key === "k" || e.key === "K";
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<PaletteCtx>(() => ({ open, setOpen, toggle }), [open, toggle]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </CommandPaletteContext.Provider>
  );
}

/* ════════════════════════════════════════════════════════
   Fuzzy scoring
   - startsWith: 1000 + length bonus
   - includes:    500 + position penalty
   - subseq:      100 + match density
   ════════════════════════════════════════════════════════ */

function score(text: string, query: string): number {
  if (!query) return 1; // all match equally when no query
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t.startsWith(q)) return 1000 + (q.length / t.length) * 100;
  const idx = t.indexOf(q);
  if (idx !== -1) return 500 - idx + (q.length / t.length) * 100;
  // Subsequence char-by-char
  let ti = 0;
  let matched = 0;
  let lastMatchAt = -1;
  let density = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q.charAt(qi);
    const found = t.indexOf(c, ti);
    if (found === -1) return 0;
    if (lastMatchAt !== -1 && found === lastMatchAt + 1) density += 1;
    lastMatchAt = found;
    ti = found + 1;
    matched += 1;
  }
  return matched === q.length ? 100 + density * 5 - (t.length - q.length) * 0.1 : 0;
}

/* ════════════════════════════════════════════════════════
   LocalStorage "Recientes"
   ════════════════════════════════════════════════════════ */

type RecentEntry = { id: string; nombre: string; empresa: string | null; proyecto_id: string };

function readRecents(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is RecentEntry =>
          !!e &&
          typeof e === "object" &&
          typeof (e as RecentEntry).id === "string" &&
          typeof (e as RecentEntry).nombre === "string" &&
          typeof (e as RecentEntry).proyecto_id === "string",
      )
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function pushRecent(entry: RecentEntry) {
  if (typeof window === "undefined") return;
  try {
    const existing = readRecents().filter((e) => e.id !== entry.id);
    const next = [entry, ...existing].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

/* ════════════════════════════════════════════════════════
   Core palette
   ════════════════════════════════════════════════════════ */

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [clientes, setClientes] = useState<ClienteResult[]>([]);
  const [fases, setFases] = useState<FaseResult[]>([]);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /* ── Mount / unmount with exit animation ───────────────── */
  useEffect(() => {
    if (open) {
      setMounted(true);
      setAnimatingOut(false);
      return;
    }
    if (!mounted) return;
    setAnimatingOut(true);
    const t = window.setTimeout(() => {
      setMounted(false);
      setAnimatingOut(false);
    }, 160);
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  /* ── Reset query + load recents each time we open ──────── */
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    setRecents(readRecents());
    // Autofocus after paint
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  /* ── Fetch once per session ────────────────────────────── */
  useEffect(() => {
    if (!open || loaded || fetching) return;
    setFetching(true);
    const supabase = createClient();
    (async () => {
      try {
        // Clientes con roadmap: join via cliente_id
        const { data: proyectos } = await supabase
          .from("roadmap_proyectos")
          .select("id, cliente_id, estado")
          .order("updated_at", { ascending: false });

        const clienteIds = Array.from(
          new Set((proyectos ?? []).map((p) => p.cliente_id).filter(Boolean)),
        ) as string[];

        const clientesById = new Map<string, { nombre: string; empresa: string | null }>();
        if (clienteIds.length > 0) {
          const { data: cls } = await supabase
            .from("clientes")
            .select("id, nombre, empresa")
            .in("id", clienteIds);
          for (const c of cls ?? []) {
            clientesById.set(c.id, { nombre: c.nombre, empresa: c.empresa });
          }
        }

        const nextClientes: ClienteResult[] = [];
        const seenCliente = new Set<string>();
        for (const p of proyectos ?? []) {
          if (seenCliente.has(p.cliente_id)) continue;
          const cliente = clientesById.get(p.cliente_id);
          if (!cliente) continue;
          seenCliente.add(p.cliente_id);
          nextClientes.push({
            id: p.cliente_id,
            nombre: cliente.nombre,
            empresa: cliente.empresa,
            proyecto_id: p.id,
          });
        }

        // Fases de proyectos activos
        const activeProyectoIds = (proyectos ?? [])
          .filter((p) => p.estado === "activo")
          .map((p) => p.id);

        let nextFases: FaseResult[] = [];
        if (activeProyectoIds.length > 0) {
          const { data: fs } = await supabase
            .from("roadmap_fases")
            .select("id, titulo, proyecto_id, orden")
            .in("proyecto_id", activeProyectoIds)
            .order("orden", { ascending: true });
          nextFases = (fs ?? []).map((f) => ({
            id: f.id,
            titulo: f.titulo,
            proyecto_id: f.proyecto_id,
            orden: f.orden,
          }));
        }

        setClientes(nextClientes);
        setFases(nextFases);
        setLoaded(true);
      } catch {
        // Silent — palette degrades to static acciones only
        setLoaded(true);
      } finally {
        setFetching(false);
      }
    })();
  }, [open, loaded, fetching]);

  /* ── Close helper that navigates through onSelect ──────── */
  const executeAndClose = useCallback(
    async (run: () => void | Promise<void>) => {
      onClose();
      // Small delay lets the close animation breathe before navigation
      await Promise.resolve(run());
    },
    [onClose],
  );

  /* ── Theme toggle (mirrors ThemeToggle.tsx logic) ──────── */
  const toggleTheme = useCallback(() => {
    const html = document.documentElement;
    const current = html.getAttribute("data-theme");
    const next = current === "light" ? "dark" : "light";
    html.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* noop */
    }
  }, []);

  const currentTheme =
    typeof document !== "undefined"
      ? document.documentElement.getAttribute("data-theme") ?? "dark"
      : "dark";

  /* ── Build items ──────────────────────────────────────── */
  const acciones = useMemo<Item[]>(
    () => [
      {
        id: "action:dashboard",
        group: "acciones",
        label: "Ir a Dashboard",
        icon: <LayoutGrid size={14} strokeWidth={2} />,
        shortcut: ["G", "D"],
        onSelect: () => executeAndClose(() => router.push("/dashboard")),
      },
      {
        id: "action:new-roadmap",
        group: "acciones",
        label: "Nuevo roadmap",
        icon: <Plus size={14} strokeWidth={2} />,
        onSelect: () =>
          executeAndClose(() => {
            // Navegá al dashboard y emití evento para que DashboardClient abra el dialog
            router.push("/dashboard");
            window.setTimeout(() => {
              window.dispatchEvent(new CustomEvent(CMDK_NEW_ROADMAP_EVENT));
            }, 50);
          }),
      },
      {
        id: "action:toggle-theme",
        group: "acciones",
        label: "Cambiar tema",
        icon:
          currentTheme === "light" ? (
            <Moon size={14} strokeWidth={2} />
          ) : (
            <Sun size={14} strokeWidth={2} />
          ),
        onSelect: () => executeAndClose(() => toggleTheme()),
      },
      {
        id: "action:logout",
        group: "acciones",
        label: "Cerrar sesión",
        icon: <LogOut size={14} strokeWidth={2} />,
        onSelect: () =>
          executeAndClose(async () => {
            await logoutAction();
          }),
      },
    ],
    [router, executeAndClose, toggleTheme, currentTheme],
  );

  const clienteItems = useMemo<Item[]>(
    () =>
      clientes.map((c) => ({
        id: `cliente:${c.id}`,
        group: "clientes",
        label: c.nombre,
        hint: c.empresa ?? undefined,
        icon: <User size={14} strokeWidth={2} />,
        searchText: `${c.nombre} ${c.empresa ?? ""}`,
        trackClienteId: c.id,
        onSelect: () =>
          executeAndClose(() => {
            pushRecent({
              id: c.id,
              nombre: c.nombre,
              empresa: c.empresa,
              proyecto_id: c.proyecto_id,
            });
            router.push(`/proyectos/${c.proyecto_id}`);
          }),
      })),
    [clientes, router, executeAndClose],
  );

  const faseItems = useMemo<Item[]>(
    () =>
      fases.map((f) => ({
        id: `fase:${f.id}`,
        group: "fases",
        label: f.titulo,
        hint: `Fase ${f.orden}`,
        icon: <Layers size={14} strokeWidth={2} />,
        searchText: f.titulo,
        onSelect: () =>
          executeAndClose(() => router.push(`/proyectos/${f.proyecto_id}#fase-${f.id}`)),
      })),
    [fases, router, executeAndClose],
  );

  const recientesItems = useMemo<Item[]>(
    () =>
      recents.map((r) => ({
        id: `recent:${r.id}`,
        group: "recientes",
        label: r.nombre,
        hint: r.empresa ?? "Visitado recientemente",
        icon: <Clock size={14} strokeWidth={2} />,
        onSelect: () =>
          executeAndClose(() => {
            pushRecent(r);
            router.push(`/proyectos/${r.proyecto_id}`);
          }),
      })),
    [recents, router, executeAndClose],
  );

  /* ── Filter + group ───────────────────────────────────── */
  const grouped = useMemo(() => {
    const q = query.trim();
    const filterAndSort = (items: Item[]) => {
      if (!q) return items.slice(0, GROUP_LIMIT);
      const scored = items
        .map((it) => ({ it, s: score(it.searchText ?? `${it.label} ${it.hint ?? ""}`, q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, GROUP_LIMIT)
        .map((x) => x.it);
      return scored;
    };

    const accionesOut = filterAndSort(acciones);
    const clientesOut = filterAndSort(clienteItems);
    const fasesOut = filterAndSort(faseItems);
    // Recientes: sólo sin query
    const recientesOut = q ? [] : recientesItems.slice(0, GROUP_LIMIT);

    const groups: Array<{ id: GroupId; label: string; items: Item[] }> = [];
    if (accionesOut.length > 0) groups.push({ id: "acciones", label: "Acciones", items: accionesOut });
    if (clientesOut.length > 0) groups.push({ id: "clientes", label: "Clientes", items: clientesOut });
    if (fasesOut.length > 0) groups.push({ id: "fases", label: "Fases", items: fasesOut });
    if (recientesOut.length > 0)
      groups.push({ id: "recientes", label: "Recientes", items: recientesOut });
    return groups;
  }, [query, acciones, clienteItems, faseItems, recientesItems]);

  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  /* ── Reset selection when filter changes ───────────────── */
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, grouped.length]);

  /* ── Keep selected in view ─────────────────────────────── */
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-cmdk-index="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  /* ── Keyboard within open palette ──────────────────────── */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (flatItems.length === 0 ? 0 : (i + 1) % flatItems.length));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) =>
          flatItems.length === 0 ? 0 : (i - 1 + flatItems.length) % flatItems.length,
        );
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const picked = flatItems[selectedIndex];
        if (picked) {
          void picked.onSelect();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flatItems, selectedIndex, onClose]);

  if (!mounted) return null;

  const showingClosing = animatingOut || !open;

  /* ── Render ───────────────────────────────────────────── */
  let runningIndex = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos"
      className={cn(
        "fixed inset-0 z-[70] flex items-start justify-center",
        "px-4 pt-[12vh] sm:pt-[14vh]",
      )}
    >
      {/* Overlay */}
      <button
        type="button"
        aria-label="Cerrar paleta"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-[4px]",
          "transition-opacity duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          showingClosing ? "opacity-0" : "opacity-100",
        )}
      />

      {/* Panel */}
      <div
        className={cn(
          "relative w-[92vw] sm:w-[640px] max-w-[640px]",
          "rounded-[14px] overflow-hidden",
          "border border-white/[0.08]",
          "shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55),0_0_0_1px_rgba(139,92,246,0.12),0_0_40px_-10px_rgba(139,92,246,0.25)]",
          "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          showingClosing
            ? "opacity-0 scale-[0.96] translate-y-1"
            : "opacity-100 scale-100 translate-y-0",
        )}
        style={{
          background: "color-mix(in srgb, var(--color-bg) 72%, transparent)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
        }}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 h-[52px] border-b border-white/[0.06]">
          <Search
            size={15}
            strokeWidth={2}
            className="text-[var(--color-t3)] shrink-0"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente, fase, ítem, acción…"
            aria-label="Buscar"
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            className={cn(
              "flex-1 h-12 bg-transparent border-0 outline-none",
              "text-[var(--color-t1)] placeholder:text-[var(--color-t3)]",
              "font-mono text-[16px]",
            )}
            style={{ fontFamily: "var(--ff-mono)" }}
          />
          {fetching ? (
            <span
              aria-hidden
              className="inline-block w-3 h-3 border-2 border-[var(--color-t3)] border-t-transparent rounded-full animate-spin"
            />
          ) : null}
          <kbd className="kbd hidden sm:inline-flex">ESC</kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          role="listbox"
          className="max-h-[50vh] overflow-y-auto py-2"
        >
          {grouped.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-[var(--color-t3)]">
              {query ? (
                <>
                  Sin resultados para{" "}
                  <span className="font-mono text-[var(--color-t2)]">“{query}”</span>
                </>
              ) : (
                "Escribí para buscar…"
              )}
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.id} className="mb-1.5 last:mb-0">
                <div
                  className={cn(
                    "px-4 pt-2 pb-1 text-[11px] uppercase tracking-[0.08em] font-medium",
                    "text-[var(--color-t3)]",
                  )}
                >
                  {group.label}
                </div>
                <div className="flex flex-col">
                  {group.items.map((item) => {
                    runningIndex += 1;
                    const idx = runningIndex;
                    const active = idx === selectedIndex;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        role="option"
                        aria-selected={active}
                        data-cmdk-index={idx}
                        onMouseMove={() => setSelectedIndex(idx)}
                        onClick={() => void item.onSelect()}
                        className={cn(
                          "flex items-center gap-3 h-10 px-4 mx-1.5 rounded-[8px]",
                          "text-left outline-none",
                          "transition-colors duration-75",
                          active
                            ? "bg-[var(--color-brand-muted)] text-[var(--color-t1)]"
                            : "text-[var(--color-t2)] hover:text-[var(--color-t1)]",
                        )}
                      >
                        <span
                          className={cn(
                            "shrink-0 inline-flex items-center justify-center w-5 h-5",
                            active ? "text-[var(--color-brand)]" : "text-[var(--color-t3)]",
                          )}
                          aria-hidden
                        >
                          {item.icon}
                        </span>
                        <span className="flex-1 min-w-0 flex items-baseline gap-2">
                          <span className="truncate text-[13.5px] font-medium">
                            {item.label}
                          </span>
                          {item.hint ? (
                            <span className="truncate text-[12px] text-[var(--color-t3)]">
                              {item.hint}
                            </span>
                          ) : null}
                        </span>
                        {item.shortcut ? (
                          <span className="flex items-center gap-1 shrink-0">
                            {item.shortcut.map((k) => (
                              <kbd key={k} className="kbd">
                                {k}
                              </kbd>
                            ))}
                          </span>
                        ) : active ? (
                          <ArrowRight
                            size={13}
                            strokeWidth={2}
                            className="text-[var(--color-brand)] shrink-0"
                            aria-hidden
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className={cn(
            "flex items-center justify-between gap-3 px-4 h-[36px]",
            "border-t border-white/[0.06] text-[11px] text-[var(--color-t3)]",
          )}
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="kbd">
                <CornerDownLeft size={10} strokeWidth={2} />
              </kbd>
              <span>ejecutar</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd">↑</kbd>
              <kbd className="kbd">↓</kbd>
              <span className="ml-0.5">navegar</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd">esc</kbd>
              <span>cerrar</span>
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-[var(--color-t3)]">
            <span className="font-mono">Codexy</span>
          </div>
        </div>
      </div>
    </div>
  );
}
