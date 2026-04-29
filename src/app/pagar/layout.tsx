// Layout mínimo para la vista pública de cobros (/pagar/[token]).
// No incluye el chrome del admin: el cliente no está autenticado y solo
// debería ver la información de su cuenta y los botones de pago.

export const metadata = {
  title: "Pagar · Codexy",
  robots: { index: false, follow: false },
};

export default function PagarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
