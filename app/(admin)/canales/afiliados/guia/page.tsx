'use client'

import Link from 'next/link'

export default function GuiaComercialPage() {
  function handleDownload() {
    const el = document.getElementById('guia-content')
    if (!el) return
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Guía Comercial - GOcelular</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:40px 20px;color:#1f2937;font-size:14px;line-height:1.6}h1{font-size:24px;margin-bottom:4px}h2{font-size:18px;margin-top:32px;padding-bottom:8px;border-bottom:1px solid #e5e7eb}h3{font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin-top:20px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #e5e7eb;padding:8px 12px;text-align:left;font-size:13px}th{background:#f9fafb;font-weight:600}.faq{background:#f9fafb;border-radius:8px;padding:12px;margin:8px 0}.faq strong{display:block;margin-bottom:4px}.badge{display:inline-block;background:#f3f4f6;border-radius:20px;padding:2px 10px;font-size:12px;margin:2px}.highlight{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;margin:12px 0}.stats{display:flex;gap:12px;margin:12px 0}.stat{flex:1;background:#f9fafb;border-radius:8px;padding:12px;text-align:center}.stat-value{font-size:20px;font-weight:700}.stat-label{font-size:11px;color:#9ca3af}p.subtitle{color:#6b7280;font-size:13px}</style></head><body>${el.innerHTML}</body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Guia-Comercial-GOcelular.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/canales/afiliados"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Afiliados
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Guia Comercial - Call Center</h1>
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Descargar
        </button>
      </div>

      <div id="guia-content" className="bg-white rounded-xl border border-gray-200 p-6 md:p-8 space-y-8">

        {/* Sección 1 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold">1</span>
            Que es GOcelular
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            GOcelular es una empresa de venta de celulares que ofrece financiacion propia a traves de la plataforma <strong>GOcuotas</strong>. El cliente compra un telefono y lo paga en cuotas fijas, sin interes, sin tarjeta de credito.
          </p>
          <div className="bg-purple-50 rounded-lg p-4">
            <p className="text-sm font-semibold text-purple-800 mb-2">Propuesta de valor para el cliente:</p>
            <ul className="text-sm text-purple-700 space-y-1">
              <li>Celulares nuevos, sellados, con garantia</li>
              <li>Cuotas fijas sin interes</li>
              <li>No necesita tarjeta de credito</li>
              <li>Aprobacion rapida</li>
              <li>Envio gratis a domicilio via Andreani</li>
              <li>Incluye funda y vidrio templado de regalo</li>
            </ul>
          </div>
        </section>

        <hr className="border-gray-200" />

        {/* Sección 2 - Productos reales de la tienda */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold">2</span>
            Productos que vendemos
          </h2>
          <p className="text-sm text-gray-500 mb-3">Celulares gama media y economica. Todos nuevos, sellados, compatibles con cualquier compañia.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Modelo</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Precio</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Motorola Moto G06 64GB', '$278.100'],
                  ['Motorola Moto G06 128GB', '$323.100'],
                  ['Samsung Galaxy A07 64GB', '$350.100'],
                  ['Samsung Galaxy A07 128GB', '$413.100'],
                  ['Motorola Moto G17 128GB', '$431.100'],
                  ['Xiaomi Redmi 14C 128/4GB', '$431.100'],
                  ['Motorola Moto G17 256GB', '$503.100'],
                  ['Xiaomi Redmi 14C 256/4GB', '$512.100'],
                  ['Xiaomi Redmi Note 14 128/6GB', '$602.100'],
                  ['Motorola Moto G67 256GB', '$737.100'],
                  ['Samsung Galaxy A17 5G 256GB', '$818.100'],
                  ['Motorola Moto G77 5G 256GB', '$863.100'],
                  ['Xiaomi Redmi Note 14 Pro 256/8GB', '$890.100'],
                  ['Samsung Galaxy A37 5G 256GB', '$1.313.100'],
                  ['Samsung Galaxy A56 5G 256GB', '$1.305.000'],
                ].map(([modelo, precio]) => (
                  <tr key={modelo} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-900">{modelo}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{precio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-emerald-800 mb-1">Incluido con cada compra:</p>
            <ul className="text-sm text-emerald-700 space-y-1">
              <li>Funda protectora gratis</li>
              <li>Vidrio templado gratis</li>
              <li>Envio gratis por Andreani</li>
              <li>Kit de Seguridad de regalo (en modelos seleccionados)</li>
            </ul>
          </div>
        </section>

        <hr className="border-gray-200" />

        {/* Sección 3 - Financiación corregida */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold">3</span>
            Como funciona la financiacion
          </h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {['1. Elige el celular', '2. Elige cantidad de cuotas', '3. Paga la 1ra cuota', '4. Recibe el equipo', '5. Paga cuotas restantes'].map((step, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700">{step}</span>
                {i < 4 && <span className="text-gray-300">&rarr;</span>}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">Entrega inicial</p>
              <p className="text-lg font-bold text-gray-900">1ra cuota</p>
              <p className="text-xs text-gray-400">se paga al comprar</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">Planes disponibles</p>
              <p className="text-lg font-bold text-gray-900">2 a 9</p>
              <p className="text-xs text-gray-400">cuotas mensuales</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">Interes</p>
              <p className="text-lg font-bold text-emerald-600">0%</p>
              <p className="text-xs text-gray-400">cuotas fijas</p>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-800 mb-1">Ejemplo practico</p>
            <p className="text-sm text-blue-700">
              <strong>Motorola Moto G17 256GB - $503.100</strong><br />
              6 cuotas de $83.850 (la primera se paga al momento de la compra)<br />
              <strong>Total: $503.100 (sin recargo)</strong>
            </p>
          </div>
        </section>

        <hr className="border-gray-200" />

        {/* Sección 4 - FAQ */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold">4</span>
            Preguntas frecuentes de los clientes
          </h2>

          <h3 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Sobre el producto</h3>
          <div className="space-y-3 mb-6">
            {[
              ['Los celulares son nuevos?', 'Si, todos los equipos son nuevos, sellados de fabrica y compatibles con cualquier compañia telefonica.'],
              ['Tienen garantia?', 'Si, todos los equipos cuentan con garantia oficial del fabricante. GOcelular acompaña al cliente durante todo el proceso si necesita hacer uso de la garantia.'],
              ['Que pasa si el celular viene fallado?', 'Se gestiona el cambio o reparacion por garantia oficial. El cliente se contacta con nosotros y coordinamos todo con el servicio tecnico autorizado.'],
              ['Puedo elegir el color?', 'Depende de la disponibilidad de stock. Siempre informamos los colores disponibles antes de confirmar la venta.'],
            ].map(([q, a]) => (
              <div key={q} className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-800">&ldquo;{q}&rdquo;</p>
                <p className="text-sm text-gray-600 mt-1">{a}</p>
              </div>
            ))}
          </div>

          <h3 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Sobre la financiacion</h3>
          <div className="space-y-3 mb-6">
            {[
              ['Tiene interes?', 'No. Las cuotas son fijas y sin interes. El precio final en cuotas es el mismo precio de lista del equipo.'],
              ['Necesito tarjeta de credito?', 'No. La financiacion es propia de GOcelular a traves de GOcuotas. No se necesita tarjeta de credito.'],
              ['Como pago las cuotas?', 'Las cuotas se pagan por la app de GOcuotas o por transferencia bancaria. El debito es mensual y automatico.'],
              ['Que pasa si me atraso en una cuota?', 'El equipo se bloquea temporalmente hasta que se regularice la deuda. Una vez que se pone al dia, se desbloquea automaticamente.'],
              ['Si me atraso en otra compra de GOcuotas, se bloquea el celular?', 'No, el bloqueo aplica unicamente a la compra del celular. Otras compras en GOcuotas no afectan al equipo.'],
              ['Puedo cancelar anticipadamente?', 'Si, el cliente puede adelantar cuotas o cancelar el total restante en cualquier momento sin penalidad.'],
              ['La compra consume mi limite en GOcuotas?', 'Si, el monto se descuenta del credito disponible en GOcuotas.'],
            ].map(([q, a]) => (
              <div key={q} className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-800">&ldquo;{q}&rdquo;</p>
                <p className="text-sm text-gray-600 mt-1">{a}</p>
              </div>
            ))}
          </div>

          <h3 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Sobre la entrega</h3>
          <div className="space-y-3 mb-6">
            {[
              ['Hacen envios?', 'Si, enviamos a domicilio a todo el pais por Andreani. El envio es completamente gratis.'],
              ['Cuanto tarda la entrega?', 'El seguimiento se envia por mail al dia habil siguiente de la compra. La entrega depende de la zona pero generalmente es entre 2 y 5 dias habiles.'],
              ['Tiene costo el envio?', 'No, el envio es siempre gratis.'],
            ].map(([q, a]) => (
              <div key={q} className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-800">&ldquo;{q}&rdquo;</p>
                <p className="text-sm text-gray-600 mt-1">{a}</p>
              </div>
            ))}
          </div>

          <h3 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Sobre el bloqueo del equipo</h3>
          <div className="space-y-3">
            {[
              ['El equipo se bloquea si no pago?', 'Si, los equipos cuentan con un sistema de seguridad que bloquea el dispositivo en caso de morosidad. En la pantalla aparece la informacion de contacto para regularizar la deuda.'],
              ['Si pago se desbloquea?', 'Si, una vez regularizada la deuda el equipo se desbloquea automaticamente.'],
            ].map(([q, a]) => (
              <div key={q} className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-800">&ldquo;{q}&rdquo;</p>
                <p className="text-sm text-gray-600 mt-1">{a}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="border-gray-200" />

        {/* Sección 5 - Datos operativos */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold">5</span>
            Datos operativos clave
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <tbody>
                {[
                  ['Tienda Online', 'gocelular.gocuotas.com/tienda'],
                  ['Plataforma de cobro', 'GOcuotas'],
                  ['Metodos de pago cuotas', 'App GOcuotas o transferencia bancaria'],
                  ['Planes de cuotas', '2 a 9 cuotas mensuales'],
                  ['Entrega inicial', '1ra cuota (se paga al comprar)'],
                  ['Interes', '0% - cuotas fijas'],
                  ['Garantia equipos', 'Garantia oficial del fabricante'],
                  ['Envio', 'Gratis a todo el pais (Andreani)'],
                  ['Incluye', 'Funda + vidrio templado gratis'],
                ].map(([concepto, detalle]) => (
                  <tr key={concepto} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-800 bg-gray-50 w-1/3">{concepto}</td>
                    <td className="px-4 py-2 text-gray-600">{detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="text-center pt-4">
          <p className="text-xs text-gray-400">Documento para uso interno de GOcelular — Junio 2026</p>
        </div>
      </div>
    </div>
  )
}
