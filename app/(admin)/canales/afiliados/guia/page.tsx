export const dynamic = 'force-dynamic'

import Link from 'next/link'

export default function GuiaComercialPage() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/canales/afiliados"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Afiliados
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Guía Comercial - Call Center</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 md:p-8 space-y-8">

        {/* Sección 1 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold">1</span>
            ¿Qué es GOcelular?
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            GOcelular es una empresa de venta de celulares que ofrece financiación propia a través de la plataforma <strong>GOcuotas</strong>. El cliente compra un teléfono y lo paga en cuotas fijas, sin interés, sin tarjeta de crédito.
          </p>
          <div className="bg-purple-50 rounded-lg p-4">
            <p className="text-sm font-semibold text-purple-800 mb-2">Propuesta de valor para el cliente:</p>
            <ul className="text-sm text-purple-700 space-y-1">
              <li>• Celulares nuevos, sellados, con garantía</li>
              <li>• Cuotas fijas sin interés</li>
              <li>• No necesita tarjeta de crédito</li>
              <li>• Aprobación rápida</li>
              <li>• Entrega a domicilio o retiro en sucursal</li>
            </ul>
          </div>
        </section>

        <hr className="border-gray-200" />

        {/* Sección 2 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold">2</span>
            Productos que vendemos
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Marca</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Gama</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Ejemplos</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Samsung', 'Media/Alta', 'Galaxy A series, Galaxy S series'],
                  ['Motorola', 'Media', 'Moto G, Moto Edge'],
                  ['Xiaomi', 'Económica/Media', 'Redmi, Poco'],
                  ['Honor', 'Económica/Media', 'Honor X series'],
                  ['Nubia', 'Media', 'Nubia Focus, Neo'],
                  ['iPhone (Apple)', 'Alta', 'iPhone 15, iPhone 16'],
                ].map(([marca, gama, ejemplos]) => (
                  <tr key={marca} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-900">{marca}</td>
                    <td className="px-4 py-2 text-gray-600">{gama}</td>
                    <td className="px-4 py-2 text-gray-500">{ejemplos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {['Smartwatches', 'Auriculares', 'Parlantes', 'Kits de Seguridad'].map(cat => (
              <span key={cat} className="px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">{cat}</span>
            ))}
          </div>
        </section>

        <hr className="border-gray-200" />

        {/* Sección 3 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold">3</span>
            Cómo funciona la financiación
          </h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {['1. Elige el celular', '2. Elige plan de cuotas', '3. Paga la entrega', '4. Cuotas mensuales fijas', '5. Recibe el equipo'].map((step, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700">{step}</span>
                {i < 4 && <span className="text-gray-300">→</span>}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">Entrega inicial</p>
              <p className="text-lg font-bold text-gray-900">10%</p>
              <p className="text-xs text-gray-400">del valor total</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">Planes disponibles</p>
              <p className="text-lg font-bold text-gray-900">3, 6, 9 o 12</p>
              <p className="text-xs text-gray-400">cuotas mensuales</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">Interés</p>
              <p className="text-lg font-bold text-emerald-600">0%</p>
              <p className="text-xs text-gray-400">cuotas fijas</p>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-800 mb-1">Ejemplo práctico</p>
            <p className="text-sm text-blue-700">
              <strong>Samsung Galaxy A55 - $350.000</strong><br />
              Entrega inicial (10%): $35.000 — 6 cuotas de $52.500<br />
              <strong>Total que paga el cliente: $350.000 (sin recargo)</strong>
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
              ['¿Los celulares son nuevos?', 'Sí, todos los equipos son nuevos, sellados de fábrica, con garantía oficial de la marca.'],
              ['¿Tienen garantía?', 'Sí, todos los equipos cuentan con garantía oficial del fabricante (generalmente 12 meses). GOcelular acompaña al cliente durante todo el proceso si necesita hacer uso de la garantía.'],
              ['¿Qué pasa si el celular viene fallado?', 'Se gestiona el cambio o reparación por garantía oficial. El cliente se contacta con nosotros y coordinamos todo con el servicio técnico autorizado.'],
              ['¿Puedo elegir el color?', 'Depende de la disponibilidad de stock. Siempre informamos los colores disponibles antes de confirmar la venta.'],
            ].map(([q, a]) => (
              <div key={q} className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-800">&ldquo;{q}&rdquo;</p>
                <p className="text-sm text-gray-600 mt-1">{a}</p>
              </div>
            ))}
          </div>

          <h3 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Sobre la financiación</h3>
          <div className="space-y-3 mb-6">
            {[
              ['¿Tiene interés?', 'No. Las cuotas son fijas y sin interés. El precio final en cuotas es el mismo precio de lista del equipo.'],
              ['¿Necesito tarjeta de crédito?', 'No. La financiación es propia de GOcelular a través de GOcuotas. No se necesita tarjeta de crédito.'],
              ['¿Cómo pago las cuotas?', 'Las cuotas se cobran mensualmente. El cliente puede pagar por débito automático (CBU), transferencia bancaria, o en puntos de pago habilitados.'],
              ['¿Qué pasa si me atraso en una cuota?', 'Es importante pagar en fecha. El sistema registra los atrasos y si se acumulan pagos pendientes, el equipo puede quedar bloqueado hasta regularizar la situación.'],
              ['¿El equipo se bloquea si no pago?', 'Sí, los equipos cuentan con un sistema de seguridad (Trustonic/Knox Guard) que permite bloquear el dispositivo en caso de morosidad prolongada. Una vez regularizado el pago, se desbloquea automáticamente.'],
              ['¿Puedo cancelar anticipadamente?', 'Sí, el cliente puede adelantar cuotas o cancelar el total restante en cualquier momento sin penalidad.'],
              ['¿Hacen verificación crediticia?', 'El proceso de aprobación es simple y rápido. Se validan datos básicos del cliente (DNI, datos personales). No es como un crédito bancario tradicional.'],
            ].map(([q, a]) => (
              <div key={q} className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-800">&ldquo;{q}&rdquo;</p>
                <p className="text-sm text-gray-600 mt-1">{a}</p>
              </div>
            ))}
          </div>

          <h3 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Sobre la entrega</h3>
          <div className="space-y-3">
            {[
              ['¿Hacen envíos?', 'Sí, hacemos envíos a domicilio a todo el país. También se puede retirar en nuestras sucursales.'],
              ['¿Cuánto tarda la entrega?', 'Generalmente entre 24 y 72 horas hábiles para envíos en zona urbana. Para zonas del interior puede demorar algunos días más.'],
              ['¿Tiene costo el envío?', 'Depende de la promoción vigente y la zona de entrega. Siempre se informa el costo de envío antes de confirmar la compra.'],
            ].map(([q, a]) => (
              <div key={q} className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-800">&ldquo;{q}&rdquo;</p>
                <p className="text-sm text-gray-600 mt-1">{a}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="border-gray-200" />

        {/* Sección 5 - Objeciones */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold">5</span>
            Manejo de objeciones
          </h2>
          <div className="space-y-3">
            {[
              ['Es muy caro / Lo vi más barato', 'Nuestro precio incluye financiación sin interés. Si comparás el precio de contado con otros, somos competitivos. Pero además te damos la posibilidad de pagarlo en cuotas sin ningún recargo, que es algo que muy pocos ofrecen sin tarjeta de crédito.'],
              ['No confío en comprar online', 'Somos una empresa establecida con sucursales físicas. Podés retirar el equipo personalmente. Todos los equipos tienen factura y garantía oficial.'],
              ['Tengo miedo de que me bloqueen el teléfono', 'El bloqueo es solo una medida de seguridad en caso de falta de pago prolongada. Si pagás tus cuotas normalmente, nunca vas a tener ese problema.'],
              ['¿Y si no me aprueban?', 'El proceso de aprobación es mucho más flexible que un banco. Necesitamos datos básicos y en pocos minutos te confirmamos. La gran mayoría de solicitudes son aprobadas.'],
              ['Prefiero pagar de contado', 'Perfecto, también tenemos precio de contado. Pero si preferís cuidar tu flujo de plata, te conviene aprovechar las cuotas sin interés.'],
            ].map(([objecion, respuesta]) => (
              <div key={objecion} className="border border-amber-200 bg-amber-50 rounded-lg p-4">
                <p className="text-sm font-semibold text-amber-800">🗣 &ldquo;{objecion}&rdquo;</p>
                <p className="text-sm text-amber-700 mt-1">→ {respuesta}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="border-gray-200" />

        {/* Sección 6 - Proceso de venta */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold">6</span>
            Proceso de venta paso a paso
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-emerald-700 mb-2">Apertura</h3>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
                <li>Presentarse: nombre + &ldquo;de GOcelular&rdquo;</li>
                <li>Preguntar qué equipo está buscando o qué necesita</li>
                <li>Escuchar y detectar: presupuesto, uso principal, marca preferida</li>
              </ol>
            </div>
            <div>
              <h3 className="text-sm font-bold text-blue-700 mb-2">Presentación</h3>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside" start={4}>
                <li>Ofrecer 1-2 opciones que se ajusten al perfil</li>
                <li>Mencionar el precio y la opción de cuotas sin interés</li>
                <li>Destacar: &ldquo;sin tarjeta, cuotas fijas, equipo nuevo con garantía&rdquo;</li>
              </ol>
            </div>
            <div>
              <h3 className="text-sm font-bold text-purple-700 mb-2">Cierre</h3>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside" start={7}>
                <li>Preguntar: &ldquo;¿Te lo reservo? ¿Querés que te paso el link para completar la compra?&rdquo;</li>
                <li>Guiar al cliente al proceso de compra en la tienda online</li>
                <li>Confirmar datos de envío o retiro en sucursal</li>
              </ol>
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-700 mb-2">Seguimiento</h3>
              <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside" start={10}>
                <li>Si no cierra en el momento, agendar un seguimiento</li>
                <li>Enviar mensaje recordatorio con el modelo y el plan de cuotas</li>
              </ol>
            </div>
          </div>
        </section>

        <hr className="border-gray-200" />

        {/* Sección 7 - Datos operativos */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold">7</span>
            Datos operativos clave
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <tbody>
                {[
                  ['Tienda Online', 'gocelular.gocuotas.com/tienda'],
                  ['Plataforma de cobro', 'GOcuotas'],
                  ['Métodos de pago cuotas', 'CBU, transferencia, puntos de pago'],
                  ['Planes de cuotas', '3, 6, 9 o 12 meses'],
                  ['Interés', '0% - cuotas fijas'],
                  ['Garantía equipos', 'Garantía oficial del fabricante'],
                  ['Sistema de seguridad', 'Trustonic / Knox Guard'],
                  ['Envíos', 'A domicilio (todo el país) o retiro en sucursal'],
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

        <hr className="border-gray-200" />

        {/* Sección 8 - Tips */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold">8</span>
            Tips para el supervisor
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              ['Capacitar en producto', 'Los agentes deben conocer las diferencias básicas entre marcas y modelos para hacer recomendaciones creíbles'],
              ['Manejar objeciones con empatía', 'Nunca discutir con el cliente. Validar su preocupación y redirigir con beneficios'],
              ['Urgencia sana', '"Este modelo se está vendiendo mucho" o "Tenemos pocas unidades de este color" (solo si es cierto)'],
              ['Seguimiento es clave', 'El 30-40% de las ventas se cierra en el segundo o tercer contacto, no en el primero'],
              ['Simplicidad ante todo', 'No abrumar con info técnica. El cliente quiere saber: precio, cuotas, y cuándo lo recibe'],
              ['Registrar todo', 'Cada interacción, cada objeción, cada resultado. Los datos son la base para mejorar la conversión'],
            ].map(([titulo, desc]) => (
              <div key={titulo} className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-800">{titulo}</p>
                <p className="text-xs text-gray-500 mt-1">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="text-center pt-4">
          <p className="text-xs text-gray-400">Documento para uso interno de GOcelular — Junio 2026</p>
        </div>
      </div>
    </div>
  )
}
