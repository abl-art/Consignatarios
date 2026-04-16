import { createClient } from '@/lib/supabase/server'
import type { SyncLog } from '@/lib/types'
import SyncButton from './SyncButton'

function StatusBadge({ status }: { status: SyncLog['status'] }) {
  const styles = {
    running: 'bg-blue-100 text-blue-700',
    ok: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
  } as const
  const labels = {
    running: 'En curso',
    ok: 'OK',
    error: 'Error',
  } as const
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export default async function SyncPage() {
  const supabase = createClient()

  const { data: rawLogs } = await supabase
    .from('sync_log')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(20)
    .returns<SyncLog[]>()

  const logs = rawLogs ?? []
  const lastOk = logs.find((l) => l.status === 'ok')
  const lastRun = logs[0] ?? null

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Sincronización con GOcelular</h1>
        <p className="text-sm text-gray-500">
          Importa ventas desde el sistema GOcelular y las vincula con dispositivos en consignación.
        </p>
      </div>

      {/* Action card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-semibold text-gray-800 mb-1">Ejecutar sincronización</h2>
            <p className="text-xs text-gray-400">
              {lastRun
                ? `Última ejecución: ${formatDate(lastRun.started_at)} · Estado: `
                : 'Nunca ejecutada'}
              {lastRun && <StatusBadge status={lastRun.status} />}
            </p>
          </div>
          <SyncButton />
        </div>

        {lastOk && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-gray-100">
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">Ventas nuevas</p>
              <p className="text-xl font-bold text-green-600">{lastOk.ventas_nuevas}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">Ya existían</p>
              <p className="text-xl font-bold text-gray-700">{lastOk.ventas_ya_existentes}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">Sin match</p>
              <p className="text-xl font-bold text-gray-700">{lastOk.dispositivos_no_encontrados}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">Alertas sucursal</p>
              <p className="text-xl font-bold text-amber-600">
                {lastOk.detalle?.store_mismatches?.length ?? 0}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Log table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Historial de sincronizaciones</h2>
          <p className="text-xs text-gray-400 mt-0.5">Últimas 20 ejecuciones</p>
        </div>

        {logs.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-gray-400">Sin ejecuciones registradas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Fecha
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Estado
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Nuevas
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Ya existían
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Sin match
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Warnings
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {formatDate(log.started_at)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={log.status} />
                      {log.error_msg && (
                        <p className="text-xs text-red-500 mt-0.5 max-w-xs truncate">{log.error_msg}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-600">
                      {log.ventas_nuevas}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {log.ventas_ya_existentes}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {log.dispositivos_no_encontrados}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {log.detalle?.store_mismatches?.length ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
