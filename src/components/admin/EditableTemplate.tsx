"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Input";
import { updateTemplate } from "@/app/(admin)/configuracion/actions";
import { extractVariables, renderTemplate } from "@/lib/templates";
import type { MensajeTemplate } from "@/types/cobros";

/**
 * Contexto de ejemplo para previsualizar templates en /configuracion.
 * Sigue el mismo shape que el contexto real construido en /api/cron/cobros
 * y src/app/(admin)/cobros/actions.ts (`buildTemplateContext`).
 */
const PREVIEW_CONTEXT = {
  cliente: {
    nombre: "Inmobiliaria Ruiz",
    empresa: "Inmobiliaria Ruiz S.A.",
  },
  cuota: {
    monto_usd: "80",
    monto_ars: "114.000",
    tiene_ars: true,
    rango_inicio: "03/05",
    rango_fin: "09/05",
    vencimiento_largo: "9 de mayo de 2026",
    ultimo_recordatorio: "2026-05-03",
  },
  agency: {
    banco: "Banco Patagonia",
    cbu_pesos: "0340207008207031352003",
    alias_pesos: "codexy.oficial.pesos",
    cvu_usd: "0340207009207031352004",
    alias_usd: "codexy.oficial.usd",
    cuil: "20-46150460-5",
  },
  mp: { link: "" },
  admin: {
    url_cliente: "https://plan.codexyoficial.com/dashboard?cliente=abc",
  },
  ajuste: {
    delta: "10",
    nuevo_monto: "90",
  },
  trimestral: {
    total: "216",
    original: "240",
    ahorro: "24",
    hasta: "agosto 2026",
  },
};

const DEBOUNCE_MS = 200;

export interface EditableTemplateProps {
  template: MensajeTemplate;
}

export function EditableTemplate({ template }: EditableTemplateProps) {
  const [cuerpo, setCuerpo] = useState(template.cuerpo);
  const [debouncedCuerpo, setDebouncedCuerpo] = useState(template.cuerpo);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincronizar el estado local cuando cambia el template prop (después de
  // un revalidatePath, por ejemplo).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setCuerpo(template.cuerpo);
    setDebouncedCuerpo(template.cuerpo);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [template.cuerpo]);

  // Debounce de 200ms para no recalcular el preview en cada tecla
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedCuerpo(cuerpo);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [cuerpo]);

  const variables = useMemo(() => extractVariables(cuerpo), [cuerpo]);
  const preview = useMemo(() => {
    try {
      return renderTemplate(debouncedCuerpo, PREVIEW_CONTEXT);
    } catch {
      return "(error renderizando template)";
    }
  }, [debouncedCuerpo]);

  const dirty = cuerpo !== template.cuerpo;
  const charCount = cuerpo.length;
  const overLimit = charCount > 5000;

  async function handleSave() {
    if (!dirty || overLimit || cuerpo.trim().length === 0) return;
    setSaving(true);
    const res = await updateTemplate({ id: template.id, cuerpo });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Template "${template.nombre}" guardado`);
  }

  function handleReset() {
    setCuerpo(template.cuerpo);
  }

  return (
    <article className="rounded-[10px] border border-[var(--color-b1)] bg-[var(--color-s1)] p-4">
      <header className="mb-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h3 className="text-[13.5px] font-semibold text-[var(--color-t1)]">
            {template.nombre}
          </h3>
          <code className="text-[10.5px] text-[var(--color-t3)]">
            id: {template.id}
          </code>
        </div>
        {template.descripcion ? (
          <p className="text-[11.5px] text-[var(--color-t3)] mt-1 leading-relaxed">
            {template.descripcion}
          </p>
        ) : null}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Editor */}
        <div className="flex flex-col">
          <Label htmlFor={`tpl-${template.id}`}>Cuerpo del mensaje</Label>
          <textarea
            id={`tpl-${template.id}`}
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            spellCheck={false}
            className="w-full bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[8px] text-[12.5px] text-[var(--color-t1)] px-3 py-2.5 font-mono leading-[1.55] resize-y min-h-[200px] focus:outline-none focus:border-[var(--color-info)]"
            style={{ fontFamily: "var(--ff-mono)" }}
            rows={10}
          />
          <div className="mt-1 flex items-center justify-between text-[10.5px] text-[var(--color-t3)]">
            <span>Soporta {`{{var}}`} y {`{{#if var}}…{{/if}}`}.</span>
            <span className={overLimit ? "text-[var(--color-danger)]" : ""}>
              {charCount} / 5000
            </span>
          </div>

          {/* Variables disponibles */}
          {variables.length > 0 ? (
            <div className="mt-2.5">
              <div className="text-[10.5px] font-semibold text-[var(--color-t3)] uppercase tracking-wider mb-1.5">
                Variables disponibles
              </div>
              <ul className="flex flex-wrap gap-1">
                {variables.map((v) => (
                  <li
                    key={v}
                    className="text-[10.5px] px-1.5 py-0.5 rounded border border-[var(--color-b1)] bg-[var(--color-s2)] text-[var(--color-t2)]"
                    style={{ fontFamily: "var(--ff-mono)" }}
                  >
                    {`{{${v}}}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Preview tipo WhatsApp */}
        <div>
          <Label>Vista previa</Label>
          <div className="rounded-[8px] border border-[var(--color-b1)] bg-[#0e1410] p-3 min-h-[200px]">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-full bg-[#075e54] text-white flex items-center justify-center shrink-0">
                <MessageCircle size={13} />
              </div>
              <div
                className="rounded-[10px] rounded-tl-[2px] bg-[#dcf8c6] text-[#1a1a1a] px-3 py-2 max-w-full text-[12.5px] leading-[1.5] whitespace-pre-wrap break-words shadow-sm"
                style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
              >
                {preview || (
                  <span className="italic text-[#5a5a5a]">
                    El mensaje renderizado aparecerá acá…
                  </span>
                )}
              </div>
            </div>
          </div>
          <p className="text-[10.5px] text-[var(--color-t3)] mt-1 leading-relaxed">
            Datos de ejemplo. En producción se interpolan los datos reales del
            cliente, la cuota y la agencia.
          </p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-[var(--color-b1)] flex items-center justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleReset}
          disabled={!dirty || saving}
        >
          <RotateCcw size={12} />
          Resetear
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!dirty || overLimit || cuerpo.trim().length === 0}
          loading={saving}
        >
          <Save size={12} />
          Guardar cambios
        </Button>
      </div>
    </article>
  );
}
