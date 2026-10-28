import {
  getSegurosConfig,
  getCertificados,
  sincronizarSeguros,
  type SegurosConfig,
} from '@/lib/actions/seguros'
import { devengoMensual, tasaSiniestralidad, type CertDevengo } from '@/lib/seguros-informes'
import { fetchFacturasBPorOrden } from '@/lib/gocelular'
import { getUsuarioActual } from '@/lib/permisos-server'
import { puedeOperar } from '@/lib/permisos'
import SegurosTabs from '@/components/seguros/SegurosTabs'
import CertificadosTab from '@/components/seguros/CertificadosTab'
import PrimaMensualTab from '@/components/seguros/PrimaMensualTab'
import ResultadoTab from '@/components/seguros/ResultadoTab'

// Siempre fresco: sincronizarSeguros() corre emisión/novedades en cada visita
// y las server actions (activar/desactivar, setParametro) ya revalidan
// '/seguros' — sin esto el RSC payload podría quedar cacheado entre cargas.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CONFIG_VACIA: SegurosConfig = { activo: false, activadoAt: null, parametros: [] }

export default async function SegurosPage() {
  const usuario = await getUsuarioActual()
  const operar = usuario?.rol === 'admin' || puedeOperar(usuario?.permisos ?? {}, 'seguros')

  // sincronizarSeguros() puede fallar (lecturas a GOcelular/GOcuotas, RPCs de
  // emisión) — se captura y se muestra una banda de aviso, pero la página
  // sigue renderizando con lo que ya está persistido (config + certificados).
  let syncError: string | null = null
  try {
    await sincronizarSeguros()
  } catch (e) {
    syncError = e instanceof Error ? e.message : 'Error desconocido al sincronizar'
  }

  // getCertificados() ya swallowea errores de query devolviendo [] (ver
  // lib/actions/seguros.ts), pero un fallo antes de esa query (ej.
  // createAdminClient() tirando por env vars faltantes) rechazaría la
  // promesa igual — este catch le da la misma garantía de "nunca tira" que
  // getSegurosConfig(), y marca el flag para avisar en el banner en vez de
  // mostrar en silencio una tabla vacía como si no hubiera certificados.
  let certificadosError = false
  const [config, certificados] = await Promise.all([
    getSegurosConfig().catch(() => CONFIG_VACIA),
    getCertificados().catch(() => {
      certificadosError = true
      return []
    }),
  ])

  const emitidosIds = certificados.filter((c) => c.estado !== 'pendiente').map((c) => c.gocuotasOrderId)
  const facturasMap = await fetchFacturasBPorOrden(emitidosIds).catch(() => new Map<string, { numero: string; fecha: string }>())
  const facturas = Object.fromEntries(facturasMap)

  // hastaMes = mes actual: el devengo es un control histórico (prima/ingreso
  // ya cobrados sobre certificados emitidos), no hay nada que proyectar hacia
  // meses futuros todavía sin vigencia.
  const now = new Date()
  const hastaMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const primas = config.parametros.filter((p) => p.tipo === 'prima')
  const ingresos = config.parametros.filter((p) => p.tipo === 'ingreso')

  const certsDevengo: CertDevengo[] = certificados
    .filter((c) => c.estado !== 'pendiente')
    .map((c) => ({
      costoSinIva: c.costoSinIva ?? 0,
      sumaAsegurada: c.sumaAsegurada ?? 0,
      inicioVig: c.inicioVig,
      finVig: c.finVig,
      fechaAnula: c.fechaAnula,
      fechaSiniestro: c.fechaSiniestro,
      estado: c.estado,
    }))

  const devengo = devengoMensual(certsDevengo, primas, ingresos, hastaMes)
  const siniestralidad = tasaSiniestralidad(certificados)

  const tabs = [
    {
      id: 'certificados',
      label: 'Certificados',
      content: <CertificadosTab certificados={certificados} config={config} facturas={facturas} operar={operar} />,
    },
    {
      id: 'prima',
      label: 'Prima Mensual',
      content: <PrimaMensualTab devengo={devengo} primas={primas} operar={operar} />,
    },
    {
      id: 'resultado',
      label: 'Resultado',
      content: <ResultadoTab devengo={devengo} ingresos={ingresos} siniestralidad={siniestralidad} operar={operar} />,
    },
  ]

  return (
    <div className="p-4 md:p-6 max-w-full mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Seguros por Robo</h1>
      <p className="text-sm text-gray-500 mb-6">Certificados, prima mensual y resultado del seguro por robo</p>

      {(syncError || certificadosError) && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-1">
          {syncError && (
            <p>No se pudo sincronizar automáticamente ({syncError}). Mostrando el último estado guardado.</p>
          )}
          {certificadosError && (
            <p>No se pudieron leer los certificados — la tabla puede verse vacía aunque haya certificados cargados. Reintentá recargando la página.</p>
          )}
        </div>
      )}

      <SegurosTabs tabs={tabs} />
    </div>
  )
}
