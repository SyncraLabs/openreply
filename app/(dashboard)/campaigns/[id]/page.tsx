import { redirect } from "next/navigation";

/**
 * Entrar en una campaña = editarla.
 *
 * Antes esta ruta era una ficha de solo lectura y para cambiar cualquier cosa
 * había que pulsar "Edit" y cargar otra pantalla. El 90% de las veces que se
 * abre una campaña es para tocarla, así que ese clic era peaje puro.
 *
 * Las métricas viven ahora en ./insights, a un clic desde el editor.
 */
export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/campaigns/${id}/edit`);
}
