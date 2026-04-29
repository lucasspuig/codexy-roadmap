// Tipos del payload de la vista pública de cobros (/pagar/[token]).
// Vive separado de actions.ts porque "use server" prohíbe exports que no
// sean funciones async.

export interface PagoPublicoCuota {
  id: string;
  monto_usd: number;
  periodo: string;
  fecha_vencimiento: string;
}

export interface PagoPublicoPayload {
  cliente_id: string;
  cliente_nombre: string;
  pago_data: {
    banco: string | null;
    cbu_pesos: string | null;
    alias_pesos: string | null;
    cvu_usd: string | null;
    alias_usd: string | null;
    cuil: string | null;
    mercadopago_activo: boolean;
  };
  cuotas: PagoPublicoCuota[];
}
