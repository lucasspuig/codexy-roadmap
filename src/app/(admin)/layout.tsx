import { redirect } from "next/navigation";

import { Topbar } from "@/components/admin/Topbar";
import { CommandPaletteProvider } from "@/components/admin/CommandPalette";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

type ProfileSlim = Pick<Profile, "id" | "email" | "nombre" | "avatar_url" | "activo" | "role">;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, email, nombre, avatar_url, activo, role")
    .eq("id", user.id)
    .single();

  const profile = profileData as ProfileSlim | null;

  if (!profile || !profile.activo) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <CommandPaletteProvider>
      <div className="admin-shell flex-1 flex flex-col min-h-screen">
        <Topbar
          userEmail={profile.email ?? user.email ?? null}
          userName={profile.nombre}
          avatarUrl={profile.avatar_url}
        />
        <main className="flex-1 flex flex-col relative z-0">{children}</main>
        <footer className="hidden sm:flex items-center justify-between gap-3 px-6 lg:px-7 py-3 text-[11px] border-t border-[var(--color-b1)] bg-[var(--color-bg)]/40 backdrop-blur">
          <div className="flex items-center gap-2 text-[var(--color-t3)]">
            <span className="font-mono">Codexy Roadmaps</span>
            <span className="text-[var(--color-b2)]">·</span>
            <span>v1.0</span>
          </div>
          <div className="hidden md:flex items-center gap-3 text-[var(--color-t3)]">
            <span>
              <kbd className="kbd">⌘</kbd>
              <kbd className="kbd ml-1">K</kbd>
              <span className="ml-1.5">buscar</span>
            </span>
            <span>
              <kbd className="kbd">G</kbd>
              <kbd className="kbd ml-1">D</kbd>
              <span className="ml-1.5">dashboard</span>
            </span>
            <span>
              <kbd className="kbd">?</kbd>
              <span className="ml-1.5">shortcuts</span>
            </span>
          </div>
        </footer>
      </div>
    </CommandPaletteProvider>
  );
}
