export const dynamic = 'force-dynamic'

import { getSupabasePool } from '@/lib/db-pool'
import BotonVolver from './BotonVolver'

// Página de referencia de la segmentación A1–D4 (doc "Estructura de Crédito -
// Ecosistema GO"). Linkeada desde los filtros de PD/DPD/Vintage y la card de
// segmentos del Dashboard360.

const LETRAS = [
  { letra: 'A', rango: 'Límite mayor a 4.8 tickets', desc: 'Los clientes de mayor capacidad: GOscore les asignó el límite más alto. Tienen habilitados todos los productos del ecosistema.' },
  { letra: 'B', rango: 'Límite entre 2 y 4.8 tickets', desc: 'Capacidad media-alta. Acceden a casi todos los productos, incluido GOadelantos si tienen antigüedad.' },
  { letra: 'C', rango: 'Límite entre 1 y 2 tickets', desc: 'Capacidad media-baja. Sin acceso a GOadelantos; GOpremium solo con antigüedad.' },
  { letra: 'D', rango: 'Límite menor a 1 ticket', desc: 'Límite mínimo: el sistema todavía no les confía más. Solo productos básicos (GOcuotas, GOqr).' },
]

const NUMEROS = [
  { numero: '1', rango: 'Más de 12 meses activo', desc: 'Historial largo en el ecosistema: su comportamiento de pago ya es conocido.' },
  { numero: '2', rango: 'Entre 4 y 12 meses', desc: 'En consolidación: ya operan pero el historial todavía es corto.' },
  { numero: '3', rango: 'Menos de 4 meses', desc: 'Recién llegados al ecosistema: primeras operaciones BNPL.' },
  { numero: '4', rango: 'GOcelular fue su 1ª compra', desc: 'Sin historial previo en GO: la compra del celular fue su primera operación en todo el ecosistema. Ahí empieza su historial.' },
]

const CELDAS: Record<string, string> = {
  A1: 'El cliente estrella: límite alto y más de un año de historial. Máxima confianza del ecosistema.',
  A2: 'Límite alto, 4–12 meses operando. En camino a A1.',
  A3: 'Límite alto y recién llegado: GOscore le vio buena capacidad de entrada.',
  A4: 'Entró al ecosistema comprando un celular y con límite alto de arranque.',
  B1: 'Capacidad media-alta con historial largo. Muy confiable.',
  B2: 'Media-alta en consolidación.',
  B3: 'Media-alta y nuevo en GO: prometedor pero con historial corto.',
  B4: 'Su primera operación en GO fue el celular, con límite medio-alto.',
  C1: 'Límite bajo pero más de un año cumpliendo: capacidad acotada, comportamiento conocido.',
  C2: 'Límite bajo, 4–12 meses de historial.',
  C3: 'Límite bajo y recién llegado al ecosistema.',
  C4: 'El segmento más grande de GOcelular: entró por el celular, con límite bajo.',
  D1: 'Límite mínimo pese a +1 año de historial: el sistema no le subió el límite — puede indicar comportamiento flojo.',
  D2: 'Límite mínimo, 4–12 meses.',
  D3: 'Límite mínimo y nuevo: el mayor riesgo relativo entre los que ya operaban.',
  D4: 'Entró por el celular con el límite más chico: apuesta sin historial.',
]

function fmtPesos(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

async function fetchTicketPromedio(): Promise<number> {
  const pool = getSupabasePool()
  if (!pool) return 0
  try {
    const res = await pool.query<{ tp: string }>(`SELECT MAX(ticket_promedio) AS tp FROM segmentos_clientes`)
    return Number(res.rows[0]?.tp ?? 0)
  } catch {
    return 0
  }
}

export default async function SegmentosPage() {
  const tp = await fetchTicketPromedio()

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Segmentos de clientes</h1>
        <BotonVolver />
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Estructura de Crédito del Ecosistema GO: cada cliente se clasifica en uno de 16 segmentos que combinan
        una <strong>letra</strong> (cuánto crédito le confía GO) y un <strong>número</strong> (cuánto historial tiene).
        Se recalculan todos los días.
      </p>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-900 mb-1">La letra: el límite asignado</h2>
        <p className="text-xs text-gray-500 mb-3">
          Es el límite general del cliente (definido por GOscore) medido en <strong>tickets promedio</strong> — el valor
          de una compra típica de GOcuotas, que se recalcula a diario para que la inflación no desactualice la vara.
          {tp > 0 && <> Hoy 1 ticket ≈ <strong>{fmtPesos(tp)}</strong>.</>}
        </p>
        <div className="space-y-2">
          {LETRAS.map(l => (
            <div key={l.letra} className="flex gap-3 items-start">
              <span className="w-7 h-7 shrink-0 rounded-lg bg-gray-900 text-white text-sm font-bold flex items-center justify-center">{l.letra}</span>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {l.rango}
                  {tp > 0 && l.letra === 'A' && <span className="font-normal text-gray-400"> (&gt; {fmtPesos(tp * 4.8)})</span>}
                  {tp > 0 && l.letra === 'B' && <span className="font-normal text-gray-400"> ({fmtPesos(tp * 2)} – {fmtPesos(tp * 4.8)})</span>}
                  {tp > 0 && l.letra === 'C' && <span className="font-normal text-gray-400"> ({fmtPesos(tp)} – {fmtPesos(tp * 2)})</span>}
                  {tp > 0 && l.letra === 'D' && <span className="font-normal text-gray-400"> (&lt; {fmtPesos(tp)})</span>}
                </p>
                <p className="text-xs text-gray-500">{l.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-900 mb-1">El número: la antigüedad</h2>
        <p className="text-xs text-gray-500 mb-3">
          Meses desde su primera orden BNPL en el ecosistema GO — <strong>sin contar las compras hechas en GOcelular</strong>:
          si el celular fue su primera operación, el cliente es un &ldquo;4&rdquo; porque su historial empieza ahí.
        </p>
        <div className="space-y-2">
          {NUMEROS.map(n => (
            <div key={n.numero} className="flex gap-3 items-start">
              <span className="w-7 h-7 shrink-0 rounded-lg bg-blue-600 text-white text-sm font-bold flex items-center justify-center">{n.numero}</span>
              <div>
                <p className="text-sm font-medium text-gray-900">{n.rango}</p>
                <p className="text-xs text-gray-500">{n.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Los 16 segmentos</h2>
        <div className="space-y-1.5">
          {Object.entries(CELDAS).map(([seg, desc]) => (
            <div key={seg} className="flex gap-3 items-baseline">
              <span className="w-8 shrink-0 text-sm font-bold text-gray-900">{seg}</span>
              <p className="text-xs text-gray-600">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-3">
          Lectura rápida: A1 (arriba-izquierda de la matriz) es la mejor cartera; D3/D4 la de mayor riesgo relativo.
          Con el cron diario, un cliente &ldquo;4&rdquo; que hace su primera compra BNPL fuera de GOcelular pasa a &ldquo;3&rdquo;
          y va madurando hacia &ldquo;1&rdquo;.
        </p>
      </div>

      <div className="flex justify-end">
        <BotonVolver />
      </div>
    </div>
  )
}
