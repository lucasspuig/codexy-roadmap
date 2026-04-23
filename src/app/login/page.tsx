import { Logo } from "@/components/ui/Logo";

import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-5">
      <div className="bg-[var(--color-s1)] border border-[var(--color-b1)] rounded-[14px] p-9 w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <Logo size={32} />
          <span className="text-base font-semibold">Codexy</span>
        </div>
        <h1 className="text-[20px] font-semibold text-center mb-1">
          Panel de administración
        </h1>
        <p className="text-[13px] text-[var(--color-t3)] text-center mb-6">
          Ingresá con tu cuenta para continuar
        </p>
        <LoginForm />
        <p className="text-[11px] text-[var(--color-t3)] text-center mt-6">
          Solo personal autorizado. Los accesos quedan registrados.
        </p>
      </div>
    </div>
  );
}
