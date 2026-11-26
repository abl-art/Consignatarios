'use client'

// Checklist del deposito por MODELO: el operario nunca ve los IMEIs esperados
// (anti-trampa) — cada escaneo se valida contra sha256(token + imei) y suma al
// contador de su modelo, que se tilda en verde al completarse. "Finalizar"
// tiene doble confirmacion cuando cierra con diferencias.

import { useRef, useState } from 'react'
import { finalizarControlAsn, type ChecklistAsn } from '@/lib/actions/asn-control'
import { normalizarScan } from '@/lib/asn-control'

type Flash = { tipo: 'ok' | 'nocorresponde' | 'repetido'; valor: string; modelo?: string } | null

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function ChecklistClient({ token, checklist }: { token: string; checklist: ChecklistAsn }) {
  const [leidos, setLeidos] = useState<string[]>([])
  const [porModelo, setPorModelo] = useState<Record<string, number>>({})
  const [valor, setValor] = useState('')
  const [flash, setFlash] = useState<Flash>(null)
  const [nota, setNota] = useState('')
  const [armado, setArmado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const hashesLeidos = useRef(new Set<string>())
  const inputRef = useRef<HTMLInputElement>(null)

  if (checklist.finalizado || hecho) {
    const r = checklist.resumenFinal
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 text-center space-y-3">
        <div className="text-4xl">✅</div>
        <h1 className="text-lg font-bold text-gray-900">Control de la ASN {checklist.transaccion} finalizado</h1>
        <p className="text-sm text-gray-600">
          {hecho ? '¡Gracias! El control quedó registrado en GOCUOTAS.' : r ? `${r.ok} tomados · ${r.faltantes} faltantes` : ''}
        </p>
        <a href={`/share/asn?token=${token}`} className="inline-block text-sm text-emerald-700 font-semibold">← Volver a las ASN pendientes</a>
      </div>
    )
  }

  const procesarScan = async () => {
    const v = normalizarScan(valor)
    setValor('')
    inputRef.current?.focus()
    if (!v) return
    const h = await sha256Hex(`${token}:${v}`)
    if (hashesLeidos.current.has(h)) {
      setFlash({ tipo: 'repetido', valor: v })
      return
    }
    const modelo = checklist.hashes[h]
    if (modelo) {
      hashesLeidos.current.add(h)
      setLeidos(prev => [...prev, v])
      setPorModelo(prev => ({ ...prev, [modelo]: (prev[modelo] ?? 0) + 1 }))
      setFlash({ tipo: 'ok', valor: v, modelo })
    } else {
      // No matchea: suele ser un codigo equivocado (caja, serie interna) — se
      // avisa y NO se registra (decision de Emiliano: solo importa que esten
      // los que deben estar)
      setFlash({ tipo: 'nocorresponde', valor: v })
    }
  }

  const faltan = checklist.totalEsperados - leidos.length
  const conDiferencias = faltan > 0

  const finalizar = async () => {
    setEnviando(true); setErr(null)
    const r = await finalizarControlAsn(token, checklist.asnId, leidos, [], nota)
    if (r.error) setErr(r.error)
    else setHecho(true)
    setEnviando(false)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5 sticky top-2 z-10 shadow-sm">
        <div className="flex items-baseline justify-between flex-wrap gap-1">
          <h1 className="text-lg font-bold text-gray-900">ASN {checklist.transaccion} — GOCUOTAS</h1>
          <span className="text-sm font-semibold text-gray-700">{leidos.length} de {checklist.totalEsperados}</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden mt-2">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${checklist.totalEsperados > 0 ? (leidos.length / checklist.totalEsperados) * 100 : 0}%` }}
          />
        </div>
        <input
          ref={inputRef}
          autoFocus
          value={valor}
          onChange={e => setValor(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); procesarScan() } }}
          placeholder="Escaneá el IMEI de cada caja…"
          inputMode="numeric"
          className="mt-3 w-full text-lg border-2 border-gray-300 rounded-xl px-4 py-3 focus:border-emerald-500 outline-none"
        />
        {flash && (
          <div className={`mt-2 rounded-lg px-3 py-2 text-sm font-semibold ${
            flash.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : flash.tipo === 'nocorresponde' ? 'bg-amber-50 text-amber-800 border border-amber-200'
            : 'bg-amber-50 text-amber-800 border border-amber-200'
          }`}>
            {flash.tipo === 'ok' && <>✓ {flash.valor} — {flash.modelo}</>}
            {flash.tipo === 'nocorresponde' && <>{flash.valor} no corresponde a esta ASN — verificá que estés escaneando el IMEI de la caja</>}
            {flash.tipo === 'repetido' && <>⟳ {flash.valor} — ya lo escaneaste</>}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Unidades por modelo</h2>
        <div className="space-y-3">
          {checklist.modelos.map(m => {
            const escaneados = porModelo[m.modelo] ?? 0
            const completo = escaneados >= m.total
            return (
              <div key={m.modelo}>
                <div className="flex justify-between text-sm mb-1">
                  <span className={`font-medium ${completo ? 'text-emerald-700' : 'text-gray-800'}`}>
                    {completo && '✓ '}{m.modelo}
                  </span>
                  <span className={`tabular-nums font-semibold ${completo ? 'text-emerald-700' : 'text-gray-600'}`}>
                    {escaneados} / {m.total}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${completo ? 'bg-emerald-500' : 'bg-emerald-300'}`}
                    style={{ width: `${m.total > 0 ? Math.min(100, (escaneados / m.total) * 100) : 0}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <textarea
          value={nota}
          onChange={e => setNota(e.target.value)}
          placeholder="Observaciones (opcional): cajas dañadas, faltantes visibles, etc."
          rows={2}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
        />
        {err && <p className="text-sm text-red-600">{err}</p>}
        {!armado ? (
          <button
            onClick={() => (conDiferencias ? setArmado(true) : finalizar())}
            disabled={enviando}
            className="w-full px-5 py-3 bg-gray-900 text-white text-base font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50"
          >
            {enviando ? 'Enviando…' : conDiferencias ? `Finalizar control (faltan ${faltan})` : 'Finalizar control ✓'}
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              Vas a cerrar con {faltan} faltantes. Los faltantes se informan a GOCUOTAS.
              ¿Estás seguro de que querés cerrar?
            </p>
            <div className="flex gap-2">
              <button onClick={finalizar} disabled={enviando}
                className="flex-1 px-5 py-3 bg-red-600 text-white text-base font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50">
                {enviando ? 'Enviando…' : 'Sí, cerrar con diferencias'}
              </button>
              <button onClick={() => setArmado(false)} disabled={enviando}
                className="flex-1 px-5 py-3 bg-gray-100 text-gray-700 text-base font-semibold rounded-xl hover:bg-gray-200">
                Seguir escaneando
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
