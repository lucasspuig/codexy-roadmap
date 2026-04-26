"use client";

import { Download } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="contrato-print-floating"
      aria-label="Descargar PDF del contrato"
    >
      <Download size={14} />
      Descargar PDF
    </button>
  );
}
