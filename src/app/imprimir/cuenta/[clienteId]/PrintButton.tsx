"use client";

import { Download } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="contrato-print-floating"
      aria-label="Descargar PDF del estado de cuenta"
    >
      <Download size={14} />
      Descargar PDF
    </button>
  );
}
