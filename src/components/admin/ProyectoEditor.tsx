"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  Mail,
  Pencil,
  Phone,
  Plus,
  RefreshCcw,
  Tag,
  Trash2,
  User,
  Check,
  X,
  Loader2,
  History,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { BrandingSection } from "@/components/admin/BrandingSection";
import { ClientEditDialog } from "@/components/admin/ClientEditDialog";
import { ConfirmDialog } from "@/components/admin/Dialog";
import { ProgressBar } from "@/components/admin/ProgressBar";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDate, getPublicUrl, relativeTime } from "@/lib/utils";
import type {
  Cliente,
  FaseEstado,
  Profile,
  RoadmapEvento,
  RoadmapFase,
  RoadmapItem,
  RoadmapProyecto,
  RoadmapTokenPublico,
} from "@/types/database";
import {
  deleteFase,
  deleteItem,
  deleteProyectoAndRedirect,
  regenerateToken,
  reorderFases,
  toggleTokenActivo,
  updateProyectoMeta,
  upsertFase,
  upsertItem,
} from "@/app/(admin)/proyectos/actions";

type FaseWithItems = RoadmapFase & { items: RoadmapItem[] | null };

export interface ProyectoEditorProps {
  proyecto: RoadmapProyecto;
  cliente: Cliente | null;
  fases: FaseWithItems[];
  token: RoadmapTokenPublico | null;
  eventos: RoadmapEvento[];
  pms: Profile[];
}

interface LocalItem {
  id: string; // puede ser tmp-xxx
  fase_id: string;
  texto: string;
  completado: boolean;
  orden: number;
  _persisted: boolean;
  _updated_at: number;
}

interface LocalFase {
  id: string;
  proyecto_id: string;
  orden: number;
  titulo: string;
  descripcion: string;
  icono: string | null;
  estado: FaseEstado;
  items: LocalItem[];
  _persisted: boolean;
  _updated_at: number;
}

function tmpId() {
  return `tmp-${Math.random().toString(36).slice(2, 10)}`;
}

function mapFaseToLocal(f: FaseWithItems): LocalFase {
  return {
    id: f.id,
    proyecto_id: f.proyecto_id,
    orden: f.orden,
    titulo: f.titulo,
    descripcion: f.descripcion ?? "",
    icono: f.icono,
    estado: f.estado,
    items: (f.items ?? []).map((it) => ({
      id: it.id,
      fase_id: it.fase_id,
      texto: it.texto,
      completado: it.completado,
      orden: it.orden,
      _persisted: true,
      _updated_at: Date.now(),
    })),
    _persisted: true,
    _updated_at: Date.now(),
  };
}

