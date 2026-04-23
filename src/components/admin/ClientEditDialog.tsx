"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Dialog } from "@/components/admin/Dialog";
import { updateCliente } from "@/app/(admin)/proyectos/actions";
import type { Cliente } from "@/types/database";

export interface ClientEditDialogProps {
  open: boolean;
  onClose: () => void;
  cliente: Cliente;
  onSaved?: () => void;
}

export function ClientEditDialog({
  open,
  onClose,
  cliente,
  onSaved,
}: ClientEditDialogProps) {
  const [nombre, setNombre] = useState(cliente.nombre);
  const [empresa, setEmpresa] = useState(cliente.empresa ?? "");
  const [email, setEmail] = useState(cliente.email ?? "");
  const [telefono, setTelefono] = useState(cliente.telefono ?? "");
  const [rubro, setRubro] = useState(cliente.rubro ?? "");
  const [saving, setSaving] = useState(false);

  // Reset form cada vez que se abre o cambia el cliente
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNombre(cliente.nombre);
      setEmpresa(cliente.empresa ?? "");
      setEmail(cliente.email ?? "");
      setTelefono(cliente.telefono ?? "");
      setRubro(cliente.rubro ?? "");
    }
  }, [open, cliente]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const nombreTrim = nombre.trim();
    if (!nombreTrim) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    const res = await updateCliente({
      cliente_id: cliente.id,
      nombre: nombreTrim,
      empresa: empresa.trim() || null,
      email: email.trim() || null,
      telefono: telefono.trim() || null,
      rubro: rubro.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Datos del cliente actualizados");
    onSaved?.();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title="Editar datos del cliente"
      description="Actualizá la información de contacto y empresa."
      maxWidth="480px"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-9 px-4 text-[13px] rounded-[7px] border border-[var(--color-b1)] text-[var(--color-t2)] hover:border-[var(--color-b2)] hover:text-[var(--color-t1)] hover:bg-[var(--color-s2)] transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          <Button
            type="submit"
            form="client-edit-form"
            variant="primary"
            size="md"
            loading={saving}
          >
            Guardar cambios
          </Button>
        </>
      }
    >
      <form id="client-edit-form" onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label htmlFor="cli-nombre">Nombre *</Label>
          <Input
            id="cli-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. María Pérez"
            autoFocus
            required
            maxLength={120}
          />
        </div>
        <div>
          <Label htmlFor="cli-empresa">Empresa</Label>
          <Input
            id="cli-empresa"
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            placeholder="Ej. Clínica Salud"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cli-email">Email</Label>
            <Input
              id="cli-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contacto@ejemplo.com"
            />
          </div>
          <div>
            <Label htmlFor="cli-tel">Teléfono</Label>
            <Input
              id="cli-tel"
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+54 9 11 ..."
            />
          </div>
        </div>
        <div>
          <Label htmlFor="cli-rubro">Rubro</Label>
          <Input
            id="cli-rubro"
            value={rubro}
            onChange={(e) => setRubro(e.target.value)}
            placeholder="Ej. Estética, Odontología…"
          />
        </div>
      </form>
    </Dialog>
  );
}
