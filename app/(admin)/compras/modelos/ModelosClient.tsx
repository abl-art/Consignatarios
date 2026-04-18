'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { agregarProducto, editarProducto, eliminarProducto, setPrecio, eliminarPrecio } from '@/lib/actions/compras'
import { formatearMoneda } from '@/lib/utils'

interface Proveedor {
  id: string
  nombre: string
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

const CATEGORIAS = ['Celulares', 'Smartwatches', 'Parlantes', 'Auriculares', 'Kits de Seguridad', 'Accesorios', 'Otros']
const PLAZOS = ['Contado', '24hs', '48hs', '72hs', '1 semana', '2 semanas', '30 dias']

const emptyProduct = { codigo: '', nombre: '', categoria: 'Celulares' }

export default function ModelosClient({
  productos,
  proveedores,
  precios,
}: {
  productos: Producto[]
  proveedores: Proveedor[]
  precios: Precio[]
}) {
  const router = useRouter()
  const [filtroCategoria, setFiltroCategoria] = useState<string>('')
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [productForm, setProductForm] = useState(emptyProduct)
  const [loading, setLoading] = useState(false)

  // Price modal
  const [priceModal, setPriceModal] = useState<{
    productoId: string
    proveedorId: string
    precioActual?: Precio
  } | null>(null)
  const [precioInput, setPrecioInput] = useState('')
  const [plazoInput, setPlazoInput] = useState('Contado')

  const filtrados = filtroCategoria
    ? productos.filter((p) => p.categoria === filtroCategoria)
    : productos

  const categoriasUsadas = Array.from(new Set(productos.map((p) => p.categoria)))

  function getPrecio(productoId: string, proveedorId: string): Precio | undefined {
    return precios.find((p) => p.producto_id === productoId && p.proveedor_id === proveedorId)
  }

  function getBestPrecio(productoId: string): number | null {
    const preciosProducto = precios.filter((p) => p.producto_id === productoId)
    if (preciosProducto.length === 0) return null
    return Math.min(...preciosProducto.map((p) => p.precio))
  }

  // Product CRUD
  function startCreateProduct() {
    setEditingProductId(null)
    setProductForm(emptyProduct)
    setShowProductForm(true)
  }

  function startEditProduct(p: Producto) {
    setEditingProductId(p.id)
    setProductForm({ codigo: p.codigo, nombre: p.nombre, categoria: p.categoria })
    setShowProductForm(true)
  }

  function cancelProductForm() {
    setShowProductForm(false)
    setEditingProductId(null)
    setProductForm(emptyProduct)
  }

  async function handleProductSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productForm.nombre.trim()) return
    setLoading(true)
    if (editingProductId) {
      await editarProducto(editingProductId, productForm)
    } else {
      await agregarProducto(productForm)
    }
    setLoading(false)
    cancelProductForm()
    router.refresh()
  }

  async function handleDeleteProduct(id: string) {
    if (!confirm('¿Eliminar este producto y todos sus precios?')) return
    setLoading(true)
    await eliminarProducto(id)
    setLoading(false)
    router.refresh()
  }

  // Price CRUD
  function openPriceModal(productoId: string, proveedorId: string) {
    const existing = getPrecio(productoId, proveedorId)
    setPriceModal({ productoId, proveedorId, precioActual: existing })
    setPrecioInput(existing ? String(existing.precio) : '')
    setPlazoInput(existing?.plazo || 'Contado')
  }

  async function handlePriceSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!priceModal || !precioInput) return
    setLoading(true)
    await setPrecio(priceModal.productoId, priceModal.proveedorId, Number(precioInput), plazoInput)
    setLoading(false)
    setPriceModal(null)
    router.refresh()
  }

  async function handleDeletePrice() {
    if (!priceModal || !confirm('¿Eliminar este precio?')) return
    setLoading(true)
    await eliminarPrecio(priceModal.productoId, priceModal.proveedorId)
    setLoading(false)
    setPriceModal(null)
    router.refresh()
  }

  return (
    <div className="p-6 max-w-full mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/compras"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Compras
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Modelos y Precios</h1>
        </div>
        <button
          onClick={startCreateProduct}
          className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
        >
          Nuevo Modelo
        </button>
      </div>

      {/* Product form */}
      {showProductForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingProductId ? 'Editar Modelo' : 'Nuevo Modelo'}
          </h3>
          <form onSubmit={handleProductSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Codigo</label>
                <input
                  type="text"
                  value={productForm.codigo}
                  onChange={(e) => setProductForm((f) => ({ ...f, codigo: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="COD-001"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Producto *</label>
                <input
                  type="text"
                  value={productForm.nombre}
                  onChange={(e) => setProductForm((f) => ({ ...f, nombre: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Nombre del producto"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Categoria</label>
                <select
                  value={productForm.categoria}
                  onChange={(e) => setProductForm((f) => ({ ...f, categoria: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={cancelProductForm} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFiltroCategoria('')}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
            !filtroCategoria ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Todas
        </button>
        {categoriasUsadas.map((cat) => (
          <button
            key={cat}
            onClick={() => setFiltroCategoria(cat)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              filtroCategoria === cat ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Products table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Codigo</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Producto</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Categoria</th>
              {proveedores.map((prov) => (
                <th key={prov.id} className="text-center px-4 py-3 font-medium text-gray-600 min-w-[120px]">
                  {prov.nombre}
                </th>
              ))}
              <th className="text-center px-4 py-3 font-medium text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={3 + proveedores.length + 1} className="px-4 py-8 text-center text-gray-400">
                  No hay productos
                </td>
              </tr>
            ) : (
              filtrados.map((prod) => {
                const best = getBestPrecio(prod.id)
                return (
                  <tr key={prod.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{prod.codigo || '-'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{prod.nombre}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{prod.categoria}</span>
                    </td>
                    {proveedores.map((prov) => {
                      const precio = getPrecio(prod.id, prov.id)
                      const isBest = precio && best !== null && precio.precio === best
                      return (
                        <td key={prov.id} className="px-4 py-3 text-center">
                          {precio ? (
                            <button
                              onClick={() => openPriceModal(prod.id, prov.id)}
                              className={`inline-flex flex-col items-center px-2 py-1 rounded-lg transition-colors ${
                                isBest
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                  : 'hover:bg-gray-100 text-gray-700'
                              }`}
                            >
                              <span className="font-medium text-sm">
                                {isBest && <span className="mr-1">&#9733;</span>}
                                {formatearMoneda(precio.precio)}
                              </span>
                              <span className="text-[10px] text-gray-400">{precio.plazo}</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => openPriceModal(prod.id, prov.id)}
                              className="text-xs text-gray-300 hover:text-emerald-600 transition-colors"
                            >
                              + precio
                            </button>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => startEditProduct(prod)}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(prod.id)}
                          className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Price modal */}
      {priceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {priceModal.precioActual ? 'Editar Precio' : 'Agregar Precio'}
            </h3>
            <form onSubmit={handlePriceSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Precio</label>
                <input
                  type="number"
                  value={precioInput}
                  onChange={(e) => setPrecioInput(e.target.value)}
                  required
                  min="0"
                  step="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Plazo de entrega</label>
                <select
                  value={plazoInput}
                  onChange={(e) => setPlazoInput(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {PLAZOS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-between">
                <div>
                  {priceModal.precioActual && (
                    <button
                      type="button"
                      onClick={() => handleDeletePrice()}
                      className="px-3 py-2 text-xs text-red-600 hover:text-red-800 transition-colors"
                    >
                      Eliminar precio
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setPriceModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={loading} className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {loading ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
