"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}

/**
 * Modal accesible basado en <dialog> nativo.
 * - Cierra con Escape (default del elemento).
 * - Cierra al clickear fuera (backdrop).
 * - Devuelve focus al trigger.
 * - Mobile-friendly: el contenido scrollea dentro del modal y no en la página
 *   de fondo (overscroll-behavior: contain).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = "440px",
}: DialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // Bloquea el scroll del body mientras el modal está abierto. Evita el
  // glitch en mobile donde gestos sobre el modal arrastraban la página.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Wire native events (Escape triggers close event; backdrop click we detect via target)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleClose = () => onClose();
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("close", handleClose);
    el.addEventListener("cancel", handleCancel);
    return () => {
      el.removeEventListener("close", handleClose);
      el.removeEventListener("cancel", handleCancel);
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={cn(
        "bg-transparent p-0 m-0 max-w-none max-h-none w-full h-full",
        "backdrop:bg-black/60 backdrop:backdrop-blur-[2px]",
      )}
      onClick={(e) => {
        // Backdrop click: the dialog itself is the event target (children won't bubble here due to inner wrapper)
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="fixed inset-0 flex items-end justify-center p-3 pointer-events-none sm:items-center sm:p-5"
        aria-hidden="true"
      >
        <div
          role="document"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "bg-[var(--color-s1)] border border-[var(--color-b1)] rounded-[14px] w-full pointer-events-auto shadow-2xl animate-fade-in",
            // Layout en columna con altura tope para que el body sea el único que scrollea.
            "flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2.5rem)]",
          )}
          style={{ maxWidth }}
        >
          {/* Header — fijo */}
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 sm:px-6 sm:pt-5 shrink-0 border-b border-transparent">
            <div className="min-w-0">
              <h3 className="text-[17px] font-semibold text-[var(--color-t1)] truncate">
                {title}
              </h3>
              {description ? (
                <p className="text-[13px] text-[var(--color-t3)] mt-1">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="text-[var(--color-t3)] hover:text-[var(--color-t1)] transition-colors p-1 -mr-1 shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body — único elemento scrollable */}
          <div
            className="px-5 sm:px-6 pb-5 flex-1 min-h-0 overflow-y-auto"
            style={{ overscrollBehavior: "contain" }}
          >
            {children}
          </div>

          {/* Footer — fijo */}
          {footer ? (
            <div className="flex items-center justify-end gap-2 px-5 sm:px-6 py-3.5 border-t border-[var(--color-b1)] shrink-0 bg-[var(--color-s1)] rounded-b-[14px]">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

/**
 * Dialog de confirmación (borrar, etc).
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "danger",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      maxWidth="400px"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="h-9 px-4 text-[13px] rounded-[7px] border border-[var(--color-b1)] text-[var(--color-t2)] hover:border-[var(--color-b2)] hover:text-[var(--color-t1)] hover:bg-[var(--color-s2)] transition-all disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "h-9 px-4 text-[13px] rounded-[7px] font-medium transition-all disabled:opacity-50 inline-flex items-center gap-2",
              variant === "danger"
                ? "bg-[var(--color-danger)] text-white hover:brightness-110"
                : "bg-[var(--color-brand)] text-[#0a0a0a] hover:brightness-110",
            )}
          >
            {loading ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div />
    </Dialog>
  );
}
