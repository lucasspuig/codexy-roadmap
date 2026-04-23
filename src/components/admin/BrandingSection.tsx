"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  Camera,
  Check,
  Loader2,
  Palette,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/Dialog";
import {
  removeBrandLogo,
  updateBranding,
  uploadBrandLogo,
} from "@/app/(admin)/proyectos/actions";
import { cn } from "@/lib/utils";
import type { BrandColors } from "@/types/database";

const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

type ColorKey = keyof BrandColors;

const COLOR_DEFAULTS: Record<ColorKey, string> = {
  primary: "#1d5fa6",
  accent: "#1a6b4a",
  bg: "#f7f5f1",
  text: "#1a1816",
};

const COLOR_LABELS: Record<ColorKey, { label: string; hint: string }> = {
  primary: { label: "Primary", hint: "Títulos y acento principal" },
  accent: { label: "Accent", hint: "Fases completadas y progreso" },
  bg: { label: "Background", hint: "Fondo de la página pública" },
  text: { label: "Text", hint: "Color de texto principal" },
};

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

function normalizeHex(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withHash = v.startsWith("#") ? v : `#${v}`;
  if (!HEX_REGEX.test(withHash)) return null;
  return withHash.toLowerCase();
}

function sameColors(a: BrandColors | null, b: BrandColors | null): boolean {
  const ka = a ? Object.keys(a).filter((k) => a[k as ColorKey]) : [];
  const kb = b ? Object.keys(b).filter((k) => b![k as ColorKey]) : [];
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if ((a![k as ColorKey] ?? "") !== (b![k as ColorKey] ?? "")) return false;
  }
  return true;
}

export interface BrandingSectionProps {
  proyectoId: string;
  initialLogoUrl: string | null;
  initialColors: BrandColors | null;
}

