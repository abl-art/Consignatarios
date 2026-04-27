import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const sb = createAdminClient()
  const { data } = await sb.from('auditorias_stock_propio').select('*').eq('id', params.id).single()
  if (!data) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const detalle = typeof data.detalle === 'string' ? JSON.parse(data.detalle) : data.detalle
  const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
  const fechaCorte = new Date(data.fecha_corte + 'T12:00').toLocaleDateString('es-AR')
  const fechaConteo = data.fecha_conteo ? new Date(data.fecha_conteo + 'T12:00').toLocaleDateString('es-AR') : '—'

  const rows = detalle.map((d: { modelo: string; teorico: number; real: number; diferencia: number; precio_unit: number; valor_real: number; valor_diferencia: number }) =>
    `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px">${d.modelo}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${d.teorico}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;font-weight:bold">${d.real}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;color:${d.diferencia < 0 ? '#dc2626' : d.diferencia > 0 ? '#d97706' : '#059669'};font-weight:bold">${d.diferencia}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-size:11px">${fmt(d.precio_unit)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${fmt(d.valor_real)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;color:${d.valor_diferencia < 0 ? '#dc2626' : '#059669'}">${fmt(d.valor_diferencia)}</td>
    </tr>`
  ).join('')

  const html = `<!DOCTYPE html><html><head><title>Auditoría Stock - ${fechaCorte}</title>
<style>
body{font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:30px;color:#333;font-size:13px}
.header{display:flex;justify-content:space-between;border-bottom:3px solid #E91E7B;padding-bottom:12px;margin-bottom:20px}
.header h1{color:#E91E7B;font-size:20px;margin:0}
.header p{margin:2px 0;font-size:11px;color:#666}
.info{display:flex;gap:30px;margin-bottom:16px;font-size:12px}
.info strong{color:#333}
table{width:100%;border-collapse:collapse;margin:12px 0}
th{background:#f3f4f6;padding:8px;text-align:left;border-bottom:2px solid #d1d5db;font-size:11px}
.totals td{border-top:2px solid #333;font-weight:bold;padding:8px}
.firmas{display:flex;gap:60px;margin-top:40px}
.firma-box{text-align:center;flex:1}
.firma-box img{height:60px;margin-bottom:4px}
.firma-box p{margin:2px 0;font-size:11px}
.existencia{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin:16px 0;text-align:center}
.existencia strong{font-size:22px;color:#15803d}
@media print{body{padding:15px}}
</style></head><body>
<div class="header">
  <div><h1>GOcelular</h1><p>AUDITORÍA DE STOCK PROPIO</p></div>
  <div style="text-align:right"><p><strong>Fecha corte:</strong> ${fechaCorte}</p><p><strong>Fecha conteo:</strong> ${fechaConteo}</p><p><strong>Estado:</strong> ${data.estado}</p></div>
</div>
<div class="existencia"><p style="margin:0;font-size:12px;color:#666">Existencia Final del Período</p><strong>${fmt(Number(data.valor_existencia_final))}</strong></div>
<table>
  <thead><tr><th>Modelo</th><th style="text-align:center">Teórico</th><th style="text-align:center">Real</th><th style="text-align:center">Diferencia</th><th style="text-align:right">Precio unit.</th><th style="text-align:right">Valor real</th><th style="text-align:right">Valor dif.</th></tr></thead>
  <tbody>${rows}</tbody>
  <tbody><tr class="totals">
    <td>TOTAL</td>
    <td style="text-align:center">${detalle.reduce((s: number, d: { teorico: number }) => s + d.teorico, 0)}</td>
    <td style="text-align:center">${detalle.reduce((s: number, d: { real: number }) => s + d.real, 0)}</td>
    <td style="text-align:center">${detalle.reduce((s: number, d: { diferencia: number }) => s + d.diferencia, 0)}</td>
    <td></td>
    <td style="text-align:right">${fmt(Number(data.total_real))}</td>
    <td style="text-align:right">${fmt(Number(data.total_diferencia))}</td>
  </tr></tbody>
</table>
${data.observaciones ? `<p style="font-size:11px;color:#666"><strong>Observaciones:</strong> ${data.observaciones}</p>` : ''}
${data.firma_responsable ? `<div class="firmas">
  <div class="firma-box">${data.firma_responsable_url ? `<img src="${data.firma_responsable_url}" />` : ''}<p style="border-top:1px solid #333;padding-top:4px"><strong>${data.firma_responsable}</strong></p><p style="color:#666">Responsable</p></div>
  <div class="firma-box">${data.firma_supervisor_url ? `<img src="${data.firma_supervisor_url}" />` : ''}<p style="border-top:1px solid #333;padding-top:4px"><strong>${data.firma_supervisor}</strong></p><p style="color:#666">Supervisor</p></div>
</div>` : ''}
<p style="text-align:center;font-size:9px;color:#9ca3af;margin-top:30px">Generado por GOcelular360</p>
<script>window.onload=function(){window.print()}</script>
</body></html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
}
