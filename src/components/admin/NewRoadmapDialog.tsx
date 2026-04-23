"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Rocket } from "lucide-react";

import { Dialog } from "@/components/admin/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { createProyectoFromPlantilla } from "@/app/(admin)/proyectos/actions";

export interface NewRoadmapDialogProps {
  open: boolean;
  onClose: () => void;
  /** Si viene, el dropdown queda bloqueado en ese cliente */
  preselectedClienteId?: string | null;
  clientes: Array<{
    id: string;
    nombre: string;
    empresa: string | null;
    hasProyecto: boolean;
  }>;
  plantillas: Array<{
    id: string;
    nombre: string;
    descripcion: string | null;
    rubro: string | null;
    fases_count: number;
  }>;
}

export function NewRoadmapDialog({
  open,
  onClose,
  preselectedClienteId,
  clientes,
  plantillas,
}: NewRoadmapDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [clienteId, setClienteId] = useState("");
  const [plantillaId, setPlantillaId] = useState("");
  const [nombre, setNombre] = useState("");
  const [subtitulo, setSubtitulo] = useState("");

  // Reset al abrir
  useEffect(() => {
    if (open) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setClienteId(preselectedClienteId ?? "");
      setPlantillaId(plantillas[0]?.id ?? "");
      setNombre("");
      setSubtitulo("");
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [open, preselectedClienteId, plantillas]);

  const selectedCliente = useMemo(
    () => clientes.find((c) => c.id === clienteId) ?? null,
    [clienteId, clientes],
  );

  const availableClientes = useMemo(
    () =>
      clientes.filter(
        (c) => !c.hasProyecto || c.id === preselectedClienteId,
      ),
    [clientes, preselectedClienteId],
  );

  const selectedPlantilla = plantillas.find((p) => p.id === plantillaId) ?? null;

  async function submit() {
    if (!clienteId || !plantillaId) {
      toast.error("Seleccioná un cliente y una plantilla");
      return;
    }
    startTransition(async () => {
      const res = await createProyectoFromPlantilla({
        cliente_id: clienteId,
        plantilla_id: plantillaId,
        nombre: nombre.trim() || undefined,
        subtitulo: subtitulo.trim() || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Roadmap creado");
      onClose();
      router.push(`/proyectos/${res.data.proyecto_id}`);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      title="Nuevo roadmap"
      description="Creá un roadmap a partir de una plantilla. Podés editarlo después."
      maxWidth="500px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={pending}
            disabled={!clienteId || !plantillaId}
          >
            <Rocket size={14} />
            Crear roadmap
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="nr-cliente">Cliente</Label>
          <select
            id="nr-cliente"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            disabled={!!preselectedClienteId || pending}
            className="w-full bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[8px] text-sm text-[var(--color-t1)] px-3.5 py-2.5 transition-colors focus:outline-none focus:border-[var(--color-info)] disabled:opacity-60"
          >
            <option value="">Elegí un cliente…</option>
            {availableClientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {c.empresa ? ` — ${c.empresa}` : ""}
              </option>
            ))}
          </select>
          {availableClientes.length === 0 ? (
            <p className="text-[11px] text-[var(--color-t3)] mt-1">
              Todos los clientes ya tienen un roadmap.
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="nr-plantilla">Plantilla</Label>
          <select
            id="nr-plantilla"
            value={plantillaId}
            onChange={(e) => setPlantillaId(e.target.value)}
            disabled={pending}
            className="w-full bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[8px] text-sm text-[var(--color-t1)] px-3.5 py-2.5 transition-colors focus:outline-none focus:border-[var(--color-info)]"
          >
            {plantillas.length === 0 ? (
              <option value="">No hay plantillas disponibles</option>
            ) : null}
            {plantillas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.rubro ? ` · ${p.rubro}` : ""} ({p.fases_count} fases)
              </option>
            ))}
          </select>
          {selectedPlantilla?.descripcion ? (
            <p className="text-[11px] text-[var(--color-t3)] mt-1.5 leading-relaxed">
              {selectedPlantilla.descripcion}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="nr-nombre">Nombre (opcional)</Label>
          <Input
            id="nr-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            disabled={pending}
            placeholder={
              selectedCliente?.empresa
                ? `Roadmap ${selectedCliente.empresa}`
                : "Nombre del roadmap"
            }
          />
        </div>

        <div>
          <Label htmlFor="nr-subtitulo">Subtítulo (opcional)</Label>
          <Input
            id="nr-subtitulo"
            value={subtitulo}
            onChange={(e) => setSubtitulo(e.target.value)}
            disabled={pending}
            placeholder="Implementación Codexy · …"
          />
        </div>
      </div>
    </Dialog>
  );
}
