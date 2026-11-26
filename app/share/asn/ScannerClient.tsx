'use client'

// Escaner del deposito: input siempre enfocado (los lectores de codigo de
// barras tipean + Enter). Verde = IMEI esperado, rojo = no pertenece a la ASN,
// amarillo = repetido. "Finalizar control" guarda todo de una (provisorio: el
// avance no se persiste hasta finalizar — no cerrar la pagina a medias).

import { useRef, useState } from 'react'
import { finalizarControlAsn, type ControlPublico } from '@/lib/actions/asn-control'
import { normalizarScan } from '@/lib/asn-control'

type Flash = { tipo: 'ok' | 'sobrante' | 'repetido'; valor: string } | null

export default function ScannerClient({ token, control }: { token: string; control: ControlPublico }) {
  const [leidos, setLeidos] = useState<string[]>([])
  const [sobrantes, setSobrantes] = useState<string[]>([])
  const [valor, setValor] = useState('')
  const [flash, setFlash] = useState<Flash>(null)
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const esperados = new Set(control.esperados.map(normalizarScan))

  // Vista read-only si el control ya se cerro (o recien se finalizo)
  if (control.estado === 'finalizado' || hecho) {
    const r = control.resultado
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 text-center space-y-3">
        <div className="text-4xl">✅</div>
        <h1 className="text-lg font-bold text-gray-900">Control de la ASN {control.transaccion} finalizado</h1>
        {hecho ? (
          <p className="text-sm text-gray-600">¡Gracias! El control quedó registrado en GOcuotas.</p>
        ) : r ? (
          <p className="text-sm text-gray-600">
            {r.ok.length} OK · {r.faltantes.length} faltantes · {r.sobrantes.length} sobrantes
            {control.finalizadoAt ? ` · cerrado el ${new Date(control.finalizadoAt).toLocaleDateString('es-AR')}` : ''}
          </p>
        ) : null}
      </div>
    )
  }

  const procesarScan = () => {
    const v = normalizarScan(valor)
    setValor('')
    inputRef.current?.focus()
    if (!v) return
    if (leidos.includes(v) || sobrantes.includes(v)) {
      setFlash({ tipo: 'repetido', valor: v })
      return
    }
    if (esperados.has(v)) {
      setLeidos([...leidos, v])
      setFlash({ tipo: 'ok', valor: v })
    } else {
      setSobrantes([...sobrantes, v])
      setFlash({ tipo: 'sobrante', valor: v })
    }
  }

  const faltan = control.esperados.length - leidos.length

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h1 className="text-lg font-bold text-gray-900">Control de ingreso — ASN {control.transaccion}</h1>
        <p className="text-sm text-gray-500 mt-0.5">GOCUOTAS · Escaneá el IMEI de cada caja. Al terminar, tocá Finalizar.</p>

        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{leidos.length} de {control.esperados.length} escaneados</span>
            {sobrantes.length > 0 && <span className="text-red-600 font-semibold">{sobrantes.length} no corresponden</span>}
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${control.esperados.length > 0 ? (leidos.length / control.esperados.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        <input
          ref={inputRef}
          autoFocus
          value={valor}
          onChange={e => setValor(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); procesarScan() } }}
          placeholder="Escaneá o escribí el IMEI y Enter…"
          inputMode="numeric"
          className="mt-4 w-full text-lg border-2 border-gray-300 rounded-xl px-4 py-3 focus:border-emerald-500 outline-none"
        />

        {flash && (
          <div className={`mt-3 rounded-lg px-4 py-3 text-sm font-semibold ${
            flash.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : flash.tipo === 'sobrante' ? 'bg-red-50 text-red-800 border border-red-200'
            : 'bg-amber-50 text-amber-800 border border-amber-200'
          }`}>
            {flash.tipo === 'ok' && <>✓ {flash.valor} — OK, pertenece a esta ASN</>}
            {flash.tipo === 'sobrante' && <>✗ {flash.valor} — NO pertenece a esta ASN (quedó anotado)</>}
            {flash.tipo === 'repetido' && <>⟳ {flash.valor} — ya lo escaneaste</>}
          </div>
        )}
      </div>

      {control.addons.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Bultos sin IMEI de esta ASN (control visual)</h2>
          <ul className="text-sm text-gray-600 space-y-1">
            {control.addons.map(a => <li key={a.sku}>• {a.sku}: <b>{a.cantidad}</b> unidades</li>)}
          </ul>
        </div>
      )}

      {(leidos.length > 0 || sobrantes.length > 0) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          {sobrantes.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-red-600 uppercase mb-1">No pertenecen a esta ASN</h3>
              <div className="flex flex-wrap gap-1.5">
                {sobrantes.map(s => <span key={s} className="text-xs bg-red-50 text-red-700 border border-red-200 rounded px-1.5 py-0.5">{s}</span>)}
              </div>
            </div>
          )}
          <div>
            <h3 className="text-xs font-semibold text-emerald-700 uppercase mb-1">Escaneados OK ({leidos.length})</h3>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {[...leidos].reverse().map(s => <span key={s} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5">{s}</span>)}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <textarea
          value={nota}
          onChange={e => setNota(e.target.value)}
          placeholder="Observaciones (opcional): cajas dañadas, faltantes visibles, etc."
          rows={2}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
        />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          onClick={async () => {
            if (faltan > 0 && !confirm(`Faltan escanear ${faltan} unidades. ¿Finalizar igual? Van a quedar como FALTANTES.`)) return
            setEnviando(true); setErr(null)
            const r = await finalizarControlAsn(token, leidos, sobrantes, nota)
            if (r.error) setErr(r.error)
            else setHecho(true)
            setEnviando(false)
          }}
          disabled={enviando}
          className="w-full px-5 py-3 bg-gray-900 text-white text-base font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : faltan > 0 ? `Finalizar control (faltan ${faltan})` : 'Finalizar control ✓'}
        </button>
      </div>
    </div>
  )
}
