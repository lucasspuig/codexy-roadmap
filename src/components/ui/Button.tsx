import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--color-brand)] text-[#0a0a0a] hover:brightness-110",
        secondary:
          "bg-transparent border border-[var(--color-b1)] text-[var(--color-t2)] hover:border-[var(--color-b2)] hover:text-[var(--color-t1)] hover:bg-[var(--color-s2)]",
        ghost:
          "bg-transparent text-[var(--color-t2)] hover:bg-[var(--color-s2)] hover:text-[var(--color-t1)]",
        danger:
          "bg-transparent border border-[rgba(248,113,113,0.2)] text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]",
        dangerSolid:
          "bg-[var(--color-danger)] text-white hover:brightness-110",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-md",
        md: "h-9 px-4 text-[13px] rounded-[7px]",
        lg: "h-11 px-5 text-sm rounded-lg",
        icon: "h-9 w-9 rounded-[7px]",
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
