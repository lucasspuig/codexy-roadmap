import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonStyles = cva(
  [
    "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium",
    "transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
    "disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: [
          "text-white",
          // Gradient top→bottom para sensación premium
          "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-brand)_120%,#fff_10%),var(--color-brand))]",
          // Inner highlight + sombra sutil
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_6px_-2px_color-mix(in_srgb,var(--color-brand)_60%,transparent)]",
          "hover:brightness-108 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_6px_20px_-4px_color-mix(in_srgb,var(--color-brand)_50%,transparent)]",
          "active:brightness-95",
        ].join(" "),
        secondary: [
          "bg-[var(--color-s1)] border border-[var(--color-b1)] text-[var(--color-t2)]",
          "shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-b3)_30%,transparent)]",
          "hover:border-[var(--color-b2)] hover:text-[var(--color-t1)] hover:bg-[var(--color-s2)]",
          "active:bg-[var(--color-s3)]",
        ].join(" "),
        ghost:
          "bg-transparent text-[var(--color-t2)] hover:bg-[var(--color-s2)] hover:text-[var(--color-t1)]",
        danger:
          "bg-transparent border border-[rgba(248,113,113,0.25)] text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] hover:border-[rgba(248,113,113,0.45)]",
        dangerSolid: [
          "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-danger)_115%,#fff_10%),var(--color-danger))]",
          "text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
          "hover:brightness-110",
        ].join(" "),
      },
      size: {
        sm: "h-8 px-3 text-[12px] rounded-[7px]",
        md: "h-9 px-4 text-[13px] rounded-[8px]",
        lg: "h-11 px-5 text-sm rounded-[10px]",
        icon: "h-9 w-9 rounded-[8px]",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonStyles({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