export function ProyectoEditor({
  proyecto,
  cliente,
  fases: initialFases,
  token: initialToken,
  eventos: initialEventos,
  pms,
}: ProyectoEditorProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [fases, setFases] = useState<LocalFase[]>(() => initialFases.map(mapFaseToLocal));
  const [token, setToken] = useState<RoadmapTokenPublico | null>(initialToken);
  const [eventos, setEventos] = useState<RoadmapEvento[]>(initialEventos);
  const [deletingFaseId, setDeletingFaseId] = useState<string | null>(null);
  const [deletingProyecto, setDeletingProyecto] = useState(false);
  const [regenConfirm, setRegenConfirm] = useState(false);
  const [editingCliente, setEditingCliente] = useState(false);

  // ─── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`proyecto-${proyecto.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "roadmap_fases",
          filter: `proyecto_id=eq.${proyecto.id}`,
        },
        (payload) => {
          setFases((prev) => {
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as unknown as RoadmapFase).id;
              return prev.filter((f) => f.id !== oldId);
            }
            const row = payload.new as unknown as RoadmapFase;
            const existing = prev.find((f) => f.id === row.id);
            // Ignorar si es nuestra edición local muy reciente
            if (existing && Date.now() - existing._updated_at < 1500) {
              return prev;
            }
            if (payload.eventType === "INSERT") {
              if (existing) return prev;
              return [
                ...prev,
                { ...mapFaseToLocal({ ...row, items: [] }) },
              ].sort((a, b) => a.orden - b.orden);
            }
            return prev
              .map((f) =>
                f.id === row.id
                  ? {
                      ...f,
                      titulo: row.titulo,
                      descripcion: row.descripcion ?? "",
                      icono: row.icono,
                      estado: row.estado,
                      orden: row.orden,
                      _persisted: true,
                      _updated_at: Date.now(),
                    }
                  : f,
              )
              .sort((a, b) => a.orden - b.orden);
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "roadmap_items" },
        (payload) => {
          setFases((prev) => {
            if (payload.eventType === "DELETE") {
              const oldRow = payload.old as unknown as RoadmapItem;
              return prev.map((f) =>
                f.id === oldRow.fase_id
                  ? { ...f, items: f.items.filter((i) => i.id !== oldRow.id) }
                  : f,
              );
            }
            const row = payload.new as unknown as RoadmapItem;
            const faseIndex = prev.findIndex((f) => f.id === row.fase_id);
            if (faseIndex === -1) return prev;
            const fase = prev[faseIndex];
            const existing = fase.items.find((i) => i.id === row.id);
            if (existing && Date.now() - existing._updated_at < 1500) {
              return prev;
            }
            const newItem: LocalItem = {
              id: row.id,
              fase_id: row.fase_id,
              texto: row.texto,
              completado: row.completado,
              orden: row.orden,
              _persisted: true,
              _updated_at: Date.now(),
            };
            let nextItems: LocalItem[];
            if (existing) {
              nextItems = fase.items.map((i) => (i.id === row.id ? newItem : i));
            } else {
              nextItems = [...fase.items, newItem];
            }
            nextItems.sort((a, b) => a.orden - b.orden);
            const next = [...prev];
            next[faseIndex] = { ...fase, items: nextItems };
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "roadmap_eventos",
          filter: `proyecto_id=eq.${proyecto.id}`,
        },
        (payload) => {
          const ev = payload.new as unknown as RoadmapEvento;
          setEventos((prev) => [ev, ...prev].slice(0, 10));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proyecto.id, supabase]);

  // ─── Mutadores optimistas + server action wrappers ────────────────────────

  async function handleFaseFieldSave(fase: LocalFase, patch: Partial<LocalFase>) {
    // eslint-disable-next-line react-hooks/purity
    const updated = { ...fase, ...patch, _updated_at: Date.now() };
    setFases((prev) => prev.map((f) => (f.id === fase.id ? updated : f)));
    if (!fase._persisted) return; // Nueva fase, se guarda al insertar
    const res = await upsertFase({
      id: fase.id,
      proyecto_id: proyecto.id,
      titulo: updated.titulo,
      descripcion: updated.descripcion,
      icono: updated.icono,
      estado: updated.estado,
      orden: updated.orden,
    });
    if (!res.ok) {
      toast.error(res.error);
      router.refresh();
    }
  }

  async function handleEstadoChange(fase: LocalFase, estado: FaseEstado) {
    if (fase.estado === estado) return;
    await handleFaseFieldSave(fase, { estado });
  }

  async function handleAddFase() {
    const maxOrden = fases.reduce((m, f) => Math.max(m, f.orden), 0);
    const localId = tmpId();
    const nueva: LocalFase = {
      id: localId,
      proyecto_id: proyecto.id,
      orden: maxOrden + 1,
      titulo: "Nueva fase",
      descripcion: "",
      icono: null,
      estado: "pending",
      items: [],
      _persisted: false,
      _updated_at: Date.now(),
    };
    setFases((prev) => [...prev, nueva]);
    const res = await upsertFase({
      proyecto_id: proyecto.id,
      titulo: nueva.titulo,
      descripcion: "",
      orden: nueva.orden,
      estado: "pending",
    });
    if (!res.ok) {
      toast.error(res.error);
      setFases((prev) => prev.filter((f) => f.id !== localId));
      return;
    }
    setFases((prev) =>
      prev.map((f) =>
        f.id === localId
          ? { ...f, id: res.data.id, _persisted: true, _updated_at: Date.now() }
          : f,
      ),
    );
  }

  async function handleDeleteFase(id: string) {
    setDeletingFaseId(null);
    const prev = fases;
    setFases((p) => p.filter((f) => f.id !== id));
    const res = await deleteFase({ id, proyecto_id: proyecto.id });
    if (!res.ok) {
      toast.error(res.error);
      setFases(prev);
      return;
    }
    toast.success("Fase eliminada");
  }

  async function handleReorder(faseId: string, direction: "up" | "down") {
    const idx = fases.findIndex((f) => f.id === faseId);
    if (idx === -1) return;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= fases.length) return;
    const next = [...fases];
    [next[idx], next[target]] = [next[target], next[idx]];
    // reasignar orden local
    next.forEach((f, i) => (f.orden = i + 1));
    setFases(next);
    const res = await reorderFases(
      proyecto.id,
      next.map((f) => f.id),
    );
    if (!res.ok) {
      toast.error(res.error);
      router.refresh();
    }
  }

  // Items
  async function handleAddItem(fase: LocalFase) {
    const localId = tmpId();
    const maxOrden = fase.items.reduce((m, i) => Math.max(m, i.orden), 0);
    const nuevo: LocalItem = {
      id: localId,
      fase_id: fase.id,
      texto: "",
      completado: false,
      orden: maxOrden + 1,
      _persisted: false,
      // eslint-disable-next-line react-hooks/purity
      _updated_at: Date.now(),
    };
    setFases((prev) =>
      prev.map((f) => (f.id === fase.id ? { ...f, items: [...f.items, nuevo] } : f)),
    );
    const res = await upsertItem({
      fase_id: fase.id,
      proyecto_id: proyecto.id,
      texto: "Nuevo ítem",
      orden: nuevo.orden,
    });
    if (!res.ok) {
      toast.error(res.error);
      setFases((prev) =>
        prev.map((f) =>
          f.id === fase.id ? { ...f, items: f.items.filter((i) => i.id !== localId) } : f,
        ),
      );
      return;
    }
    setFases((prev) =>
      prev.map((f) =>
        f.id === fase.id
          ? {
              ...f,
              items: f.items.map((i) =>
                i.id === localId
                  ? {
                      ...i,
                      id: res.data.id,
                      // ⚠ Preservá el texto que el user pudo tipear mientras el insert
                      // estaba en vuelo. NO hardcodear "Nuevo ítem".
                      _persisted: true,
                      _updated_at: Date.now(),
                    }
                  : i,
              ),
            }
          : f,
      ),
    );
  }

  async function handleItemTextSave(item: LocalItem) {
    if (!item._persisted) return;
    const res = await upsertItem({
      id: item.id,
      fase_id: item.fase_id,
      proyecto_id: proyecto.id,
      texto: item.texto,
    });
    if (!res.ok) {
      toast.error(res.error);
      router.refresh();
    }
  }

  async function handleItemToggle(faseId: string, item: LocalItem) {
    const nextCompletado = !item.completado;
    // Optimistic
    setFases((prev) =>
      prev.map((f) =>
        f.id === faseId
          ? {
              ...f,
              items: f.items.map((i) =>
                i.id === item.id
                  ? { ...i, completado: nextCompletado, _updated_at: Date.now() }
                  : i,
              ),
            }
          : f,
      ),
    );
    const res = await upsertItem({
      id: item.id,
      fase_id: item.fase_id,
      proyecto_id: proyecto.id,
      texto: item.texto,
      completado: nextCompletado,
    });
    if (!res.ok) {
      toast.error(res.error);
      // revertir
      setFases((prev) =>
        prev.map((f) =>
          f.id === faseId
            ? {
                ...f,
                items: f.items.map((i) =>
                  i.id === item.id
                    ? { ...i, completado: !nextCompletado, _updated_at: Date.now() }
                    : i,
                ),
              }
            : f,
        ),
      );
    }
  }

  async function handleItemDelete(faseId: string, itemId: string) {
    const prev = fases;
    setFases((p) =>
      p.map((f) =>
        f.id === faseId ? { ...f, items: f.items.filter((i) => i.id !== itemId) } : f,
      ),
    );
    const res = await deleteItem({ id: itemId, proyecto_id: proyecto.id });
    if (!res.ok) {
      toast.error(res.error);
      setFases(prev);
    }
  }

  // ─── Token ────────────────────────────────────────────────────────────────

  const publicUrl = token ? getPublicUrl(token.token) : null;

  async function copyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  async function doRegenerate() {
    setRegenConfirm(false);
    const res = await regenerateToken(proyecto.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setToken({
      token: res.data.token,
      proyecto_id: proyecto.id,
      activo: true,
      created_at: new Date().toISOString(),
      expires_at: null,
      last_accessed_at: null,
      access_count: 0,
    });
    toast.success("Link regenerado");
  }

  async function doToggleToken(nextActivo: boolean) {
    if (!token) return;
    const prev = token;
    setToken({ ...token, activo: nextActivo });
    const res = await toggleTokenActivo(token.token, nextActivo);
    if (!res.ok) {
      toast.error(res.error);
      setToken(prev);
    } else {
      toast.success(nextActivo ? "Link activado" : "Link desactivado");
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const total = fases.length;
  const done = fases.filter((f) => f.estado === "done").length;

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-5 sm:px-7 py-6">
      <div className="flex items-start gap-3 flex-wrap mb-5">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-t3)] hover:text-[var(--color-t1)] transition-colors mt-2"
        >
          <ArrowLeft size={13} />
          Clientes
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[22px] font-semibold text-[var(--color-t1)]">
              {cliente?.nombre ?? proyecto.nombre}
            </h1>
            {cliente?.empresa ? (
              <span className="text-[12px] text-[var(--color-t3)]">
                · {cliente.empresa}
              </span>
            ) : null}
          </div>
          {proyecto.subtitulo ? (
            <p className="text-[13px] text-[var(--color-t3)] mt-0.5">
              {proyecto.subtitulo}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {cliente ? (
            <Button
              variant="secondary"
              onClick={() => setEditingCliente(true)}
            >
              <Pencil size={13} />
              Editar datos
            </Button>
          ) : null}
          {publicUrl && token?.activo ? (
            <Button
              variant="secondary"
              onClick={() => window.open(publicUrl, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink size={13} />
              Ver como cliente
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
        {/* LEFT */}
        <div className="min-w-0">
          {/* Link público */}
          <PublicLinkCard
            token={token}
            url={publicUrl}
            onCopy={copyLink}
            onRegenerate={() => setRegenConfirm(true)}
            onToggleActivo={doToggleToken}
          />

          {/* Datos del cliente */}
          {cliente ? (
            <ClienteCard
              cliente={cliente}
              onEdit={() => setEditingCliente(true)}
            />
          ) : null}

          {/* Progreso */}
          <div className="mt-4 mb-5 rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium text-[var(--color-t2)]">
                Progreso del roadmap
              </span>
              <span className="text-[11px] text-[var(--color-t3)]">
                {done} / {total} fases completadas
              </span>
            </div>
            <ProgressBar value={done} total={total} />
          </div>

          {/* Fases */}
          <div className="space-y-3">
            {fases.map((fase, idx) => (
              <FaseCard
                key={fase.id}
                fase={fase}
                index={idx}
                isFirst={idx === 0}
                isLast={idx === fases.length - 1}
                onFieldChange={(patch) => handleFaseFieldSave(fase, patch)}
                onEstadoChange={(estado) => handleEstadoChange(fase, estado)}
                onReorder={(dir) => handleReorder(fase.id, dir)}
                onAddItem={() => handleAddItem(fase)}
                onItemTextSave={(item) => handleItemTextSave(item)}
                onItemToggle={(item) => handleItemToggle(fase.id, item)}
                onItemDelete={(itemId) => handleItemDelete(fase.id, itemId)}
                onItemLocalChange={(itemId, texto) => {
                  setFases((prev) =>
                    prev.map((f) =>
                      f.id === fase.id
                        ? {
                            ...f,
                            items: f.items.map((i) =>
                              i.id === itemId
                                ? { ...i, texto, _updated_at: Date.now() }
                                : i,
                            ),
                          }
                        : f,
                    ),
                  );
                }}
                onDelete={() => setDeletingFaseId(fase.id)}
              />
            ))}
            <button
              type="button"
              onClick={handleAddFase}
              className="w-full py-3.5 border border-dashed border-[var(--color-b1)] rounded-[10px] text-[13px] text-[var(--color-t3)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand-muted)] transition-all flex items-center justify-center gap-1.5"
            >
              <Plus size={14} />
              Agregar fase
            </button>
          </div>

          {/* Personalización del cliente */}
          <div className="mt-6">
            <BrandingSection
              proyectoId={proyecto.id}
              initialLogoUrl={proyecto.brand_logo_url}
              initialColors={proyecto.brand_colors}
            />
          </div>
        </div>

        {/* RIGHT */}
        <aside className="space-y-4 xl:sticky xl:top-[72px] self-start xl:max-h-[calc(100vh-90px)] xl:overflow-y-auto xl:pb-4">
          <ProyectoMetaCard
            proyecto={proyecto}
            pms={pms}
            onUpdate={async (patch) => {
              const res = await updateProyectoMeta({ id: proyecto.id, ...patch });
              if (!res.ok) {
                toast.error(res.error);
              } else {
                toast.success("Guardado");
              }
            }}
          />
          <NotasInternasCard
            proyectoId={proyecto.id}
            initial={proyecto.notas_internas ?? ""}
          />
          <EventosCard eventos={eventos} />
          <div className="rounded-[10px] border border-[rgba(248,113,113,0.2)] bg-[var(--color-danger-muted)] p-4">
            <h3 className="text-[13px] font-semibold text-[var(--color-danger)] mb-1.5">
              Zona peligrosa
            </h3>
            <p className="text-[11px] text-[var(--color-t3)] mb-3 leading-relaxed">
              Eliminar el roadmap borra fases, ítems, eventos y tokens. No se puede deshacer.
            </p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setDeletingProyecto(true)}
            >
              <Trash2 size={13} />
              Eliminar roadmap
            </Button>
          </div>
        </aside>
      </div>

      {/* Confirmations */}
      <ConfirmDialog
        open={!!deletingFaseId}
        onClose={() => setDeletingFaseId(null)}
        onConfirm={() => {
          if (deletingFaseId) handleDeleteFase(deletingFaseId);
        }}
        title="¿Eliminar esta fase?"
        description="Se borrarán también todos sus ítems. Esta acción no se puede deshacer."
        confirmLabel="Eliminar fase"
      />
      <ConfirmDialog
        open={deletingProyecto}
        onClose={() => setDeletingProyecto(false)}
        onConfirm={async () => {
          try {
            await deleteProyectoAndRedirect(proyecto.id);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
            setDeletingProyecto(false);
          }
        }}
        title="¿Eliminar roadmap?"
        description="Se borra el proyecto y todo su contenido de forma definitiva."
        confirmLabel="Eliminar todo"
      />
      <ConfirmDialog
        open={regenConfirm}
        onClose={() => setRegenConfirm(false)}
        onConfirm={doRegenerate}
        title="¿Regenerar link público?"
        description="El link actual dejará de funcionar. Tendrás que compartir el nuevo link con el cliente."
        confirmLabel="Regenerar"
        variant="primary"
      />
      {cliente ? (
        <ClientEditDialog
          open={editingCliente}
          onClose={() => setEditingCliente(false)}
          cliente={cliente}
          onSaved={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function PublicLinkCard({
  token,
  url,
  onCopy,
  onRegenerate,
  onToggleActivo,
}: {
  token: RoadmapTokenPublico | null;
  url: string | null;
  onCopy: () => void;
  onRegenerate: () => void;
  onToggleActivo: (next: boolean) => void;
}) {
  if (!token || !url) {
    return (
      <div className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-4 text-[13px] text-[var(--color-t3)] flex items-center gap-2">
        <LinkIcon size={14} />
        Este proyecto no tiene link público todavía.
        <button
          onClick={onRegenerate}
          className="text-[var(--color-brand)] hover:underline ml-auto text-[12px]"
        >
          Generar link
        </button>
      </div>
    );
  }
  const activo = token.activo;
  return (
    <div
      className={cn(
        "rounded-[10px] border bg-[var(--color-s1)] p-3.5",
        activo ? "border-[var(--color-b1)]" : "border-[var(--color-b1)] opacity-80",
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <LinkIcon size={14} className="text-[var(--color-info)]" />
        <span className="text-[12px] font-medium text-[var(--color-t2)]">
          Link público del cliente
        </span>
        <span
          className={cn(
            "ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full border",
            activo
              ? "bg-[var(--color-brand-muted)] border-[var(--color-brand-border)] text-[var(--color-brand)]"
              : "bg-[var(--color-s3)] border-[var(--color-b1)] text-[var(--color-t3)]",
          )}
        >
          {activo ? "Activo" : "Desactivado"}
        </span>
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2">
        <code className="flex-1 min-w-0 text-[12px] text-[var(--color-info)] bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[7px] px-3 py-2 font-mono break-all leading-[1.45]">
          {url}
        </code>
        <div className="grid grid-cols-3 gap-2 md:flex md:grid-cols-none md:gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center justify-center gap-1.5 h-10 px-3 text-[12px] font-medium rounded-[7px] border border-[var(--color-b1)] text-[var(--color-t2)] hover:border-[var(--color-b2)] hover:text-[var(--color-t1)] hover:bg-[var(--color-s2)] transition-all md:h-9"
            aria-label="Copiar link"
          >
            <Copy size={13} /> Copiar
          </button>
          <button
            type="button"
            onClick={() => onToggleActivo(!activo)}
            className="inline-flex items-center justify-center gap-1.5 h-10 px-3 text-[12px] font-medium rounded-[7px] border border-[var(--color-b1)] text-[var(--color-t2)] hover:border-[var(--color-b2)] hover:text-[var(--color-t1)] hover:bg-[var(--color-s2)] transition-all md:h-9"
            aria-label={activo ? "Desactivar link" : "Activar link"}
          >
            {activo ? <X size={13} /> : <Check size={13} />}
            <span>{activo ? "Desactivar" : "Activar"}</span>
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex items-center justify-center gap-1.5 h-10 px-3 text-[12px] font-medium rounded-[7px] border border-[var(--color-b1)] text-[var(--color-t2)] hover:border-[var(--color-b2)] hover:text-[var(--color-t1)] hover:bg-[var(--color-s2)] transition-all md:h-9"
            aria-label="Regenerar link"
          >
            <RefreshCcw size={13} /> Regenerar
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2.5 text-[11px] text-[var(--color-t3)]">
        {token.access_count > 0 ? (
          <span>{token.access_count} accesos</span>
        ) : (
          <span>Aún no fue visto</span>
        )}
        {token.last_accessed_at ? (
          <span>· última visita {relativeTime(token.last_accessed_at)}</span>
        ) : null}
      </div>
    </div>
  );
}

function ClienteCard({
  cliente,
  onEdit,
}: {
  cliente: Cliente;
  onEdit: () => void;
}) {
  const hasAnyContact =
    !!cliente.email || !!cliente.telefono || !!cliente.rubro || !!cliente.empresa;
  return (
    <div className="mt-4 rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 h-9 w-9 rounded-full bg-[var(--color-s3)] border border-[var(--color-b1)] flex items-center justify-center text-[var(--color-t2)]">
          <User size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[var(--color-t1)] truncate">
              {cliente.nombre}
            </span>
            {cliente.empresa ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-t3)]">
                <Building2 size={10} />
                {cliente.empresa}
              </span>
            ) : null}
          </div>
          {hasAnyContact ? (
            <div className="mt-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-[var(--color-t3)]">
              {cliente.email ? (
                <a
                  href={`mailto:${cliente.email}`}
                  className="inline-flex items-center gap-1 hover:text-[var(--color-info)] transition-colors"
                >
                  <Mail size={10} />
                  {cliente.email}
                </a>
              ) : null}
              {cliente.telefono ? (
                <a
                  href={`tel:${cliente.telefono.replace(/\s+/g, "")}`}
                  className="inline-flex items-center gap-1 hover:text-[var(--color-info)] transition-colors"
                >
                  <Phone size={10} />
                  {cliente.telefono}
                </a>
              ) : null}
              {cliente.rubro ? (
                <span className="inline-flex items-center gap-1">
                  <Tag size={10} />
                  {cliente.rubro}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-[var(--color-t3)]">
              Sin datos de contacto cargados.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[7px] border border-[var(--color-b1)] text-[var(--color-t2)] hover:border-[var(--color-b2)] hover:text-[var(--color-t1)] hover:bg-[var(--color-s2)] transition-all flex-shrink-0"
        >
          <Pencil size={12} />
          Editar datos
        </button>
      </div>
    </div>
  );
}

function FaseCard({
  fase,
  index,
  isFirst,
  isLast,
  onFieldChange,
  onEstadoChange,
  onReorder,
  onAddItem,
  onItemTextSave,
  onItemToggle,
  onItemDelete,
  onItemLocalChange,
  onDelete,
}: {
  fase: LocalFase;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onFieldChange: (patch: Partial<LocalFase>) => void;
  onEstadoChange: (estado: FaseEstado) => void;
  onReorder: (dir: "up" | "down") => void;
  onAddItem: () => void;
  onItemTextSave: (item: LocalItem) => void;
  onItemToggle: (item: LocalItem) => void;
  onItemDelete: (id: string) => void;
  onItemLocalChange: (id: string, texto: string) => void;
  onDelete: () => void;
}) {
  const [titulo, setTitulo] = useState(fase.titulo);
  const [descripcion, setDescripcion] = useState(fase.descripcion);
  const tituloTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tituloInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLTextAreaElement>(null);

  // Sync con realtime SOLO si el input no está enfocado — no interrumpimos
  // al usuario mientras tipea.
  useEffect(() => {
    if (document.activeElement === tituloInputRef.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitulo(fase.titulo);
  }, [fase.titulo]);
  useEffect(() => {
    if (document.activeElement === descInputRef.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDescripcion(fase.descripcion);
  }, [fase.descripcion]);

  // Flush de pending saves antes de unmount / navegar.
  useEffect(() => {
    return () => {
      if (tituloTimer.current) {
        clearTimeout(tituloTimer.current);
        tituloTimer.current = null;
      }
      if (descTimer.current) {
        clearTimeout(descTimer.current);
        descTimer.current = null;
      }
    };
  }, []);

  function debounceField(field: "titulo" | "descripcion", value: string) {
    if (field === "titulo") {
      if (tituloTimer.current) clearTimeout(tituloTimer.current);
      tituloTimer.current = setTimeout(() => onFieldChange({ titulo: value }), 400);
    } else {
      if (descTimer.current) clearTimeout(descTimer.current);
      descTimer.current = setTimeout(() => onFieldChange({ descripcion: value }), 400);
    }
  }

  return (
    <div className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-5 hover:border-[var(--color-b2)] transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onReorder("up")}
            disabled={isFirst}
            aria-label="Mover arriba"
            className="h-5 w-5 rounded flex items-center justify-center text-[var(--color-t3)] hover:bg-[var(--color-s2)] hover:text-[var(--color-t1)] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            onClick={() => onReorder("down")}
            disabled={isLast}
            aria-label="Mover abajo"
            className="h-5 w-5 rounded flex items-center justify-center text-[var(--color-t3)] hover:bg-[var(--color-s2)] hover:text-[var(--color-t1)] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronDown size={13} />
          </button>
        </div>
        <span className="text-[11px] font-semibold text-[var(--color-t3)] uppercase tracking-wider min-w-[46px]">
          Fase {index + 1}
        </span>
        <input
          ref={tituloInputRef}
          value={titulo}
          onChange={(e) => {
            setTitulo(e.target.value);
            debounceField("titulo", e.target.value);
          }}
          onBlur={() => {
            if (tituloTimer.current) clearTimeout(tituloTimer.current);
            if (titulo !== fase.titulo) onFieldChange({ titulo });
          }}
          placeholder="Título de la fase"
          className="flex-1 bg-transparent border-b border-transparent focus:border-[var(--color-info)] hover:border-[var(--color-b1)] text-[15px] font-medium text-[var(--color-t1)] py-1 outline-none transition-colors min-w-0"
        />
        <button
          type="button"
          onClick={onDelete}
          aria-label="Eliminar fase"
          className="h-7 w-7 rounded flex items-center justify-center text-[var(--color-t3)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex gap-1.5 mb-3 pl-[58px] flex-wrap">
        {(["done", "active", "pending"] as const).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onEstadoChange(e)}
            className={cn(
              "text-[11px] font-medium px-3 py-1 rounded-[6px] border transition-all",
              e === fase.estado
                ? e === "done"
                  ? "bg-[var(--color-brand-muted)] border-[var(--color-brand-border)] text-[var(--color-brand)]"
                  : e === "active"
                    ? "bg-[var(--color-info-muted)] border-[var(--color-info-border)] text-[var(--color-info)]"
                    : "bg-[var(--color-s3)] border-[var(--color-b2)] text-[var(--color-t2)]"
                : "bg-transparent border-[var(--color-b1)] text-[var(--color-t3)] hover:border-[var(--color-b2)] hover:text-[var(--color-t2)]",
            )}
          >
            {e === "done" ? "Completada" : e === "active" ? "En curso" : "Pendiente"}
          </button>
        ))}
      </div>

      <Textarea
        ref={descInputRef}
        value={descripcion}
        onChange={(e) => {
          setDescripcion(e.target.value);
          debounceField("descripcion", e.target.value);
        }}
        onBlur={() => {
          if (descTimer.current) clearTimeout(descTimer.current);
          if (descripcion !== fase.descripcion) onFieldChange({ descripcion });
        }}
        placeholder="Descripción para el cliente…"
      />

      <div className="mt-3.5 pt-3.5 border-t border-[var(--color-b1)]">
        <div className="text-[10px] font-semibold text-[var(--color-t3)] uppercase tracking-wider mb-2">
          Ítems ({fase.items.length})
        </div>
        <div className="space-y-1.5">
          {fase.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onTextChange={(v) => onItemLocalChange(item.id, v)}
              onTextSave={() => onItemTextSave(item)}
              onToggle={() => onItemToggle(item)}
              onDelete={() => onItemDelete(item.id)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onAddItem}
          className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-[var(--color-t3)] border border-dashed border-[var(--color-b1)] rounded-[6px] px-3 py-1.5 hover:border-[var(--color-info)] hover:text-[var(--color-info)] transition-colors"
        >
          <Plus size={12} />
          Agregar ítem
        </button>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  onTextChange,
  onTextSave,
  onToggle,
  onDelete,
}: {
  item: LocalItem;
  onTextChange: (v: string) => void;
  onTextSave: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastPropTextRef = useRef(item.texto);

  // Sincroniza el value del input cuando el prop texto cambia desde fuera
  // (realtime, insert complete, otro admin) — PERO solo si el input NO está
  // enfocado. Así nunca interrumpimos al usuario que está tipeando.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (lastPropTextRef.current === item.texto) return;
    el.value = item.texto;
    lastPropTextRef.current = item.texto;
  }, [item.texto]);

  // Flush pendiente antes de unmount (evita perder el último change al
  // cambiar de fase / eliminar / navegar).
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        onTextSave();
      }
    };
    // onTextSave es recreado cada render; no lo incluimos a propósito para
    // que el cleanup solo corra al unmount real.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.completado ? "Marcar pendiente" : "Marcar completado"}
        className={cn(
          "w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center flex-shrink-0 transition-all",
          item.completado
            ? "bg-[var(--color-brand-muted)] border-[var(--color-brand-border)] text-[var(--color-brand)]"
            : "border-[var(--color-b2)] text-transparent hover:border-[var(--color-b3)]",
        )}
      >
        <Check size={10} strokeWidth={3} />
      </button>
      <input
        ref={inputRef}
        defaultValue={item.texto}
        onChange={(e) => {
          const v = e.target.value;
          lastPropTextRef.current = v;
          onTextChange(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(onTextSave, 350);
        }}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          onTextSave();
        }}
        placeholder="Describí el ítem…"
        className={cn(
          "flex-1 bg-transparent border-b border-transparent hover:border-[var(--color-b1)] focus:border-[var(--color-info)] text-[13px] py-1 outline-none transition-colors",
          item.completado ? "text-[var(--color-t3)] line-through" : "text-[var(--color-t2)] focus:text-[var(--color-t1)]",
        )}
      />
      <button
        type="button"
        onClick={onDelete}
        aria-label="Eliminar ítem"
        className="h-6 w-6 rounded flex items-center justify-center text-[var(--color-t3)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] transition-colors"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function ProyectoMetaCard({
  proyecto,
  pms,
  onUpdate,
}: {
  proyecto: RoadmapProyecto;
  pms: Profile[];
  onUpdate: (patch: {
    nombre?: string;
    subtitulo?: string | null;
    estado?: "activo" | "pausado" | "completado" | "cancelado";
    fecha_inicio?: string;
    fecha_estimada_fin?: string | null;
    pm_id?: string | null;
  }) => Promise<void>;
}) {
  const [nombre, setNombre] = useState(proyecto.nombre);
  const [subtitulo, setSubtitulo] = useState(proyecto.subtitulo ?? "");
  const [estado, setEstado] = useState<RoadmapProyecto["estado"]>(proyecto.estado);
  const [fechaInicio, setFechaInicio] = useState(proyecto.fecha_inicio ?? "");
  const [fechaFin, setFechaFin] = useState(proyecto.fecha_estimada_fin ?? "");
  const [pmId, setPmId] = useState(proyecto.pm_id ?? "");
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await onUpdate({
        nombre: nombre.trim() || proyecto.nombre,
        subtitulo: subtitulo.trim() ? subtitulo.trim() : null,
        estado,
        fecha_inicio: fechaInicio || proyecto.fecha_inicio,
        fecha_estimada_fin: fechaFin || null,
        pm_id: pmId || null,
      });
    });
  }

  return (
    <div className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-4">
      <h3 className="text-[12px] font-semibold text-[var(--color-t2)] uppercase tracking-wider mb-3">
        Metadata
      </h3>
      <div className="space-y-3">
        <div>
          <Label htmlFor="meta-nombre">Nombre</Label>
          <Input
            id="meta-nombre"
            value={nombre}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNombre(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="meta-sub">Subtítulo</Label>
          <Input
            id="meta-sub"
            value={subtitulo}
            onChange={(e) => setSubtitulo(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="meta-estado">Estado</Label>
          <select
            id="meta-estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value as RoadmapProyecto["estado"])}
            className="w-full bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[8px] text-sm text-[var(--color-t1)] px-3.5 py-2.5 focus:outline-none focus:border-[var(--color-info)]"
          >
            <option value="activo">Activo</option>
            <option value="pausado">Pausado</option>
            <option value="completado">Completado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="meta-ini">Inicio</Label>
            <Input
              id="meta-ini"
              type="date"
              value={fechaInicio?.slice(0, 10) ?? ""}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="meta-fin">Fin estimado</Label>
            <Input
              id="meta-fin"
              type="date"
              value={fechaFin?.slice(0, 10) ?? ""}
              onChange={(e) => setFechaFin(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="meta-pm">Project manager</Label>
          <select
            id="meta-pm"
            value={pmId}
            onChange={(e) => setPmId(e.target.value)}
            className="w-full bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[8px] text-sm text-[var(--color-t1)] px-3.5 py-2.5 focus:outline-none focus:border-[var(--color-info)]"
          >
            <option value="">Sin asignar</option>
            {pms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre ?? p.email ?? p.id}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-[var(--color-t3)]">
            Creado {formatDate(proyecto.created_at)}
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={save}
            loading={isPending}
          >
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}

function NotasInternasCard({
  proyectoId,
  initial,
}: {
  proyectoId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleSave(next: string) {
    setValue(next);
    setSaving("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await updateProyectoMeta({
        id: proyectoId,
        notas_internas: next,
      });
      if (!res.ok) {
        toast.error(res.error);
        setSaving("idle");
      } else {
        setSaving("saved");
        setTimeout(() => setSaving("idle"), 1500);
      }
    }, 1200);
  }

  return (
    <div className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-4">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-[12px] font-semibold text-[var(--color-t2)] uppercase tracking-wider">
          Notas internas
        </h3>
        <span
          className={cn(
            "text-[10px] transition-opacity flex items-center gap-1",
            saving === "idle" && "opacity-0",
            saving === "saving" && "text-[var(--color-warn)]",
            saving === "saved" && "text-[var(--color-brand)]",
          )}
        >
          {saving === "saving" ? (
            <>
              <Loader2 size={10} className="animate-spin" />
              Guardando
            </>
          ) : saving === "saved" ? (
            <>
              <Check size={10} />
              Guardado
            </>
          ) : null}
        </span>
      </div>
      <Textarea
        value={value}
        onChange={(e) => scheduleSave(e.target.value)}
        placeholder="Observaciones internas del equipo (no visibles para el cliente)…"
        className="min-h-[90px]"
      />
      <p className="text-[11px] text-[var(--color-t3)] mt-1.5">
        Solo visibles para el equipo Codexy.
      </p>
    </div>
  );
}

function EventosCard({ eventos }: { eventos: RoadmapEvento[] }) {
  if (eventos.length === 0) {
    return (
      <div className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-4">
        <h3 className="text-[12px] font-semibold text-[var(--color-t2)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
          <History size={12} />
          Actividad reciente
        </h3>
        <p className="text-[12px] text-[var(--color-t3)]">Sin actividad registrada.</p>
      </div>
    );
  }
  return (
    <div className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-4">
      <h3 className="text-[12px] font-semibold text-[var(--color-t2)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
        <History size={12} />
        Actividad reciente
      </h3>
      <ol className="space-y-2.5">
        {eventos.map((ev) => (
          <li key={ev.id} className="text-[12px] text-[var(--color-t2)] flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-info)] mt-1.5 flex-shrink-0" />
            <div className="min-w-0">
              <div className="truncate">{ev.mensaje ?? ev.tipo}</div>
              <div className="text-[10px] text-[var(--color-t3)] mt-0.5">
                {ev.actor_nombre ? `${ev.actor_nombre} · ` : ""}
                {relativeTime(ev.created_at)}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

