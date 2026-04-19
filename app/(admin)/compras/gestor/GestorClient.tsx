'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatearMoneda } from '@/lib/utils'

interface Proveedor {
  id: string
  nombre: string
  whatsapp: string
  email: string
  direccion: string
  notas: string
}

const MARCAS_CELULARES = ['Motorola', 'Samsung', 'Nubia', 'Xiaomi', 'Honor']

function parseProvMarcas(notas: string): string[] {
  try { return JSON.parse(notas)?.marcas || [] } catch { return [] }
}

interface Producto {
  id: string
  codigo: string
  nombre: string
  categoria: string
}

interface Precio {
  id: string
  producto_id: string
  proveedor_id: string
  precio: number
  plazo: string
}

interface CartItem {
  id: string
  producto: Producto
  proveedor: Proveedor
  precio: number
  plazo: string
  cantidad: number
}

interface NotaPedido {
  id: string
  proveedor: Proveedor
  items: CartItem[]
  estado: 'borrador' | 'confirmado' | 'enviado'
  fecha: string
}

type Tab = 'catalogo' | 'pedido' | 'notas'

export default function GestorClient({
  productos,
  proveedores,
  precios,
}: {
  productos: Producto[]
  proveedores: Proveedor[]
  precios: Precio[]
}) {
  const [tab, setTab] = useState<Tab>('catalogo')
  const [busqueda, setBusqueda] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('Celulares')
  const [filtroMarca, setFiltroMarca] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [notas, setNotas] = useState<NotaPedido[]>([])
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [selectedProv, setSelectedProv] = useState<Record<string, string>>({})

  // Send modal
  const [sendModal, setSendModal] = useState<{ nota: NotaPedido } | null>(null)

  const categoriasUsadas = Array.from(new Set(productos.map((p) => p.categoria)))

  const filtrados = useMemo(() => {
    let result = productos
    if (filtroCategoria) result = result.filter((p) => p.categoria === filtroCategoria)
    if (filtroMarca && filtroCategoria === 'Celulares') {
      result = result.filter((p) => p.nombre.toLowerCase().includes(filtroMarca.toLowerCase()))
    }
    if (busqueda) {
      const q = busqueda.toLowerCase()
      result = result.filter(
        (p) => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)
      )
    }
    return result
  }, [productos, filtroCategoria, filtroMarca, busqueda])

  const proveedoresFiltrados = useMemo(() => {
    return proveedores.filter((prov) => {
      const tipoProducto = prov.direccion || ''
      if (filtroCategoria && tipoProducto && tipoProducto !== filtroCategoria) return false
      if (filtroMarca && filtroCategoria === 'Celulares') {
        const marcasProv = parseProvMarcas(prov.notas)
        if (marcasProv.length > 0 && !marcasProv.includes(filtroMarca)) return false
      }
      return true
    })
  }, [proveedores, filtroCategoria, filtroMarca])

  function getPrecio(productoId: string, proveedorId: string): Precio | undefined {
    return precios.find((p) => p.producto_id === productoId && p.proveedor_id === proveedorId)
  }

  function addToCart(producto: Producto) {
    const provId = selectedProv[producto.id]
    if (!provId) return
    const precio = getPrecio(producto.id, provId)
    if (!precio) return
    const prov = proveedores.find((p) => p.id === provId)
    if (!prov) return
    const qty = cantidades[producto.id] || 1

    const existingIdx = cart.findIndex(
      (item) => item.producto.id === producto.id && item.proveedor.id === provId
    )

    if (existingIdx >= 0) {
      setCart((prev) => {
        const updated = [...prev]
        updated[existingIdx] = { ...updated[existingIdx], cantidad: updated[existingIdx].cantidad + qty }
        return updated
      })
    } else {
      setCart((prev) => [
        ...prev,
        {
          id: `${producto.id}-${provId}-${Date.now()}`,
          producto,
          proveedor: prov,
          precio: precio.precio,
          plazo: precio.plazo,
          cantidad: qty,
        },
      ])
    }

    setCantidades((prev) => ({ ...prev, [producto.id]: 1 }))
    setSelectedProv((prev) => {
      const next = { ...prev }
      delete next[producto.id]
      return next
    })
  }

  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((item) => item.id !== id))
  }

  function updateCartQty(id: string, qty: number) {
    if (qty < 1) return
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, cantidad: qty } : item)))
  }

  const totalPedido = cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0)
  const totalItems = cart.reduce((sum, item) => sum + item.cantidad, 0)

  const resumenPorPlazo = useMemo(() => {
    const map: Record<string, number> = {}
    cart.forEach((item) => {
      map[item.plazo] = (map[item.plazo] || 0) + item.precio * item.cantidad
    })
    return Object.entries(map)
  }, [cart])

  function generarNotas() {
    const porProveedor: Record<string, CartItem[]> = {}
    cart.forEach((item) => {
      if (!porProveedor[item.proveedor.id]) porProveedor[item.proveedor.id] = []
      porProveedor[item.proveedor.id].push(item)
    })

    const nuevasNotas: NotaPedido[] = Object.entries(porProveedor).map(([provId, items]) => ({
      id: `NP-${Date.now()}-${provId}`,
      proveedor: items[0].proveedor,
      items,
      estado: 'borrador',
      fecha: new Date().toLocaleDateString('es-AR'),
    }))

    setNotas(nuevasNotas)
    setCart([])
    setTab('notas')
  }

  function confirmarNota(notaId: string) {
    setNotas((prev) =>
      prev.map((n) => (n.id === notaId ? { ...n, estado: 'confirmado' } : n))
    )
  }

  function enviarNota(notaId: string) {
    const nota = notas.find((n) => n.id === notaId)
    if (!nota) return
    setSendModal({ nota })
  }

  function marcarEnviada(notaId: string) {
    setNotas((prev) =>
      prev.map((n) => (n.id === notaId ? { ...n, estado: 'enviado' } : n))
    )
    setSendModal(null)
  }

  function buildMessage(nota: NotaPedido) {
    let msg = `*Nota de Pedido - GOcelular*\n`
    msg += `Fecha: ${nota.fecha}\n`
    msg += `Proveedor: ${nota.proveedor.nombre}\n\n`
    nota.items.forEach((item) => {
      msg += `- ${item.producto.codigo || ''} ${item.producto.nombre} x${item.cantidad} @ ${formatearMoneda(item.precio)} = ${formatearMoneda(item.precio * item.cantidad)}\n`
    })
    const total = nota.items.reduce((s, i) => s + i.precio * i.cantidad, 0)
    msg += `\n*Total: ${formatearMoneda(total)}*`
    return msg
  }

  function openWhatsApp(nota: NotaPedido) {
    const phone = (nota.proveedor.whatsapp || '').replace(/\D/g, '')
    const msg = encodeURIComponent(buildMessage(nota))
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
    marcarEnviada(nota.id)
  }

  function openEmail(nota: NotaPedido) {
    const subject = encodeURIComponent(`Nota de Pedido - GOcelular - ${nota.fecha}`)
    const body = encodeURIComponent(buildMessage(nota))
    window.open(`mailto:${nota.proveedor.email || ''}?subject=${subject}&body=${body}`, '_blank')
    marcarEnviada(nota.id)
  }

  function openPrintPreview(nota: NotaPedido) {
    const total = nota.items.reduce((s, i) => s + i.precio * i.cantidad, 0)
    const rows = nota.items
      .map(
        (i) =>
          `<tr><td style="padding:8px;border-bottom:1px solid #eee">${i.producto.codigo || '-'}</td><td style="padding:8px;border-bottom:1px solid #eee">${i.producto.nombre}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${i.cantidad}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatearMoneda(i.precio)}</td><td style="padding:8px;border-bottom:1px solid #eee">${i.plazo}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatearMoneda(i.precio * i.cantidad)}</td></tr>`
      )
      .join('')

    const html = `<!DOCTYPE html><html><head><title>Nota de Pedido</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#333}table{width:100%;border-collapse:collapse}th{background:#f3f4f6;padding:8px;text-align:left;border-bottom:2px solid #d1d5db}h1{color:#4f46e5}@media print{body{margin:0}}</style></head><body><h1>Nota de Pedido</h1><p><strong>Proveedor:</strong> ${nota.proveedor.nombre}</p><p><strong>Fecha:</strong> ${nota.fecha}</p><p><strong>Estado:</strong> ${nota.estado}</p><table><thead><tr><th>Codigo</th><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">Precio</th><th>Plazo</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="5" style="padding:12px 8px;font-weight:bold;text-align:right;border-top:2px solid #d1d5db">Total:</td><td style="padding:12px 8px;font-weight:bold;text-align:right;border-top:2px solid #d1d5db">${formatearMoneda(total)}</td></tr></tfoot></table></body></html>`

    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
    }
  }

  const tabs = [
    { key: 'catalogo' as Tab, label: 'Catalogo' },
    { key: 'pedido' as Tab, label: `Mi Pedido (${cart.length})` },
    { key: 'notas' as Tab, label: `Notas de Pedido (${notas.length})` },
  ]

  return (
    <div className="p-6 max-w-full mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/compras"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Compras
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Gestor de Pedidos</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Catalogo tab */}
      {tab === 'catalogo' && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto o codigo..."
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-72"
            />
            <div className="flex flex-wrap gap-2">
              {categoriasUsadas.map((cat) => (
                <button
                  key={cat}
                  onClick={() => { setFiltroCategoria(cat); setFiltroMarca('') }}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                    filtroCategoria === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          {filtroCategoria === 'Celulares' && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setFiltroMarca('')}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  !filtroMarca ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Todas las marcas
              </button>
              {MARCAS_CELULARES.map((m) => (
                <button
                  key={m}
                  onClick={() => setFiltroMarca(m)}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                    filtroMarca === m ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Codigo</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Producto</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Categoria</th>
                  {proveedoresFiltrados.map((prov) => (
                    <th key={prov.id} className="text-center px-4 py-3 font-medium text-gray-600 min-w-[100px]">
                      {prov.nombre}
                    </th>
                  ))}
                  <th className="text-center px-4 py-3 font-medium text-gray-600 w-20">Cant.</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 w-20">Agregar</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={5 + proveedoresFiltrados.length} className="px-4 py-8 text-center text-gray-400">
                      No hay productos
                    </td>
                  </tr>
                ) : (
                  filtrados.map((prod) => (
                    <tr key={prod.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{prod.codigo || '-'}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{prod.nombre}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{prod.categoria}</span>
                      </td>
                      {proveedoresFiltrados.map((prov) => {
                        const precio = getPrecio(prod.id, prov.id)
                        const isSelected = selectedProv[prod.id] === prov.id
                        return (
                          <td key={prov.id} className="px-4 py-3 text-center">
                            {precio ? (
                              <button
                                onClick={() =>
                                  setSelectedProv((prev) => ({
                                    ...prev,
                                    [prod.id]: prov.id,
                                  }))
                                }
                                className={`inline-flex flex-col items-center px-2 py-1 rounded-lg transition-all ${
                                  isSelected
                                    ? 'bg-blue-50 border-2 border-blue-500 text-blue-700'
                                    : 'hover:bg-gray-100 text-gray-700 border border-transparent'
                                }`}
                              >
                                <span className="font-medium text-sm">{formatearMoneda(precio.precio)}</span>
                                <span className="text-[10px] text-gray-400">{precio.plazo}</span>
                              </button>
                            ) : (
                              <span className="text-xs text-gray-300">-</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          min="1"
                          value={cantidades[prod.id] || 1}
                          onChange={(e) =>
                            setCantidades((prev) => ({
                              ...prev,
                              [prod.id]: Math.max(1, Number(e.target.value)),
                            }))
                          }
                          className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => addToCart(prod)}
                          disabled={!selectedProv[prod.id]}
                          className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          Agregar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mi Pedido tab */}
      {tab === 'pedido' && (
        <div>
          {cart.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-sm">El pedido esta vacio. Agrega productos desde el Catalogo.</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Codigo</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Producto</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Proveedor</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Cant.</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Precio</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Plazo</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Subtotal</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100">
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{item.producto.codigo || '-'}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{item.producto.nombre}</td>
                        <td className="px-4 py-3 text-gray-600">{item.proveedor.nombre}</td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min="1"
                            value={item.cantidad}
                            onChange={(e) => updateCartQty(item.id, Number(e.target.value))}
                            className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center"
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{formatearMoneda(item.precio)}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{item.plazo}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatearMoneda(item.precio * item.cantidad)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="text-red-400 hover:text-red-600 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-xs text-gray-500 mb-1">Total del pedido</p>
                  <p className="text-2xl font-bold text-gray-900">{formatearMoneda(totalPedido)}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-xs text-gray-500 mb-1">Items</p>
                  <p className="text-2xl font-bold text-gray-900">{totalItems} unidades</p>
                  <p className="text-xs text-gray-400">{cart.length} lineas</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-xs text-gray-500 mb-2">Por plazo</p>
                  {resumenPorPlazo.map(([plazo, total]) => (
                    <div key={plazo} className="flex justify-between text-sm">
                      <span className="text-gray-600">{plazo}</span>
                      <span className="font-medium text-gray-900">{formatearMoneda(total)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={generarNotas}
                className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Generar Notas de Pedido
              </button>
            </>
          )}
        </div>
      )}

      {/* Notas de Pedido tab */}
      {tab === 'notas' && (
        <div>
          {notas.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-sm">No hay notas de pedido. Arma un pedido desde el Catalogo y genera las notas.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {notas.map((nota) => {
                const total = nota.items.reduce((s, i) => s + i.precio * i.cantidad, 0)
                return (
                  <div key={nota.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {/* Document header */}
                    <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          Nota de Pedido - {nota.proveedor.nombre}
                        </h3>
                        <p className="text-xs text-gray-500">Fecha: {nota.fecha} | ID: {nota.id}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-3 py-1 text-xs font-semibold rounded-full ${
                            nota.estado === 'borrador'
                              ? 'bg-yellow-100 text-yellow-700'
                              : nota.estado === 'confirmado'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {nota.estado.charAt(0).toUpperCase() + nota.estado.slice(1)}
                        </span>
                      </div>
                    </div>

                    {/* Document body */}
                    <div className="p-6">
                      <table className="w-full text-sm mb-4">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 font-medium text-gray-600">Codigo</th>
                            <th className="text-left py-2 font-medium text-gray-600">Producto</th>
                            <th className="text-center py-2 font-medium text-gray-600">Cant.</th>
                            <th className="text-right py-2 font-medium text-gray-600">Precio</th>
                            <th className="text-left py-2 font-medium text-gray-600">Plazo</th>
                            <th className="text-right py-2 font-medium text-gray-600">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {nota.items.map((item) => (
                            <tr key={item.id} className="border-b border-gray-50">
                              <td className="py-2 text-gray-500 font-mono text-xs">{item.producto.codigo || '-'}</td>
                              <td className="py-2 text-gray-900">{item.producto.nombre}</td>
                              <td className="py-2 text-center">{item.cantidad}</td>
                              <td className="py-2 text-right">{formatearMoneda(item.precio)}</td>
                              <td className="py-2 text-gray-500 text-xs">{item.plazo}</td>
                              <td className="py-2 text-right font-medium">{formatearMoneda(item.precio * item.cantidad)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={5} className="pt-3 text-right font-bold text-gray-900 border-t border-gray-200">
                              Total:
                            </td>
                            <td className="pt-3 text-right font-bold text-gray-900 border-t border-gray-200">
                              {formatearMoneda(total)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>

                      {/* Actions */}
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => openPrintPreview(nota)}
                          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Ver PDF
                        </button>
                        {nota.estado === 'borrador' && (
                          <button
                            onClick={() => confirmarNota(nota.id)}
                            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Confirmar
                          </button>
                        )}
                        {nota.estado === 'confirmado' && (
                          <button
                            onClick={() => enviarNota(nota.id)}
                            className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                          >
                            Enviar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Send modal */}
      {sendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Enviar Nota de Pedido</h3>
            <p className="text-sm text-gray-500 mb-6">
              Proveedor: {sendModal.nota.proveedor.nombre}
            </p>
            <div className="space-y-3">
              <button
                onClick={() => openWhatsApp(sendModal.nota)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
              >
                <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                </svg>
                <div className="text-left">
                  <p className="font-medium text-green-800 text-sm">WhatsApp</p>
                  <p className="text-xs text-green-600">{sendModal.nota.proveedor.whatsapp || 'Sin numero'}</p>
                </div>
              </button>
              <button
                onClick={() => openEmail(sendModal.nota)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <div className="text-left">
                  <p className="font-medium text-blue-800 text-sm">Email</p>
                  <p className="text-xs text-blue-600">{sendModal.nota.proveedor.email || 'Sin email'}</p>
                </div>
              </button>
            </div>
            <div className="mt-4 text-right">
              <button
                onClick={() => setSendModal(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
