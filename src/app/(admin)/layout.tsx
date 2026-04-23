import { redirect } from "next/navigation";

import { Topbar } from "@/components/admin/Topbar";
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
    <div className="flex-1 flex flex-col min-h-screen">
      <Topbar
        userEmail={profile.email ?? user.email ?? null}
        userName={profile.nombre}
        avatarUrl={profile.avatar_url}
      />
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
