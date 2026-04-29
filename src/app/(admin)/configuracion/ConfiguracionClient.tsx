"use client";

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  ImageIcon,
  Loader2,
  MessageSquareText,
  Phone,
  Save,
  Send,
  Settings as SettingsIcon,
  Trash2,
  Upload,
  UserCircle2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  updateAgencySettings,
  uploadAgencySignature,
} from "@/app/(admin)/contratos/actions";
import { enviarMensajeTest } from "@/app/(admin)/configuracion/actions";
import { EditableTemplate } from "@/components/admin/EditableTemplate";
import type { AgencySettings } from "@/types/contratos";
import type { MensajeTemplate } from "@/types/cobros";
import { cn } from "@/lib/utils";

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 1 * 1024 * 1024;

export interface ConfiguracionClientProps {
  initial: AgencySettings | null;
  templates: MensajeTemplate[];
  numeroEscalacion: string | null;
  evolutionConfigurada: boolean;
}

export function ConfiguracionClient({
  initial,
  templates,
  numeroEscalacion,
  evolutionConfigurada,
}: ConfiguracionClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [signatureUrl, setSignatureUrl] = useState<string | null>(
    initial?.signature_url ?? null,
  );
  const [legalName, setLegalName] = useState(initial?.legal_name ?? "Codexy");
  const [signatoryName, setSignatoryName] = useState(
    initial?.signatory_name ?? "",
  );
  const [signatoryRole, setSignatoryRole] = useState(
    initial?.signatory_role ?? "",
  );
  const [contactEmail, setContactEmail] = useState(initial?.contact_email ?? "");

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [testing, setTesting] = useState(false);

  async function handleTestMessage() {
    setTesting(true);
    const res = await enviarMensajeTest();
    setTesting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Mensaje de prueba enviado. Revisá tu WhatsApp.");
  }

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_MIME.includes(file.type)) {
      return "Formato no permitido. Usá PNG, JPG o WEBP.";
    }
    if (file.size > MAX_BYTES) {
      return "La firma supera 1 MB.";
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
      const res = await uploadAgencySignature(fd);
      setUploading(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSignatureUrl(res.data.url);
      toast.success("Firma actualizada");
      router.refresh();
    },
    [validateFile, router],
  );

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void doUpload(file);
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

  async function handleSave() {
    setSaving(true);
    const res = await updateAgencySettings({
      legal_name: legalName.trim() || "Codexy",
      signatory_name: signatoryName.trim() || null,
      signatory_role: signatoryRole.trim() || null,
      contact_email: contactEmail.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Configuración guardada");
    router.refresh();
  }

  return (
    <div className="flex-1 w-full max-w-4xl mx-auto px-5 sm:px-7 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <SettingsIcon size={16} className="text-[var(--color-info)]" />
          <h1 className="text-[22px] font-semibold text-[var(--color-t1)]">
            Configuración
          </h1>
        </div>
        <p className="text-[13px] text-[var(--color-t3)] mt-1">
          Datos del prestador, firma digital y templates de mensajes. Aplican a
          todos los contratos y cobros de Codexy.
        </p>
      </div>

      {/* ── Card: Diagnóstico WhatsApp ──────────────────────────────── */}
      <section className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-5 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquareText size={14} className="text-[var(--color-info)]" />
          <h2 className="text-[14px] font-semibold text-[var(--color-t1)]">
            Diagnóstico WhatsApp
          </h2>
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider px-2 py-0.5 rounded-full border font-medium",
              evolutionConfigurada
                ? "border-[color-mix(in_srgb,var(--color-brand)_30%,transparent)] text-[var(--color-brand)] bg-[var(--color-brand-muted)]"
                : "border-[rgba(248,113,113,0.30)] text-[var(--color-danger)] bg-[var(--color-danger-muted)]",
            )}
          >
            <Check size={10} />
            {evolutionConfigurada
              ? "Evolution API: configurada"
              : "Evolution API: faltan env vars"}
          </span>
        </div>
        <p className="text-[12px] text-[var(--color-t3)] mb-4 leading-relaxed">
          Probá la integración mandándote un mensaje a vos mismo al número
          personal definido como destino de escalaciones.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <Label htmlFor="cfg-num-esc">
              <span className="inline-flex items-center gap-1">
                <Phone size={11} />
                Número de escalación / WhatsApp del admin
              </span>
            </Label>
            <Input
              id="cfg-num-esc"
              value={numeroEscalacion ?? ""}
              readOnly
              placeholder="(no configurado)"
            />
            <p className="text-[11px] text-[var(--color-t3)] mt-1 leading-relaxed">
              Editable desde la pestaña <strong>Datos de pago</strong>. Sin este
              número no se pueden mandar pruebas ni escalaciones.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={handleTestMessage}
            loading={testing}
            disabled={!evolutionConfigurada || !numeroEscalacion}
          >
            <Send size={13} />
            Mandar mensaje de prueba
          </Button>
        </div>

        {!evolutionConfigurada ? (
          <div className="mt-3 rounded-[8px] border border-[rgba(251,191,36,0.30)] bg-[color-mix(in_srgb,#fbbf24_8%,transparent)] px-3 py-2 text-[11.5px] text-[var(--color-warn)] leading-relaxed">
            Definí <code>EVOLUTION_API_URL</code>,{" "}
            <code>EVOLUTION_API_KEY</code> y <code>EVOLUTION_INSTANCE</code> en
            las variables de entorno del servidor para habilitar el envío.
          </div>
        ) : null}
      </section>

      {/* ── Card: Firma de Codexy ────────────────────────────────────── */}
      <section className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-5 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <ImageIcon size={14} className="text-[var(--color-info)]" />
          <h2 className="text-[14px] font-semibold text-[var(--color-t1)]">
            Firma de Codexy
          </h2>
        </div>
        <p className="text-[12px] text-[var(--color-t3)] mb-4 leading-relaxed">
          Esta firma se estampa automáticamente al emitir cualquier contrato. Recomendado: PNG transparente con la firma manuscrita escaneada.
        </p>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          aria-label={
            signatureUrl ? "Cambiar firma de Codexy" : "Subir firma de Codexy"
          }
          className={cn(
            "relative rounded-[10px] border-2 border-dashed transition-all duration-150 overflow-hidden cursor-pointer",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-info)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-s1)]",
            dragOver
              ? "border-[var(--color-info)] bg-[var(--color-info-muted)]"
              : "border-[var(--color-b1)] bg-[var(--color-s2)]/60 hover:border-[var(--color-b2)] hover:bg-[var(--color-s2)]",
          )}
          style={{ minHeight: 180 }}
        >
          {signatureUrl ? (
            <div className="flex flex-col items-center justify-center py-6 px-4 gap-3">
              <div className="relative bg-white rounded-[8px] p-4 shadow-sm flex items-center justify-center w-[280px] h-[110px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signatureUrl}
                  alt="Firma actual de Codexy"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-t3)]">
                <Upload size={11} />
                Click o arrastrá un nuevo archivo para reemplazar
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 px-4 gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-[var(--color-s3)] flex items-center justify-center text-[var(--color-t3)]">
                <Upload size={18} />
              </div>
              <div className="text-[13px] text-[var(--color-t2)] font-medium">
                Click para subir o arrastrá la firma aquí
              </div>
              <div className="text-[11px] text-[var(--color-t3)]">
                PNG, JPG o WEBP · máx. 1 MB · recomendado PNG transparente
              </div>
            </div>
          )}

          {uploading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-s1)]/80 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 text-[13px] text-[var(--color-t1)]">
                <Loader2 size={14} className="animate-spin" /> Subiendo…
              </div>
            </div>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={handleFileChange}
        />

        {signatureUrl ? (
          <div className="mt-3 flex items-center justify-end">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-[11.5px] text-[var(--color-t3)] hover:text-[var(--color-t1)] transition-colors inline-flex items-center gap-1"
            >
              <Trash2 size={11} /> Reemplazar firma
            </button>
          </div>
        ) : null}
      </section>

      {/* ── Card: Datos del prestador ─────────────────────────────────── */}
      <section className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-5 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Building2 size={14} className="text-[var(--color-info)]" />
          <h2 className="text-[14px] font-semibold text-[var(--color-t1)]">
            Datos del prestador
          </h2>
        </div>
        <p className="text-[12px] text-[var(--color-t3)] mb-4 leading-relaxed">
          Información que aparece como bloque del prestador en cada contrato.
        </p>
        <div className="space-y-3">
          <div>
            <Label htmlFor="cfg-legal">Razón social / nombre legal</Label>
            <Input
              id="cfg-legal"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Codexy"
              maxLength={120}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cfg-firmante">
                <span className="inline-flex items-center gap-1">
                  <UserCircle2 size={11} />
                  Nombre del firmante
                </span>
              </Label>
              <Input
                id="cfg-firmante"
                value={signatoryName}
                onChange={(e) => setSignatoryName(e.target.value)}
                placeholder="Lucas Puig"
              />
            </div>
            <div>
              <Label htmlFor="cfg-cargo">Cargo</Label>
              <Input
                id="cfg-cargo"
                value={signatoryRole}
                onChange={(e) => setSignatoryRole(e.target.value)}
                placeholder="CEO"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="cfg-email">Email de contacto</Label>
            <Input
              id="cfg-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="contacto@codexyoficial.com"
            />
          </div>
        </div>
        <div className="mt-5 pt-4 border-t border-[var(--color-b1)] flex items-center justify-end">
          <Button variant="primary" onClick={handleSave} loading={saving}>
            <Save size={13} />
            Guardar cambios
          </Button>
        </div>
      </section>

      {/* ── Card: Templates de mensajes ───────────────────────────── */}
      {templates.length > 0 ? (
        <section className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquareText size={14} className="text-[var(--color-info)]" />
            <h2 className="text-[14px] font-semibold text-[var(--color-t1)]">
              Templates de mensajes
            </h2>
            <span className="text-[11px] text-[var(--color-t3)]">
              ({templates.length})
            </span>
          </div>
          <p className="text-[12px] text-[var(--color-t3)] mb-4 leading-relaxed">
            Cuerpo de los WhatsApp automáticos. La vista previa se actualiza en
            vivo con datos de ejemplo. Los cambios afectan a todos los envíos
            posteriores.
          </p>
          <div className="space-y-3">
            {templates.map((tpl) => (
              <EditableTemplate key={tpl.id} template={tpl} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Status final ─────────────────────────────────────────────── */}
      <section
        className={cn(
          "rounded-[10px] border p-4 flex items-start gap-3",
          signatureUrl && signatoryName
            ? "border-[var(--color-brand-border)] bg-[var(--color-brand-muted)]"
            : "border-[rgba(251,191,36,0.30)] bg-[rgba(251,191,36,0.07)]",
        )}
      >
        {signatureUrl && signatoryName ? (
          <Check
            size={18}
            className="text-[var(--color-brand)] mt-0.5 flex-shrink-0"
          />
        ) : (
          <Loader2
            size={18}
            className="text-[var(--color-warn)] mt-0.5 flex-shrink-0"
          />
        )}
        <div>
          <p className="text-[13px] font-semibold text-[var(--color-t1)]">
            {signatureUrl && signatoryName
              ? "Listo para emitir contratos"
              : "Configuración incompleta"}
          </p>
          <p className="text-[12px] text-[var(--color-t3)] mt-0.5 leading-relaxed">
            {signatureUrl && signatoryName
              ? "Podés generar y emitir contratos. La firma de Codexy se estampará automáticamente."
              : "Subí la firma y completá nombre del firmante antes de emitir tu primer contrato."}
          </p>
        </div>
      </section>
    </div>
  );
}
