'use server'

// Anular orden (reembolso TOTAL por la API Redirect de GOcuotas) desde las
// pestañas Rescates y Devoluciones: el botón VIAJA con la línea (decisión de
// Emiliano 28/10) y se habilita según el estado de la acción de Pedro —
// rescate_confirmado/recibido o retiro_realizado/devolucion_recibida. La
// acción de reembolso en sí no cambia (misma API que Arrepentimientos).
//
// Seguridad (fix review 29/10): el estado que habilita el reembolso se
// RE-CONSULTA fresco a Pedro acá adentro — el que manda el browser pinta el
// botón, nunca autoriza. La traza e idempotencia viven en refunds_api: la
// fila se inserta antes del refund (PK = candado contra doble disparo) y se
// borra si el refund falla, para permitir el reintento.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { reembolsarOrdenGocuotas, getOrdenGocuotas } from '@/lib/gocuotas-api'
import { puedeAnularOrden } from '@/lib/arrepentimientos'
import { getCancelacionEstado } from '@/lib/gocelular-webhook'
import { estadosDesdeGetCancelacion } from '@/lib/estados-andreani'

export async function anularOrdenCaso(input: {
  gocuotasOrderId: string
  gocuotasStatus: string | null
  orderNumber: string
}): Promise<{ ok?: true; statusNuevo?: string; error?: string }> {
  // Estado fresco de Pedro: la única fuente que habilita mover plata
  const res = await getCancelacionEstado({ order_number: input.orderNumber })
  if (!res.ok) return { error: 'No se pudo consultar el estado del caso en GOcelular — reintentá en un rato (el reembolso solo se habilita con el estado fresco).' }
  const { rescateEstado, devolucionEstado } = estadosDesdeGetCancelacion(res.body)

  // Mismo guard que Arrepentimientos: la fila de Rescates/Devoluciones es por
  // definición un caso expedido, el umbral lo pone el estado de Pedro.
  const guard = puedeAnularOrden({
    estado: 'pendiente',
    gocuotasOrderId: input.gocuotasOrderId,
    gocuotasStatus: input.gocuotasStatus,
    fulfillment: 'expedido',
    rescateEstado,
    devolucionEstado,
  })
  if (!guard.ok) return { error: guard.error }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión vencida — volvé a iniciar sesión.' }

  // Candado: si ya hay una fila, alguien lo disparó antes (otra pestaña, otro usuario)
  const admin = createAdminClient()
  const { error: lockError } = await admin.from('refunds_api').insert({
    gocuotas_order_id: input.gocuotasOrderId,
    order_number: input.orderNumber,
    usuario: user.email ?? user.id,
    contexto: rescateEstado ? 'rescate' : 'devolucion',
    detalle: 'pendiente',
  })
  if (lockError) {
    return { error: lockError.code === '23505' ? 'Ya hay un reembolso disparado para esta orden.' : lockError.message }
  }

  const refund = await reembolsarOrdenGocuotas(input.gocuotasOrderId)
  if (!refund.ok) {
    // Liberar el candado: el refund no salió, se puede reintentar
    await admin.from('refunds_api').delete().eq('gocuotas_order_id', input.gocuotasOrderId)
    return { error: refund.error }
  }
  await admin.from('refunds_api').update({ detalle: refund.detalle }).eq('gocuotas_order_id', input.gocuotasOrderId)

  // Verificación post-refund contra la API (la réplica puede tardar en reflejarlo)
  const orden = await getOrdenGocuotas(input.gocuotasOrderId)
  const statusNuevo = orden?.discarded_at ? 'discarded' : (orden?.status ?? undefined)
  revalidatePath('/compras/envios')
  return { ok: true, statusNuevo }
}
