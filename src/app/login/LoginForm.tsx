"use client";

import { useActionState } from "react";
import { Mail, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-3.5">
      <div>
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-t3)]"
            size={15}
          />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="pl-9"
            placeholder="tu@codexy.com"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="password">Contraseña</Label>
        <div className="relative">
          <KeyRound
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-t3)]"
            size={15}
          />
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            className="pl-9"
            placeholder="••••••••"
          />
        </div>
      </div>
      {state.error ? (
        <p className="text-[12px] text-[var(--color-danger)] animate-shake">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
        Ingresar
      </Button>
    </form>
  );
}
