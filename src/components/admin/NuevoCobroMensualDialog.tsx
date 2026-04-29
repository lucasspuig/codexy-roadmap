"use client";

import { useEffect, useState } from "react";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Dialog } from "@/components/admin/Dialog";
import { crearCobroIndependiente } from "@/app/(admin)/cobros/actions";

export interface NuevoCobroMensualDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Crea un cobro mensual "rápido" — cliente + contrato de mantenimiento +
 * 12 cuotas — sin pasar por el embudo del CRM.
 */
export function NuevoCobroMensualDialog({
  open,
  onClose,
  onCreated,
}: NuevoCobroMensualDialogProps) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("+549");
  const [empresa, setEmpresa] = useState("");
  const [cuota, setCuota] = useState("");
  const [diaCobro, setDiaCobro] = useState("9");
  const [recordatoriosActivos, setRecordatoriosActivos] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setNombre("");
    setTelefono("+549");
    setEmpresa("");
    setCuota("");
    setDiaCobro("9");
    setRecordatoriosActivos(true);
    setSubmitting(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  async function handleSubmit() {
    const n = nombre.trim();
    const t = telefono.trim();
    const cuotaNum = Number.parseFloat(cuota);
    const dcNum = Number.parseInt(diaCobro, 10);

    if (n.length < 2) {
      toast.error("Cargá el nombre del cliente");
      return;
    }
    if (t.length < 8) {
      toast.error("Cargá un teléfono válido (formato internacional)");
      return;
    }
    if (!Number.isFinite(cuotaNum) || cuotaNum <= 0) {
      toast.error("Cuota mensual inválida");
      return;
    }
    if (!Number.isFinite(dcNum) || dcNum < 1 || dcNum > 28) {
      toast.error("El día de cobro debe estar entre 1 y 28");
      return;
    }

    setSubmitting(true);
    const res = await crearCobroIndependiente({
      nombre: n,
      telefono: t,
      empresa: empresa.trim() || null,
      cuota_mensual: cuotaNum,
      dia_cobro: dcNum,
      recordatorios_activos: recordatoriosActivos,
    });
    setSubmitting(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      `Cobro creado · ${res.data.cuotas_generadas} cuotas mensuales generadas`,
    );
    onCreated();
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="Nuevo cobro mensual"
      description="Cliente que solo entra al sistema para cobrarle un mantenimiento mensual."
      maxWidth="500px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>
            <UserPlus size={13} />
            Crear cobro
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div>
          <Label htmlFor="ncm-nombre">Nombre del cliente *</Label>
          <Input
            id="ncm-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Inmobiliaria Ruiz"
            maxLength={120}
          />
        </div>
        <div>
          <Label htmlFor="ncm-tel">Teléfono *</Label>
          <Input
            id="ncm-tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="+5491131245678"
            inputMode="tel"
          />
          <p className="text-[11px] text-[var(--color-t3)] mt-1">
            Con código de país. Se normaliza a solo dígitos al guardar.
          </p>
        </div>
        <div>
          <Label htmlFor="ncm-empresa">Empresa (opcional)</Label>
          <Input
            id="ncm-empresa"
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            placeholder="Inmobiliaria Ruiz S.A."
            maxLength={120}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
          <div>
            <Label htmlFor="ncm-cuota">Cuota mensual USD *</Label>
            <Input
              id="ncm-cuota"
              type="number"
              min="0"
              step="0.01"
              value={cuota}
              onChange={(e) => setCuota(e.target.value)}
              placeholder="80"
            />
          </div>
          <div>
            <Label htmlFor="ncm-dia">Día de cobro</Label>
            <Input
              id="ncm-dia"
              type="number"
              min="1"
              max="28"
              step="1"
              value={diaCobro}
              onChange={(e) => setDiaCobro(e.target.value)}
              placeholder="9"
            />
          </div>
        </div>
        <label className="flex items-start gap-2 text-[12.5px] text-[var(--color-t2)] cursor-pointer select-none p-2.5 rounded-[8px] border border-dashed border-[var(--color-b1)] bg-[var(--color-s2)]/30 hover:border-[var(--color-b2)] transition-colors">
          <input
            type="checkbox"
            checked={recordatoriosActivos}
            onChange={(e) => setRecordatoriosActivos(e.target.checked)}
            className="w-3.5 h-3.5 mt-0.5 accent-[var(--color-brand)]"
          />
          <span className="flex-1">
            <span className="block font-semibold text-[var(--color-t1)]">
              Activar recordatorios automáticos
            </span>
            <span className="text-[11.5px] text-[var(--color-t3)] block leading-relaxed mt-0.5">
              Manda WhatsApp el día {diaCobro || "9"} − 6 (recordatorio inicial)
              y −3 (segundo aviso) si no pagó.
            </span>
          </span>
        </label>
        <div className="text-[11.5px] text-[var(--color-t3)] flex items-start gap-1.5 leading-relaxed">
          <Plus size={12} className="mt-0.5 shrink-0" />
          <span>
            Esto crea un contrato de mantenimiento auto-firmado, suma 12 cuotas
            mensuales y empieza a cobrar el mes siguiente.
          </span>
        </div>
      </div>
    </Dialog>
  );
}
