import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden text-center py-16 px-5 rounded-[14px]",
        "bg-[color-mix(in_srgb,var(--color-s1)_60%,transparent)]",
        "border border-[var(--color-b1)]",
        className,
      )}
    >
      {/* Wireframe isométrico sutil de fondo — grafo de nodos */}
      <svg
        aria-hidden
        className="absolute inset-0 w-full h-full opacity-40 pointer-events-none"
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="wf-stroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--color-b2)" stopOpacity="0.2" />
          </linearGradient>
          <radialGradient id="wf-mask-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="wf-mask">
            <rect width="100%" height="100%" fill="url(#wf-mask-grad)" />
          </mask>
        </defs>
        <g
          mask="url(#wf-mask)"
          stroke="url(#wf-stroke)"
          strokeWidth="1"
          fill="none"
        >
          {/* nodos */}
          <circle cx="80" cy="150" r="18" />
          <circle cx="180" cy="100" r="14" />
          <circle cx="180" cy="200" r="14" />
          <circle cx="280" cy="150" r="18" />
          <circle cx="350" cy="80" r="10" />
          <circle cx="350" cy="220" r="10" />
          {/* conexiones */}
          <path d="M98 150 L 166 105" />
          <path d="M98 150 L 166 195" />
          <path d="M194 100 L 266 145" />
          <path d="M194 200 L 266 155" />
          <path d="M298 150 L 342 85" />
          <path d="M298 150 L 342 215" />
          {/* centro activo — brand fill sutil */}
          <circle
            cx="280"
            cy="150"
            r="6"
            fill="var(--color-brand)"
            fillOpacity="0.25"
          />
        </g>
      </svg>

      <div className="relative z-10">
        {Icon ? (
          <div
            className="mx-auto w-12 h-12 rounded-[12px] flex items-center justify-center mb-4"
            style={{
              background:
                "linear-gradient(135deg, var(--color-brand-muted), transparent)",
              border: "1px solid var(--color-brand-border)",
              boxShadow: "var(--shadow-glow)",
            }}
          >
            <Icon size={20} className="text-[var(--color-brand)]" strokeWidth={1.75} />
          </div>
        ) : null}
        <h2
          className="text-[17px] font-semibold text-[var(--color-t1)] mb-1.5"
          style={{ letterSpacing: "-0.015em" }}
        >
          {title}
        </h2>
        {description ? (
          <p className="text-[13px] text-[var(--color-t3)] max-w-sm mx-auto leading-relaxed">
            {description}
          </p>
        ) : null}
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}
