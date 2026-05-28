import { NextResponse } from 'next/server'
import { fetchReporteContabilidad } from '@/lib/actions/pase-contabilidad'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const periodo = searchParams.get('periodo')
  if (!periodo) return NextResponse.json({ error: 'periodo requerido' }, { status: 400 })

  const reporte = await fetchReporteContabilidad(periodo)
  const fmt = (n: number) => '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)

  const [anio, mes] = periodo.split('-')
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  const periodoLabel = `${monthNames[parseInt(mes, 10) - 1]} ${anio}`

  const rows = reporte.lineas.map(l =>
    `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:500">${l.categoria}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;color:#2563eb">
        ${l.stockFinal !== null ? l.stockFinal : '-'}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">
        ${l.valuacion !== null ? fmt(l.valuacion) : '-'}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:11px;color:${l.estado === 'ok' ? '#15803d' : '#b45309'}">
        ${l.estado === 'ok' ? 'Completo' : (l.nota ?? 'Sin datos')}
      </td>
    </tr>`
  ).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pase a Contabilidad - ${periodoLabel}</title>
<style>
body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:30px;color:#333;font-size:13px}
.header{display:flex;justify-content:space-between;border-bottom:3px solid #E91E7B;padding-bottom:12px;margin-bottom:24px}
.header h1{color:#E91E7B;font-size:20px;margin:0}
.header p{margin:2px 0;font-size:11px;color:#666}
.periodo{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px;margin-bottom:20px;text-align:center}
.periodo strong{font-size:18px;color:#0369a1}
table{width:100%;border-collapse:collapse;margin:12px 0}
th{background:#f3f4f6;padding:10px 12px;text-align:left;border-bottom:2px solid #d1d5db;font-size:12px}
.totals td{border-top:3px solid #333;font-weight:bold;padding:10px 12px;font-size:14px}
.total-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;text-align:center}
.total-box strong{font-size:24px;color:#15803d}
@media print{body{padding:15px}}
</style></head><body>
<div class="header">
  <div><h1>GOcelular</h1><p>PASE A CONTABILIDAD</p><p>Reporte de Existencias Finales</p></div>
  <div style="text-align:right"><p><strong>Periodo:</strong> ${periodoLabel}</p><p><strong>Generado:</strong> ${new Date().toLocaleDateString('es-AR')}</p></div>
</div>
<div class="periodo"><p style="margin:0;font-size:12px;color:#666">Periodo</p><strong>${periodoLabel}</strong></div>
<table>
  <thead><tr>
    <th>Categoria</th>
    <th style="text-align:center">Existencia Final (unidades)</th>
    <th style="text-align:right">Valuacion</th>
    <th>Estado</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tbody><tr class="totals">
    <td>TOTAL</td>
    <td style="text-align:center">${reporte.totalStock}</td>
    <td style="text-align:right">${fmt(reporte.totalValuacion)}</td>
    <td></td>
  </tr></tbody>
</table>
<div class="total-box">
  <p style="margin:0 0 4px 0;font-size:12px;color:#666">Valuacion Total de Existencias</p>
  <strong>${fmt(reporte.totalValuacion)}</strong>
</div>
${!reporte.completo ? '<p style="color:#b45309;font-size:11px;margin-top:12px">Reporte incompleto: algunas categorias no tienen datos para este periodo.</p>' : ''}
<p style="text-align:center;font-size:9px;color:#9ca3af;margin-top:40px">Generado por GOcelular360</p>
<script>window.onload=function(){window.print()}</script>
</body></html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
