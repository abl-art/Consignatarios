'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatearMoneda } from '@/lib/utils'
import { guardarPedido, actualizarEstadoPedido, eliminarPedido, marcarEntregado } from '@/lib/actions/compras'

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

type Tab = 'catalogo' | 'pedido' | 'notas' | 'confirmados'

interface PedidoGuardado {
  id: string
  proveedorId: string
  proveedorNombre: string
  proveedorWhatsapp: string
  proveedorEmail: string
  items: { productoId: string; productoNombre: string; productoCodigo: string; proveedorId: string; proveedorNombre: string; proveedorWhatsapp: string; proveedorEmail: string; precio: number; plazo: string; cantidad: number }[]
  estado: 'borrador' | 'confirmado' | 'enviado'
  fecha: string
  enviadoPor?: string
  confirmadoAt?: string
  entregadoAt?: string
}

export default function GestorClient({
  productos,
  proveedores,
  precios,
  pedidosGuardados,
  forecastApiUrl,
  forecastEvents,
  forecastDias,
}: {
  productos: Producto[]
  proveedores: Proveedor[]
  precios: Precio[]
  pedidosGuardados: PedidoGuardado[]
  forecastApiUrl: string
  forecastEvents: Record<string, number>
  forecastDias: number
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('catalogo')
  const [busqueda, setBusqueda] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('Celulares')
  const [filtroMarca, setFiltroMarca] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [notas, setNotas] = useState<NotaPedido[]>(() =>
    pedidosGuardados.filter(p => p.estado === 'borrador' || p.estado === 'confirmado').map(p => ({
      id: p.id,
      proveedor: { id: p.proveedorId, nombre: p.proveedorNombre, whatsapp: p.proveedorWhatsapp, email: p.proveedorEmail, direccion: '', notas: '' },
      items: p.items.map(i => ({
        id: `${i.productoId}-${i.proveedorId}`,
        producto: { id: i.productoId, codigo: i.productoCodigo, nombre: i.productoNombre, categoria: '' },
        proveedor: { id: i.proveedorId, nombre: i.proveedorNombre, whatsapp: i.proveedorWhatsapp, email: i.proveedorEmail, direccion: '', notas: '' },
        precio: i.precio,
        plazo: i.plazo,
        cantidad: i.cantidad,
      })),
      estado: p.estado,
      fecha: p.fecha,
    }))
  )
  // cantidadesPorProv: { "prodId-provId": number }
  const [cantidadesPorProv, setCantidadesPorProv] = useState<Record<string, number>>({})

  // Forecast data: { "Motorola Moto G06 64GB": 258, ... }
  const [forecastByModel, setForecastByModel] = useState<Record<string, number>>({})
  const [forecastLoading, setForecastLoading] = useState(true)

  useEffect(() => {
    fetch(`${forecastApiUrl}/forecast/compras`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: forecastEvents, days: forecastDias }),
    })
      .then(res => res.json())
      .then((data: { modelo: string; forecast: number }[]) => {
        if (Array.isArray(data)) {
          const map: Record<string, number> = {}
          data.forEach(d => { map[d.modelo] = d.forecast })
          setForecastByModel(map)
        }
        setForecastLoading(false)
      })
      .catch(() => setForecastLoading(false))
  }, [forecastApiUrl, forecastEvents, forecastDias])

  // Normalize name for matching: remove RAM prefix (4/, 8/), extra spaces, case
  function normalizeName(name: string): string {
    return name.toLowerCase().replace(/\d+\//g, '').replace(/\s+/g, ' ').trim()
  }

  // Match forecast to product by name similarity
  function getForecastForProduct(prodName: string): number {
    // Direct match
    if (forecastByModel[prodName]) return forecastByModel[prodName]
    // Normalized match
    const norm = normalizeName(prodName)
    for (const [model, qty] of Object.entries(forecastByModel)) {
      if (normalizeName(model) === norm) return qty
    }
    // Partial match - check if key parts match
    for (const [model, qty] of Object.entries(forecastByModel)) {
      const normModel = normalizeName(model)
      if (norm.includes(normModel) || normModel.includes(norm)) return qty
    }
    return 0
  }

  // Send modal
  const [sendModal, setSendModal] = useState<{ nota: NotaPedido } | null>(null)

  const categoriasUsadas = Array.from(new Set([...productos.map((p) => p.categoria), 'Kits de Seguridad']))

  const filtrados = useMemo(() => {
    let result = productos
    // Kits de Seguridad: show celulares models (same models, different proveedor)
    if (filtroCategoria === 'Kits de Seguridad') {
      result = productos.filter((p) => p.categoria === 'Celulares')
    } else if (filtroCategoria) {
      result = result.filter((p) => p.categoria === filtroCategoria)
    }
    if (filtroMarca && (filtroCategoria === 'Celulares' || filtroCategoria === 'Kits de Seguridad')) {
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
      if (filtroMarca && (filtroCategoria === 'Celulares' || filtroCategoria === 'Kits de Seguridad')) {
        const marcasProv = parseProvMarcas(prov.notas)
        if (marcasProv.length > 0 && !marcasProv.includes(filtroMarca)) return false
      }
      return true
    })
  }, [proveedores, filtroCategoria, filtroMarca])

  // Find kit product IDs (products in "Kits de Seguridad" category)
  const kitProductIds = useMemo(() => productos.filter(p => p.categoria === 'Kits de Seguridad').map(p => p.id), [productos])

  // Kit prices by proveedor: { provId: Precio }
  const kitPreciosPorProv = useMemo(() => {
    const map: Record<string, Precio> = {}
    kitProductIds.forEach(kitId => {
      precios.filter(p => p.producto_id === kitId).forEach(p => {
        map[p.proveedor_id] = p
      })
    })
    return map
  }, [precios, kitProductIds])

  function getPrecio(productoId: string, proveedorId: string): Precio | undefined {
    // In kit mode, use the generic kit price for any celular model
    if (filtroCategoria === 'Kits de Seguridad') {
      return kitPreciosPorProv[proveedorId]
    }
    return precios.find((p) => p.producto_id === productoId && p.proveedor_id === proveedorId)
  }

  function getCantKey(prodId: string, provId: string) {
    return `${prodId}-${provId}`
  }

  function getCantProv(prodId: string, provId: string): number {
    return cantidadesPorProv[getCantKey(prodId, provId)] || 0
  }

  function setCantProv(prodId: string, provId: string, qty: number) {
    setCantidadesPorProv(prev => ({ ...prev, [getCantKey(prodId, provId)]: Math.max(0, qty) }))
  }

  function getTotalCant(prodId: string): number {
    return proveedoresFiltrados.reduce((sum, prov) => sum + getCantProv(prodId, prov.id), 0)
  }

  function addToCart(producto: Producto) {
    const newItems: CartItem[] = []
    proveedoresFiltrados.forEach(prov => {
      const qty = getCantProv(producto.id, prov.id)
      if (qty <= 0) return
      const precio = getPrecio(producto.id, prov.id)
      if (!precio) return

      const existingIdx = cart.findIndex(
        item => item.producto.id === producto.id && item.proveedor.id === prov.id
      )

      if (existingIdx >= 0) {
        setCart(prev => {
          const updated = [...prev]
          updated[existingIdx] = { ...updated[existingIdx], cantidad: updated[existingIdx].cantidad + qty }
          return updated
        })
      } else {
        newItems.push({
          id: `${producto.id}-${prov.id}-${Date.now()}`,
          producto,
          proveedor: prov,
          precio: precio.precio,
          plazo: precio.plazo,
          cantidad: qty,
        })
      }
    })

    if (newItems.length > 0) {
      setCart(prev => [...prev, ...newItems])
    }

    // Reset quantities for this product
    const resetKeys: Record<string, number> = {}
    proveedoresFiltrados.forEach(prov => { resetKeys[getCantKey(producto.id, prov.id)] = 0 })
    setCantidadesPorProv(prev => ({ ...prev, ...resetKeys }))
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

  async function generarNotas() {
    const porProveedor: Record<string, CartItem[]> = {}
    cart.forEach((item) => {
      if (!porProveedor[item.proveedor.id]) porProveedor[item.proveedor.id] = []
      porProveedor[item.proveedor.id].push(item)
    })

    const fecha = new Date().toLocaleDateString('es-AR')
    const nuevasNotas: NotaPedido[] = Object.entries(porProveedor).map(([provId, items]) => ({
      id: `NP-${Date.now()}-${provId}`,
      proveedor: items[0].proveedor,
      items,
      estado: 'borrador' as const,
      fecha,
    }))

    // Save each to DB
    for (const nota of nuevasNotas) {
      await guardarPedido({
        id: nota.id,
        proveedorId: nota.proveedor.id,
        proveedorNombre: nota.proveedor.nombre,
        proveedorWhatsapp: nota.proveedor.whatsapp,
        proveedorEmail: nota.proveedor.email,
        items: nota.items.map(i => ({
          productoId: i.producto.id, productoNombre: i.producto.nombre, productoCodigo: i.producto.codigo,
          proveedorId: i.proveedor.id, proveedorNombre: i.proveedor.nombre, proveedorWhatsapp: i.proveedor.whatsapp, proveedorEmail: i.proveedor.email,
          precio: i.precio, plazo: i.plazo, cantidad: i.cantidad,
        })),
        estado: 'borrador',
        fecha,
      })
    }

    setNotas(prev => [...prev, ...nuevasNotas])
    setCart([])
    setTab('notas')
    router.refresh()
  }

  async function confirmarNota(notaId: string) {
    await actualizarEstadoPedido(notaId, 'confirmado')
    setNotas((prev) =>
      prev.map((n) => (n.id === notaId ? { ...n, estado: 'confirmado' } : n))
    )
  }

  function enviarNota(notaId: string) {
    const nota = notas.find((n) => n.id === notaId)
    if (!nota) return
    setSendModal({ nota })
  }

  async function marcarEnviada(notaId: string, via: string) {
    await actualizarEstadoPedido(notaId, 'enviado', via)
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
      msg += `- ${item.producto.nombre} x${item.cantidad} @ ${formatearMoneda(item.precio)} = ${formatearMoneda(item.precio * item.cantidad)}\n`
    })
    const total = nota.items.reduce((s, i) => s + i.precio * i.cantidad, 0)
    msg += `\nSubtotal Neto: ${formatearMoneda(total)}`
    msg += `\nIVA 21%: ${formatearMoneda(total * 0.21)}`
    msg += `\n*Total General: ${formatearMoneda(total * 1.21)}*`
    return msg
  }

  function openWhatsApp(nota: NotaPedido) {
    const phone = (nota.proveedor.whatsapp || '').replace(/\D/g, '')
    const msg = encodeURIComponent(buildMessage(nota))
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
    marcarEnviada(nota.id, 'whatsapp')
  }

  function openEmail(nota: NotaPedido) {
    const subject = encodeURIComponent(`Nota de Pedido - GOcelular - ${nota.fecha}`)
    const body = encodeURIComponent(buildMessage(nota))
    window.location.href = `mailto:${nota.proveedor.email || ''}?subject=${subject}&body=${body}`
    marcarEnviada(nota.id, 'email')
  }

  function openPrintPreview(nota: NotaPedido) {
    const total = nota.items.reduce((s, i) => s + i.precio * i.cantidad, 0)
    const rows = nota.items
      .map(
        (i) =>
          `<tr><td style="padding:8px;border-bottom:1px solid #eee">${i.producto.codigo || '-'}</td><td style="padding:8px;border-bottom:1px solid #eee">${i.producto.nombre}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${i.cantidad}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatearMoneda(i.precio)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatearMoneda(i.precio * i.cantidad)}</td></tr>`
      )
      .join('')

    const iva = total * 0.21
    const totalGral = total * 1.21
    const html = `<!DOCTYPE html><html><head><title>Nota de Pedido - ${nota.proveedor.nombre}</title>
<style>
body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#333}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #E91E7B;padding-bottom:16px;margin-bottom:24px}
.header-left h1{color:#E91E7B;font-size:24px;margin:0 0 4px 0;font-weight:800}
.header-left p{margin:0;color:#666;font-size:12px}
.header-right{text-align:right;font-size:12px;color:#666}
.header-right strong{display:block;font-size:14px;color:#333}
.info-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;gap:32px;font-size:13px}
.info-box span{color:#666}
.info-box strong{color:#333}
table{width:100%;border-collapse:collapse;margin:16px 0}
th{background:#f3f4f6;padding:10px 12px;text-align:left;border-bottom:2px solid #d1d5db;font-size:12px;color:#374151}
td{padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px}
.text-right{text-align:right}
.text-center{text-align:center}
.totals td{border-bottom:none;padding:4px 12px}
.total-final td{font-weight:bold;font-size:15px;color:#E91E7B;padding-top:8px;border-top:2px solid #E91E7B}
.footer{margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;text-align:center;font-size:10px;color:#9ca3af}
@media print{body{margin:0;padding:20px}}
</style></head><body>
<div class="header">
  <div class="header-left">
    <h1>GOcelular</h1>
    <p>NOTA DE PEDIDO</p>
  </div>
  <div class="header-right">
    <strong>${nota.fecha}</strong>
    <span>ID: ${nota.id}</span>
  </div>
</div>
<div class="info-box">
  <div><span>Proveedor: </span><strong>${nota.proveedor.nombre}</strong></div>
  <div><span>Email: </span><strong>${nota.proveedor.email || '-'}</strong></div>
  <div><span>Estado: </span><strong>${nota.estado}</strong></div>
</div>
<table>
  <thead><tr><th>Codigo</th><th>Producto</th><th class="text-center">Cant.</th><th class="text-right">Precio Unit.</th><th class="text-right">Subtotal</th></tr></thead>
  <tbody>${rows}</tbody>
  <tbody>
    <tr class="totals"><td colspan="4" class="text-right">Subtotal Neto:</td><td class="text-right">${formatearMoneda(total)}</td></tr>
    <tr class="totals"><td colspan="4" class="text-right" style="color:#666;font-size:12px">IVA 21%:</td><td class="text-right" style="color:#666;font-size:12px">${formatearMoneda(iva)}</td></tr>
    <tr class="total-final"><td colspan="4" class="text-right">TOTAL GENERAL:</td><td class="text-right">${formatearMoneda(totalGral)}</td></tr>
  </tbody>
</table>
<div class="footer">Generado por GOcelular360 | ${nota.fecha}</div>
</body></html>`

    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
    }
  }

  const [expandedPedido, setExpandedPedido] = useState<string | null>(null)
  const [entregados, setEntregados] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    pedidosGuardados.forEach(p => { if (p.entregadoAt) map[p.id] = p.entregadoAt })
    return map
  })
  const pedidosEnviados = pedidosGuardados.filter(p => p.estado === 'enviado')
  const notasSinEnviar = notas.filter(n => n.estado !== 'enviado')

  const tabs = [
    { key: 'catalogo' as Tab, label: 'Catalogo' },
    { key: 'pedido' as Tab, label: `Mi Pedido (${cart.length})` },
    { key: 'notas' as Tab, label: `Notas de Pedido (${notasSinEnviar.length})` },
    { key: 'confirmados' as Tab, label: `Enviados (${pedidosEnviados.length})` },
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
          {(filtroCategoria === 'Celulares' || filtroCategoria === 'Kits de Seguridad') && (
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
                    <th key={prov.id} className="text-center px-3 py-3 font-medium text-gray-600 min-w-[120px]">
                      {prov.nombre}
                    </th>
                  ))}
                  <th className="text-center px-3 py-3 font-medium text-gray-600 w-24">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={4 + proveedoresFiltrados.length} className="px-4 py-8 text-center text-gray-400">
                      No hay productos
                    </td>
                  </tr>
                ) : (
                  filtrados.map((prod) => {
                    const enCarrito = cart.some(item => item.producto.id === prod.id)
                    const forecast = getForecastForProduct(prod.nombre)
                    return (
                    <tr key={prod.id} className={`border-b border-gray-100 hover:bg-gray-50 ${enCarrito ? 'bg-green-50' : ''}`}>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        <div className="flex items-center gap-1">
                          {enCarrito && <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                          <span>{prod.codigo || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{prod.nombre}</div>
                        {forecast > 0 && (
                          <div className="text-[10px] text-blue-600 mt-0.5">Forecast {forecastDias}d: {forecast} u.</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{prod.categoria}</span>
                      </td>
                      {proveedoresFiltrados.map((prov) => {
                        const precio = getPrecio(prod.id, prov.id)
                        const cant = getCantProv(prod.id, prov.id)
                        return (
                          <td key={prov.id} className="px-3 py-2 text-center">
                            {precio ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className="font-medium text-sm text-gray-800">{formatearMoneda(precio.precio)}</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={cant || ''}
                                  onChange={(e) => setCantProv(prod.id, prov.id, Number(e.target.value) || 0)}
                                  placeholder={forecast > 0 ? String(forecast) : '0'}
                                  onFocus={(e) => { if (!cant && forecast > 0) { setCantProv(prod.id, prov.id, forecast); e.target.value = String(forecast) } }}
                                  className={`w-16 px-2 py-1 border rounded text-sm text-center ${cant > 0 ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
                                />
                              </div>
                            ) : (
                              <span className="text-xs text-gray-300">-</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-center">
                        {(() => {
                          const total = getTotalCant(prod.id)
                          return (
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-lg font-bold ${total > 0 ? 'text-blue-700' : 'text-gray-300'}`}>{total}</span>
                              {total > 0 && (
                                <button
                                  onClick={() => addToCart(prod)}
                                  className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                  Agregar
                                </button>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                    </tr>
                    )
                  })
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
                  <p className="text-xs text-gray-500 mb-1">Subtotal (Neto)</p>
                  <p className="text-xl font-bold text-gray-900">{formatearMoneda(totalPedido)}</p>
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">IVA 21%</span>
                      <span className="text-gray-700">{formatearMoneda(totalPedido * 0.21)}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="font-semibold text-gray-900">Total General</span>
                      <span className="font-bold text-blue-700">{formatearMoneda(totalPedido * 1.21)}</span>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-xs text-gray-500 mb-1">Items</p>
                  <p className="text-2xl font-bold text-gray-900">{totalItems} unidades</p>
                  <p className="text-xs text-gray-400">{cart.length} lineas</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-xs text-gray-500 mb-2">Por plazo (con IVA)</p>
                  {resumenPorPlazo.map(([plazo, total]) => (
                    <div key={plazo} className="flex justify-between text-sm">
                      <span className="text-gray-600">{plazo}</span>
                      <span className="font-medium text-gray-900">{formatearMoneda(total * 1.21)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm mt-2 pt-2 border-t border-gray-100">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="font-bold text-blue-700">{formatearMoneda(totalPedido * 1.21)}</span>
                  </div>
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
          {notasSinEnviar.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-sm">No hay notas de pedido. Arma un pedido desde el Catalogo y genera las notas.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {notasSinEnviar.map((nota) => {
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
                              <td className="py-2 text-right font-medium">{formatearMoneda(item.precio * item.cantidad)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={4} className="pt-3 text-right text-gray-700 border-t border-gray-200">Subtotal (Neto):</td>
                            <td className="pt-3 text-right text-gray-700 border-t border-gray-200">{formatearMoneda(total)}</td>
                          </tr>
                          <tr>
                            <td colSpan={4} className="pt-1 text-right text-gray-500 text-xs">IVA 21%:</td>
                            <td className="pt-1 text-right text-gray-500 text-xs">{formatearMoneda(total * 0.21)}</td>
                          </tr>
                          <tr>
                            <td colSpan={4} className="pt-1 text-right font-bold text-blue-700">Total General:</td>
                            <td className="pt-1 text-right font-bold text-blue-700">{formatearMoneda(total * 1.21)}</td>
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

      {/* Confirmados tab */}
      {tab === 'confirmados' && (
        <div>
          {pedidosEnviados.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-sm">No hay pedidos confirmados.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Proveedor</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha pedido</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Items</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Total c/IVA</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Entrega</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Demora</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidosEnviados.map((p) => {
                    const totalNeto = p.items.reduce((s, i) => s + i.precio * i.cantidad, 0)
                    const totalConIva = totalNeto * 1.21
                    const totalUnidades = p.items.reduce((s, i) => s + i.cantidad, 0)
                    const entregadoAt = entregados[p.id] || p.entregadoAt

                    let demora = ''
                    if (entregadoAt && p.confirmadoAt) {
                      const dias = Math.round((new Date(entregadoAt).getTime() - new Date(p.confirmadoAt).getTime()) / (1000 * 60 * 60 * 24))
                      demora = `${dias} día${dias !== 1 ? 's' : ''}`
                    } else if (p.confirmadoAt) {
                      const dias = Math.round((Date.now() - new Date(p.confirmadoAt).getTime()) / (1000 * 60 * 60 * 24))
                      demora = `${dias}d en tránsito`
                    }

                    return (
                      <React.Fragment key={p.id}>
                      <tr onClick={() => setExpandedPedido(prev => prev === p.id ? null : p.id)} className={`border-b border-gray-100 cursor-pointer transition-colors ${entregadoAt ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-gray-50'}`}>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <span className="mr-1 text-gray-400">{expandedPedido === p.id ? '▾' : '▸'}</span>
                          {p.proveedorNombre}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{p.fecha}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{totalUnidades} u.</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">{formatearMoneda(totalConIva)}</td>
                        <td className="px-4 py-3 text-center">
                          {entregadoAt ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                              Recibido
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">En tránsito</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {entregadoAt ? (
                            <span className="text-xs text-green-700">{new Date(entregadoAt).toLocaleDateString('es-AR')}</span>
                          ) : (
                            <button
                              onClick={async () => {
                                if (!confirm('¿Marcar como recibido?')) return
                                const now = new Date().toISOString()
                                setEntregados(prev => ({ ...prev, [p.id]: now }))
                                await marcarEntregado(p.id)
                                router.refresh()
                              }}
                              className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                            >
                              Marcar recibido
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500">{demora}</td>
                      </tr>
                      {expandedPedido === p.id && (
                        <tr>
                          <td colSpan={7} className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  <th className="text-left py-1.5 font-medium text-gray-500">Producto</th>
                                  <th className="text-center py-1.5 font-medium text-gray-500">Cant.</th>
                                  <th className="text-right py-1.5 font-medium text-gray-500">Precio unit.</th>
                                  <th className="text-right py-1.5 font-medium text-gray-500">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.items.map((item, idx) => (
                                  <tr key={idx} className="border-b border-gray-100">
                                    <td className="py-1.5 text-gray-800">{item.productoNombre}</td>
                                    <td className="py-1.5 text-center text-gray-600">{item.cantidad}</td>
                                    <td className="py-1.5 text-right text-gray-600">{formatearMoneda(item.precio)}</td>
                                    <td className="py-1.5 text-right font-medium text-gray-800">{formatearMoneda(item.precio * item.cantidad)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr><td colSpan={3} className="pt-2 text-right text-gray-500">Neto:</td><td className="pt-2 text-right text-gray-700">{formatearMoneda(totalNeto)}</td></tr>
                                <tr><td colSpan={3} className="text-right text-gray-400">IVA 21%:</td><td className="text-right text-gray-400">{formatearMoneda(totalNeto * 0.21)}</td></tr>
                                <tr><td colSpan={3} className="text-right font-bold text-blue-700">Total:</td><td className="text-right font-bold text-blue-700">{formatearMoneda(totalConIva)}</td></tr>
                              </tfoot>
                            </table>
                            {p.enviadoPor && <p className="text-xs text-gray-400 mt-2">Enviado por {p.enviadoPor}</p>}
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
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
