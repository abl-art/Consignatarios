export default function GuiaPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-magenta-50 rounded-2xl mb-4">
          <svg className="w-8 h-8 text-magenta-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Guía de uso</h1>
        <p className="text-gray-500">Todo lo que necesitás saber para operar como consignatario de GOcelular</p>
      </div>

      {/* Cómo funciona */}
      <section className="mb-12">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
            <span className="text-blue-700 font-bold">1</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">¿Cómo funciona?</h2>
            <p className="text-gray-600 leading-relaxed">
              GOcelular te entrega equipos en <strong>consignación</strong>. Vos los vendés a través de la plataforma GOcuotas y al final de cada mes cobrás una <strong>comisión</strong> por cada venta realizada. Si un equipo no se vende, se devuelve.
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-magenta-50 rounded-2xl p-6 border border-blue-100">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-3xl mb-2">📦</div>
              <p className="text-sm font-semibold text-gray-900">Recibís stock</p>
              <p className="text-xs text-gray-500 mt-1">Te asignan equipos</p>
            </div>
            <div>
              <div className="text-3xl mb-2">💰</div>
              <p className="text-sm font-semibold text-gray-900">Vendés</p>
              <p className="text-xs text-gray-500 mt-1">A través de GOcuotas</p>
            </div>
            <div>
              <div className="text-3xl mb-2">📋</div>
              <p className="text-sm font-semibold text-gray-900">Auditás tu stock</p>
              <p className="text-xs text-gray-500 mt-1">Una vez al mes</p>
            </div>
            <div>
              <div className="text-3xl mb-2">🏦</div>
              <p className="text-sm font-semibold text-gray-900">Cobrás comisión</p>
              <p className="text-xs text-gray-500 mt-1">Subís tu factura y listo</p>
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard */}
      <section className="mb-12">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
            <span className="text-green-700 font-bold">2</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Mi Dashboard</h2>
            <p className="text-gray-600 leading-relaxed">
              Es tu pantalla principal. De un vistazo ves toda tu operación:
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 ml-14">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl mb-1">🛡️</p>
            <p className="text-sm font-semibold text-gray-900">Garantía</p>
            <p className="text-xs text-gray-500">Monto máximo de stock que podés tener</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl mb-1">📊</p>
            <p className="text-sm font-semibold text-gray-900">Comisiones del mes</p>
            <p className="text-xs text-gray-500">Lo que ganaste hasta ahora</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl mb-1">📈</p>
            <p className="text-sm font-semibold text-gray-900">Ventas 12 meses</p>
            <p className="text-xs text-gray-500">Evolución de tu facturación</p>
          </div>
        </div>
      </section>

      {/* Mi Stock */}
      <section className="mb-12">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
            <span className="text-purple-700 font-bold">3</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Mi Stock</h2>
            <p className="text-gray-600 leading-relaxed">
              Lista de todos los equipos que tenés asignados, agrupados por marca y modelo.
              El color indica la antigüedad:
            </p>
          </div>
        </div>
        <div className="flex gap-3 ml-14">
          <span className="px-3 py-1.5 text-xs font-semibold rounded-full bg-green-100 text-green-700">🟢 &lt; 30 días — Fresco</span>
          <span className="px-3 py-1.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-700">🟡 30-60 días — Atención</span>
          <span className="px-3 py-1.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">🔴 &gt; 60 días — Lento</span>
        </div>
      </section>

      {/* Auto-auditoría */}
      <section className="mb-12">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
            <span className="text-amber-700 font-bold">4</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Auto-Auditoría</h2>
            <p className="text-gray-600 leading-relaxed">
              <strong>Obligatoria todos los meses.</strong> Sin auto-auditoría, tu pago queda retenido.
            </p>
          </div>
        </div>

        <div className="ml-14 bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <p className="text-sm font-semibold text-amber-900 mb-4">¿Cómo hacerla?</p>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-amber-800">1</div>
              <p className="text-sm text-gray-700">Entrá a <strong>Auto-Auditoría</strong> desde el menú</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-amber-800">2</div>
              <p className="text-sm text-gray-700">Escaneá con la <strong>cámara del celular</strong> cada equipo que tengas</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-amber-800">3</div>
              <p className="text-sm text-gray-700">El sistema compara contra lo que deberías tener</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-amber-800">4</div>
              <p className="text-sm text-gray-700">Firmá digitalmente y descargá el acta en PDF</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-white rounded-xl border border-amber-100">
            <p className="text-xs text-amber-800">💡 <strong>Tip:</strong> Hacela el primer día hábil de cada mes para liberar tu pago lo antes posible.</p>
          </div>
        </div>
      </section>

      {/* Liquidaciones y facturas */}
      <section className="mb-12">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 bg-magenta-100 rounded-xl flex items-center justify-center shrink-0">
            <span className="text-magenta-700 font-bold">5</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Liquidaciones y Facturas</h2>
            <p className="text-gray-600 leading-relaxed">
              Acá ves cuánto te corresponde cobrar cada mes y subís tu factura para que te paguen.
            </p>
          </div>
        </div>

        <div className="ml-14 space-y-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-700">Retenida</span>
            <p className="text-sm text-gray-600">Tu pago está retenido → <strong>completá la auto-auditoría</strong></p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">Pendiente</span>
            <p className="text-sm text-gray-600">Ya podés <strong>subir tu factura</strong> → el pago se procesa</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">Pagada</span>
            <p className="text-sm text-gray-600">¡Listo! El pago fue procesado ✓</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">Bloqueada</span>
            <p className="text-sm text-gray-600">Hay un problema → contactá al administrador</p>
          </div>
        </div>

        <div className="ml-14 mt-6 bg-magenta-50 border border-magenta-200 rounded-2xl p-6">
          <p className="text-sm font-semibold text-magenta-900 mb-4">¿Cómo subir la factura?</p>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-magenta-200 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-magenta-800">1</div>
              <p className="text-sm text-gray-700">Entrá a <strong>Liquidaciones</strong></p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-magenta-200 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-magenta-800">2</div>
              <p className="text-sm text-gray-700">Buscá la liquidación con estado <strong>&quot;Pendiente&quot;</strong></p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-magenta-200 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-magenta-800">3</div>
              <p className="text-sm text-gray-700">Hacé click en <strong>&quot;Subir factura&quot;</strong> y seleccioná el PDF</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-magenta-200 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-magenta-800">4</div>
              <p className="text-sm text-gray-700">Vas a ver <strong>&quot;Factura ✓&quot;</strong> confirmando que se subió</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-white rounded-xl border border-magenta-100">
            <p className="text-xs text-magenta-800">⚠️ <strong>Importante:</strong> Solo se aceptan archivos PDF. La factura debe ser por el monto que figura en &quot;A pagar&quot;. Sin factura no se procesa el pago.</p>
          </div>
        </div>
      </section>

      {/* Mis Ventas */}
      <section className="mb-12">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 bg-cyan-100 rounded-xl flex items-center justify-center shrink-0">
            <span className="text-cyan-700 font-bold">6</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Mis Ventas</h2>
            <p className="text-gray-600 leading-relaxed">
              Historial completo de tus ventas. Podés filtrar por mes. Cada venta muestra la fecha, tienda, IMEI, modelo, precio y tu comisión.
            </p>
          </div>
        </div>
      </section>

      {/* Flujo mensual */}
      <section className="mb-12">
        <h2 className="text-xl font-bold text-gray-900 mb-4 text-center">Tu flujo mensual</h2>
        <div className="bg-gradient-to-b from-gray-50 to-white rounded-2xl border border-gray-200 p-6">
          <div className="space-y-0">
            {[
              { emoji: '📦', text: 'Vendés equipos durante el mes', color: 'blue' },
              { emoji: '📋', text: 'A fin de mes: hacés la auto-auditoría', color: 'amber' },
              { emoji: '📄', text: 'Subís la factura por tus comisiones', color: 'magenta' },
              { emoji: '✅', text: 'El admin procesa el pago', color: 'green' },
              { emoji: '🏦', text: '¡Cobrás!', color: 'green' },
            ].map((step, i) => (
              <div key={i}>
                <div className="flex items-center gap-4 py-3">
                  <div className="text-2xl">{step.emoji}</div>
                  <p className="text-sm text-gray-700 font-medium">{step.text}</p>
                </div>
                {i < 4 && (
                  <div className="ml-4 h-6 border-l-2 border-dashed border-gray-300" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Preguntas frecuentes</h2>
        <div className="space-y-3">
          {[
            { q: '¿Puedo subir la factura antes de la auto-auditoría?', a: 'No. Primero completá la auto-auditoría, después se habilita la carga.' },
            { q: '¿Puedo corregir la factura?', a: 'Sí, hacé click en "Reemplazar" y subí la versión correcta.' },
            { q: '¿Qué pasa si me falta un equipo?', a: 'Se genera una diferencia que se descuenta de tu próxima liquidación.' },
            { q: '¿Cómo sé cuánto facturar?', a: 'El monto exacto figura en la columna "A pagar" de tu liquidación.' },
            { q: '¿Necesito instalar algo?', a: 'No. Todo funciona desde el navegador, en celular o computadora.' },
          ].map((faq, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-semibold text-gray-900 mb-1">{faq.q}</p>
              <p className="text-sm text-gray-600">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-200">
        GOcelular360 — Panel de Consignatarios
      </div>
    </div>
  )
}
