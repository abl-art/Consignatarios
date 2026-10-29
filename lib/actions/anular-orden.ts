'use server'

// Anular orden (reembolso TOTAL por la API Redirect de GOcuotas) desde las
// pestañas Rescates y Devoluciones: el botón VIAJA con la línea (decisión de
// Emiliano 28/10) y se habilita según el estado de la acción de Pedro —
// rescate_confirmado/recibido o retiro_realizado/devolucion_recibida. La
// acción de reembolso en sí no cambia (misma API que Arrepentimientos).

import { revalidatePath } from 'next/cache'
import { reembolsarOrdenGocuotas, getOrdenGocuotas } from '@/lib/gocuotas-api'
import { puedeAnularOrden } from '@/lib/arrepentimientos'

export async function anularOrdenCaso(input: {
  gocuotasOrderId: string
  gocuotasStatus: string | null
  rescateEstado?: string | null
  devolucionEstado?: string | null
}): Promise<{ ok?: true; statusNuevo?: string; error?: string }> {
  // Mismo guard que Arrepentimientos: la fila de Rescates/Devoluciones es por
  // definición un caso expedido, el umbral lo pone el estado de Pedro.
  const guard = puedeAnularOrden({
    estado: 'pendiente',
    gocuotasOrderId: input.gocuotasOrderId,
    gocuotasStatus: input.gocuotasStatus,
    fulfillment: 'expedido',
    rescateEstado: input.rescateEstado ?? null,
    devolucionEstado: input.devolucionEstado ?? null,
  })
  if (!guard.ok) return { error: guard.error }

  const refund = await reembolsarOrdenGocuotas(input.gocuotasOrderId)
  if (!refund.ok) return { error: refund.error }

  // Verificación post-refund contra la API (la réplica puede tardar en reflejarlo)
  const orden = await getOrdenGocuotas(input.gocuotasOrderId)
  const statusNuevo = orden?.discarded_at ? 'discarded' : (orden?.status ?? undefined)
  revalidatePath('/compras/envios')
  return { ok: true, statusNuevo }
}