export function BrandingSection({
  proyectoId,
  initialLogoUrl,
  initialColors,
}: BrandingSectionProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [colors, setColors] = useState<BrandColors>(() => ({ ...(initialColors ?? {}) }));
  const [initialColorsState, setInitialColorsState] = useState<BrandColors | null>(
    initialColors,
  );
  const [savingColors, setSavingColors] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Mantener el estado sincronizado si cambia desde el servidor
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLogoUrl(initialLogoUrl);
  }, [initialLogoUrl]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColors({ ...(initialColors ?? {}) });
    setInitialColorsState(initialColors);
  }, [initialColors]);

  const dirty = useMemo(() => {
    const current = Object.keys(colors).length === 0 ? null : colors;
    return !sameColors(initialColorsState, current);
  }, [colors, initialColorsState]);

  const hasAnyColor = useMemo(
    () => Object.values(colors).some((v) => !!v),
    [colors],
  );

  // ─── Logo handlers ────────────────────────────────────────────────────────
  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_MIME.includes(file.type)) {
      return "Formato no permitido. Usá PNG, JPG, WEBP o SVG.";
    }
    if (file.size > MAX_BYTES) {
      return "El logo supera 2 MB.";
    }
    return null;
  }, []);

  const doUpload = useCallback(
    async (file: File) => {
      const err = validateFile(file);
      if (err) {
        toast.error(err);
        return;
      }
      setUploading(true);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("proyecto_id", proyectoId);
      const res = await uploadBrandLogo(fd);
      setUploading(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setLogoUrl(res.data.url);
      toast.success("Logo actualizado");
    },
    [proyectoId, validateFile],
  );

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void doUpload(file);
    // Permitir re-seleccionar el mismo archivo
    e.target.value = "";
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void doUpload(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!uploading) setDragOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
  }

  async function handleRemoveLogo() {
    setConfirmRemove(false);
    setRemoving(true);
    const res = await removeBrandLogo({ proyecto_id: proyectoId });
    setRemoving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setLogoUrl(null);
    toast.success("Logo eliminado");
  }

  // ─── Color handlers ───────────────────────────────────────────────────────
  function setColor(key: ColorKey, value: string) {
    const normalized = normalizeHex(value);
    setColors((prev) => {
      const next: BrandColors = { ...prev };
      if (normalized) {
        next[key] = normalized;
      } else {
        delete next[key];
      }
      return next;
    });
  }

  function clearColor(key: ColorKey) {
    setColors((prev) => {
      const next: BrandColors = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleSaveColors() {
    setSavingColors(true);
    const payload = hasAnyColor ? colors : null;
    const res = await updateBranding({
      proyecto_id: proyectoId,
      colors: payload,
    });
    setSavingColors(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setInitialColorsState(payload);
    toast.success("Personalización guardada");
  }

  function resetAllColors() {
    setColors({ ...(initialColorsState ?? {}) });
  }

  const previewColors = useMemo(
    () => ({
      primary: colors.primary || COLOR_DEFAULTS.primary,
      accent: colors.accent || COLOR_DEFAULTS.accent,
      bg: colors.bg || COLOR_DEFAULTS.bg,
      text: colors.text || COLOR_DEFAULTS.text,
    }),
    [colors],
  );

  return (
    <div className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-5">
      <div className="flex items-center gap-2 mb-1">
        <Palette size={14} className="text-[var(--color-info)]" />
        <h3 className="text-[13px] font-semibold text-[var(--color-t1)]">
          Personalización del cliente
        </h3>
        {dirty ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-warn)]/10 border border-[var(--color-warn)]/30 text-[var(--color-warn)]">
            Cambios sin guardar
          </span>
        ) : null}
      </div>
      <p className="text-[12px] text-[var(--color-t3)] mb-4 leading-relaxed">
        Subí el logo del cliente y definí su paleta de colores para la vista pública.
      </p>

      {!logoUrl && !hasAnyColor ? (
        <div className="mb-4 rounded-[8px] border border-dashed border-[var(--color-b1)] bg-[var(--color-s2)]/40 px-3 py-2 text-[11px] text-[var(--color-t3)]">
          Se aplicará la paleta Codexy por defecto.
        </div>
      ) : null}

      {/* ── LOGO ──────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-[var(--color-t2)] uppercase tracking-wider">
            Logo
          </span>
          {logoUrl ? (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              disabled={removing || uploading}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--color-danger)] hover:brightness-125 disabled:opacity-50 transition-colors"
            >
              <Trash2 size={11} /> Eliminar logo
            </button>
          ) : null}
        </div>

        <LogoUploader
          logoUrl={logoUrl}
          uploading={uploading}
          dragOver={dragOver}
          onPick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          onChange={handleFileChange}
        />
        <p className="mt-2 text-[11px] text-[var(--color-t3)]">
          PNG, JPG, WEBP o SVG · máx. 2 MB · se aplica inmediatamente
        </p>
      </div>

      {/* ── COLORES + PREVIEW ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-[var(--color-t2)] uppercase tracking-wider">
              Paleta
            </span>
            {dirty ? (
              <button
                type="button"
                onClick={resetAllColors}
                className="inline-flex items-center gap-1 text-[11px] text-[var(--color-t3)] hover:text-[var(--color-t1)] transition-colors"
              >
                <RotateCcw size={11} /> Descartar cambios
              </button>
            ) : null}
          </div>
          <div className="space-y-2.5">
            {(["primary", "accent", "bg", "text"] as const).map((key) => (
              <ColorRow
                key={key}
                colorKey={key}
                value={colors[key]}
                placeholder={COLOR_DEFAULTS[key]}
                onChange={(v) => setColor(key, v)}
                onClear={() => clearColor(key)}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2">
            <span className="text-[11px] font-semibold text-[var(--color-t2)] uppercase tracking-wider">
              Preview
            </span>
          </div>
          <ColorPreview colors={previewColors} />
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-[var(--color-b1)] flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[11px] text-[var(--color-t3)]">
          Los cambios en colores se aplican al guardar.
        </span>
        <Button
          variant="primary"
          size="md"
          onClick={handleSaveColors}
          loading={savingColors}
          disabled={!dirty || savingColors}
        >
          <Check size={13} /> Guardar personalización
        </Button>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={handleRemoveLogo}
        title="¿Eliminar logo del cliente?"
        description="Se volverá a mostrar el logo de Codexy en la vista pública."
        confirmLabel="Eliminar logo"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function LogoUploader({
  logoUrl,
  uploading,
  dragOver,
  onPick,
  onDrop,
  onDragOver,
  onDragLeave,
}: {
  logoUrl: string | null;
  uploading: boolean;
  dragOver: boolean;
  onPick: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onPick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
      aria-label={logoUrl ? "Cambiar logo del cliente" : "Subir logo del cliente"}
      className={cn(
        "relative rounded-[10px] border-2 border-dashed transition-all duration-150 overflow-hidden cursor-pointer",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-info)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-s1)]",
        dragOver
          ? "border-[var(--color-info)] bg-[var(--color-info-muted)]"
          : "border-[var(--color-b1)] bg-[var(--color-s2)]/60 hover:border-[var(--color-b2)] hover:bg-[var(--color-s2)]",
      )}
      style={{ minHeight: 140 }}
    >
      {logoUrl ? (
        <div className="flex flex-col items-center justify-center py-5 px-4 gap-2.5">
          <div className="relative bg-white rounded-[8px] p-3 shadow-sm flex items-center justify-center w-[120px] h-[80px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="Logo del cliente"
              className="max-w-full max-h-full object-contain"
            />
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-t3)]">
            <Camera size={11} />
            Click o arrastrá para reemplazar
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 px-4 gap-2 text-center">
          <div className="w-10 h-10 rounded-full bg-[var(--color-s3)] flex items-center justify-center text-[var(--color-t3)]">
            <Upload size={16} />
          </div>
          <div className="text-[12px] text-[var(--color-t2)]">
            Click para subir o arrastrá un archivo aquí
          </div>
          <div className="text-[10px] text-[var(--color-t3)]">
            PNG, JPG, WEBP o SVG · máx. 2 MB
          </div>
        </div>
      )}

      {uploading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-s1)]/80 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 text-[12px] text-[var(--color-t1)]">
            <Loader2 size={14} className="animate-spin" /> Subiendo…
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ColorRow({
  colorKey,
  value,
  placeholder,
  onChange,
  onClear,
}: {
  colorKey: ColorKey;
  value: string | undefined;
  placeholder: string;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  const meta = COLOR_LABELS[colorKey];
  const [draft, setDraft] = useState(value ?? "");
  const id = `color-${colorKey}`;
  const pickerId = `color-picker-${colorKey}`;

  // Sync draft cuando cambia el value controlado desde afuera
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(value ?? "");
  }, [value]);

  const effective = value || placeholder;

  return (
    <div className="flex items-center gap-3">
      <label
        htmlFor={pickerId}
        aria-label={`Abrir selector de color para ${meta.label}`}
        className="relative group cursor-pointer flex-shrink-0"
      >
        <span
          className="block w-10 h-10 rounded-[8px] border border-[var(--color-b1)] shadow-inner group-hover:border-[var(--color-b2)] transition-colors"
          style={{ backgroundColor: effective }}
          aria-hidden="true"
        />
        {!value ? (
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-white/80 pointer-events-none">
            auto
          </span>
        ) : null}
        <input
          id={pickerId}
          type="color"
          value={effective}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
          aria-describedby={`${id}-hint`}
        />
      </label>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <label
            htmlFor={id}
            className="text-[12px] font-medium text-[var(--color-t1)]"
          >
            {meta.label}
          </label>
          <span id={`${id}-hint`} className="text-[11px] text-[var(--color-t3)]">
            — {meta.hint}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <input
            id={id}
            type="text"
            value={draft}
            placeholder={placeholder}
            maxLength={7}
            spellCheck={false}
            onChange={(e) => {
              const v = e.target.value;
              setDraft(v);
              const normalized = normalizeHex(v);
              if (normalized) onChange(normalized);
            }}
            onBlur={() => {
              const normalized = normalizeHex(draft);
              if (normalized) {
                setDraft(normalized);
                onChange(normalized);
              } else if (!draft.trim()) {
                onClear();
              } else {
                // Si es inválido, restaurar al último valor válido
                setDraft(value ?? "");
              }
            }}
            className="w-[110px] bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[6px] text-[12px] text-[var(--color-t1)] px-2.5 py-1.5 font-mono uppercase focus:outline-none focus:border-[var(--color-info)] placeholder:text-[var(--color-t3)] placeholder:normal-case"
          />
          {value ? (
            <button
              type="button"
              onClick={() => {
                setDraft("");
                onClear();
              }}
              aria-label={`Usar color por defecto para ${meta.label}`}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--color-t3)] hover:text-[var(--color-t1)] transition-colors"
            >
              <RotateCcw size={10} /> Reset
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ColorPreview({
  colors,
}: {
  colors: { primary: string; accent: string; bg: string; text: string };
}) {
  return (
    <div
      className="rounded-[10px] border border-[var(--color-b1)] overflow-hidden shadow-inner"
      style={{ backgroundColor: colors.bg }}
    >
      <div className="px-4 py-4" style={{ color: colors.text }}>
        <span
          className="inline-block text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full mb-2"
          style={{
            backgroundColor: colors.primary,
            color: colors.bg,
          }}
        >
          Fase 2 · en curso
        </span>
        <div
          className="text-[16px] font-semibold leading-tight mb-2"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Tu roadmap
          <br />
          con Codexy
        </div>
        <div
          className="text-[10px] opacity-70 mb-3 leading-relaxed"
          style={{ color: colors.text }}
        >
          Seguimiento de la implementación.
        </div>
        <div
          className="h-1.5 rounded-full w-full mb-1.5"
          style={{ backgroundColor: `${colors.accent}33` }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: "62%",
              backgroundColor: colors.accent,
            }}
          />
        </div>
        <div className="flex items-center justify-between text-[9px] opacity-70">
          <span>Progreso</span>
          <span>62%</span>
        </div>
        <div className="mt-3 space-y-1.5">
          {[
            { label: "Onboarding", done: true },
            { label: "Integración", done: false },
            { label: "Go-live", done: false },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full flex items-center justify-center text-[7px] font-bold flex-shrink-0"
                style={{
                  backgroundColor: item.done ? colors.accent : `${colors.text}15`,
                  color: item.done ? colors.bg : colors.text,
                }}
              >
                {item.done ? "\u2713" : ""}
              </span>
              <span className="text-[10px]" style={{ color: colors.text }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

