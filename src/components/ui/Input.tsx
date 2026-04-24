import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[8px]",
        "text-sm text-[var(--color-t1)] px-3.5 py-2.5",
        "placeholder:text-[var(--color-t3)]",
        "transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:border-[var(--color-b2)]",
        "focus:outline-none focus:border-[color-mix(in_srgb,var(--color-brand)_60%,transparent)]",
        "focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-brand)_18%,transparent)]",
        "focus:bg-[var(--color-s1)]",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full bg-[var(--color-s2)] border border-[var(--color-b1)] rounded-[8px]",
      "text-[13px] text-[var(--color-t2)] px-3.5 py-2.5",
      "placeholder:text-[var(--color-t3)] resize-y min-h-[60px] leading-[1.6]",
      "transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
      "hover:border-[var(--color-b2)]",
      "focus:outline-none focus:border-[color-mix(in_srgb,var(--color-brand)_60%,transparent)]",
      "focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-brand)_18%,transparent)]",
      "focus:bg-[var(--color-s1)] focus:text-[var(--color-t1)]",
      "disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({
  children,
  htmlFor,
  className,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "block text-xs font-medium text-[var(--color-t2)] mb-1.5",
        className,
      )}
    >
      {children}
    </label>
  );
}
