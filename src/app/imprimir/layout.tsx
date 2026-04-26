/**
 * Layout minimal para la ruta /imprimir.
 *
 * Esta ruta está FUERA del grupo (admin) a propósito: el contrato se
 * imprime tal cual sin Topbar, sin footer, sin command palette, sin
 * ningún chrome. Eso evita los artefactos que aparecían cuando los
 * elementos sticky del admin layout se metían en el PDF.
 *
 * La auth la hace el page server-side (createClient + RLS); si no hay
 * sesión, RLS bloquea la query y el page redirige.
 */
export default function ImprimirLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
