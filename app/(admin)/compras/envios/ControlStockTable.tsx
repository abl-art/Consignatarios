import type { ControlStockAndreani } from '@/lib/gocelular'

// Control de stock: lo que informa la API de Andreani (wh_stock_readings,
// job de GOcelular cada 6 horas) contra el disponible de GOcelular. La vista
// por modelo netea los SKUs (colores) del mismo modelo: stock cargado en otro
// color-SKU no es faltante real.

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

function DifBadge({ dif }: { dif: number }) {
  if (dif === 0) return <span className="text-green-600 font-medium">✓ 0</span>
  return (
    <span className={`font-bold ${Math.abs(dif) >= 5 ? 'text-red-600' : 'text-amber-600'}`}>
      {dif > 0 ? '+' : ''}{dif}
    </span>
  )
}

export default function ControlStockTable({ control }: { control: ControlStockAndreani }) {
  if (!control.runAt || control.filas.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-8 text-center">
        Sin lecturas de stock de Andreani (tabla wh_stock_readings vacía o GOcelular no disponible).
      </p>
    )
  }

  const medidas = control.filas.filter(f => f.medido)
  const sinMedir = control.filas.filter(f => !f.medido)
  const conDif = medidas.filter(f => f.dif !== 0)
  const unidadesDif = conDif.reduce((s, f) => s + Math.abs(f.dif), 0)

  // Neto por modelo: SKUs (colores) del mismo modelo se compensan entre sí
  const porModelo = new Map<string, { andDisponible: number; goDisponible: number; skus: number }>()
  for (const f of medidas) {
    const m = porModelo.get(f.nombre) ?? { andDisponible: 0, goDisponible: 0, skus: 0 }
    m.andDisponible += f.andDisponible
    m.goDisponible += f.goDisponible
    m.skus++
    porModelo.set(f.nombre, m)
  }
  const modelos = [...porModelo.entries()]
    .map(([nombre, m]) => ({ nombre, ...m, dif: m.andDisponible - m.goDisponible }))
    .sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif) || a.nombre.localeCompare(b.nombre))
  const unidadesDifNeta = modelos.reduce((s, m) => s + Math.abs(m.dif), 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Última corrida</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fechaHora(control.runAt)}</p>
          <p className="text-xs text-gray-400 mt-1">API de Andreani, cada 6 horas</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">SKUs medidos</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{medidas.length}</p>
          <p className="text-xs text-gray-400 mt-1">{sinMedir.length > 0 ? `${sinMedir.length} con stock sin medir` : 'cobertura completa'}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">SKUs con diferencia</p>
          <p className={`text-2xl font-bold mt-1 ${conDif.length > 0 ? 'text-amber-600' : 'text-green-700'}`}>{conDif.length}</p>
          <p className="text-xs text-gray-400 mt-1">{unidadesDif} unidades por SKU</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Diferencia neta por modelo</p>
          <p className={`text-2xl font-bold mt-1 ${unidadesDifNeta > 0 ? 'text-red-600' : 'text-green-700'}`}>{unidadesDifNeta}</p>
          <p className="text-xs text-gray-400 mt-1">colores del mismo modelo se netean</p>
        </div>
      </div>

      {/* Por modelo (neto) */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">Por modelo (neto)</h2>
        <p className="text-xs text-gray-500 mb-3">La diferencia que importa: si el stock está cargado en otro color-SKU del mismo modelo, acá se compensa</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                <th className="py-2 px-3 font-medium">Modelo</th>
                <th className="py-2 px-3 font-medium text-right">SKUs</th>
                <th className="py-2 px-3 font-medium text-right">Andreani disp.</th>
                <th className="py-2 px-3 font-medium text-right">GOcelular disp.</th>
                <th className="py-2 px-3 font-medium text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {modelos.map(m => (
                <tr key={m.nombre} className={`border-b border-gray-100 ${m.dif !== 0 ? 'bg-amber-50/40' : ''}`}>
                  <td className="py-1.5 px-3 text-gray-900">{m.nombre}</td>
                  <td className="py-1.5 px-3 text-right text-gray-500">{m.skus}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-700">{m.andDisponible}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-700">{m.goDisponible}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums"><DifBadge dif={m.dif} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Por SKU */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">Por SKU</h2>
        <p className="text-xs text-gray-500 mb-3">Detalle por SKU de color; diferencia = disponible Andreani − disponible GOcelular</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                <th className="py-2 px-3 font-medium">SKU</th>
                <th className="py-2 px-3 font-medium">Modelo</th>
                <th className="py-2 px-3 font-medium text-right">And. total</th>
                <th className="py-2 px-3 font-medium text-right">And. disponible</th>
                <th className="py-2 px-3 font-medium text-right">And. asignada</th>
                <th className="py-2 px-3 font-medium text-right">GOcelular disp.</th>
                <th className="py-2 px-3 font-medium text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {control.filas.map(f => (
                <tr key={f.sku} className={`border-b border-gray-100 ${f.medido && f.dif !== 0 ? 'bg-amber-50/40' : ''}`}>
                  <td className="py-1.5 px-3 font-mono text-xs text-gray-600">{f.sku}</td>
                  <td className="py-1.5 px-3 text-gray-900">
                    {f.nombre}
                    {!f.medido && !f.error && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium">sin medir</span>
                    )}
                    {f.error && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-medium" title={f.error}>error</span>
                    )}
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-500">{f.medido ? f.andTotal : '—'}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-700">{f.medido ? f.andDisponible : '—'}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-500">{f.medido ? f.andAsignada : '—'}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-700">{f.goDisponible}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">{f.medido ? <DifBadge dif={f.dif} /> : <span className="text-gray-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historial de corridas */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Corridas recientes</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                <th className="py-2 px-3 font-medium">Corrida</th>
                <th className="py-2 px-3 font-medium text-right">SKUs medidos</th>
                <th className="py-2 px-3 font-medium text-right">Con diferencia</th>
                <th className="py-2 px-3 font-medium text-right">Unidades dif.</th>
                <th className="py-2 px-3 font-medium text-right">Errores</th>
              </tr>
            </thead>
            <tbody>
              {control.corridas.map(c => (
                <tr key={c.runAt} className="border-b border-gray-100">
                  <td className="py-1.5 px-3 text-gray-900 whitespace-nowrap">{fechaHora(c.runAt)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-700">{c.medidos}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-700">{c.conDiferencia}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-gray-700">{c.unidadesDif}</td>
                  <td className={`py-1.5 px-3 text-right tabular-nums ${c.errores > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{c.errores}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          Fuente: wh_stock_readings de GOcelular — un job consulta la API de Andreani cada 6 horas. La corrida de las
          ~21:44 ART falla siempre con error: ventana de mantenimiento de Andreani, no es un problema nuestro.
        </p>
      </div>
    </div>
  )
}
