import { ConfiguracionClient } from "./ConfiguracionClient";
import { getAgencySettings } from "@/app/(admin)/contratos/actions";

export const metadata = { title: "Configuración" };
export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const res = await getAgencySettings();
  // Si falla por algún motivo, pasamos null y el client toma valores vacíos.
  const initial = res.ok ? res.data : null;
  return <ConfiguracionClient initial={initial} />;
}
