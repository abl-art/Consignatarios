'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { agregarProducto, editarProducto, eliminarProducto, toggleOcultoProducto, setPrecio, eliminarPrecio } from '@/lib/actions/compras'
import { filtrosInicialesModelos, proveedorVendeProducto, MARCAS_CELULARES } from '@/lib/compras-modelos-filtros'
import { formatearMoneda } from '@/lib/utils'

interface Proveedor {
  id: string
  nombre: string
  direccion: string // tipo_producto
  notas: string // JSON with marcas
}

interface Producto {
  id: string
  codigo: string
  nombre: string
  categoria: string
  plataforma?: string // 'gocelular' (default) | 'gomarket'
  ean?: string | null
  oculto?: boolean
}

interface Precio {
  id: string
  producto_id: string
  proveedor_id: string
  precio: number
  plazo: string
  created_at?: string | null
}

// Kits de Seguridad no se crean a mano: se sincronizan desde GOcelular (store_products)
const CATEGORIAS = ['Celulares', 'Tablets', 'Smartwatches', 'Parlantes', 'Auriculares', 'Accesorios', 'Otros']
const PLAZOS = ['Contado', '24hs', '48hs', '72hs', '1 semana', '2 semanas', '30 dias']

const emptyProduct = { codigo: '', nombre: '', categoria: 'Celulares', plataforma: 'gocelular', ean: '' }

export default function ModelosClient({
  productos,
  proveedores,
  precios,
  gomarketCategorias,
  gomarketSinSku,
}: {
  productos: Producto[]
  proveedores: Proveedor[]
  precios: Precio[]
  // Categorías activas de GOmarket (commerce_categories): se despliegan en el
  // form cuando el producto es plataforma gomarket
  gomarketCategorias: string[]
  // Productos creados en GOmarket sin ningún SKU: no sincronizan ni se compran
  gomarketSinSku: { nombre: string; categoria: string | null }[]
}) {
  const router = useRouter()
  const [filtroCategoria, setFiltroCategoria] = useState<string>('Celulares')
  const [filtroMarca, setFiltroMarca] = useState<string>('')
  const [filtroTienda, setFiltroTienda] = useState<'todas' | 'gocelular' | 'gomarket'>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [soloSinPrecio, setSoloSinPrecio] = useState(false)
  const searchParams = useSearchParams()

  // Llegada con ?producto=<id> (link "sin costo →" de la lista de precios):
  // preseleccionar la categoría y tienda del producto para que sea visible.
  useEffect(() => {
    const ini = filtrosInicialesModelos(searchParams.get('producto'), productos)
    if (ini) {
      setFiltroTienda(ini.tienda)
      setFiltroCategoria(ini.categoria)
      setFiltroMarca('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [productForm, setProductForm] = useState(emptyProduct)
  const [loading, setLoading] = useState(false)
  const [mostrarInactivos, setMostrarInactivos] = useState(false)

  // Price modal
  const [priceModal, setPriceModal] = useState<{
    productoId: string
    proveedorId: string
    precioActual?: Precio
  } | null>(null)
  const [precioInput, setPrecioInput] = useState('')
  const [plazoInput, setPlazoInput] = useState('Contado')

  // Filter products by store, category, brand, and visibility
  const porTienda =
    filtroTienda === 'todas'
      ? productos
      : productos.filter((p) => (p.plataforma === 'gomarket' ? 'gomarket' : 'gocelular') === filtroTienda)
  let filtrados = filtroCategoria
    ? porTienda.filter((p) => p.categoria === filtroCategoria)
    : porTienda
  if (filtroMarca && filtroCategoria === 'Celulares') {
    filtrados = filtrados.filter((p) => p.nombre.toLowerCase().includes(filtroMarca.toLowerCase()))
  }
  if (!mostrarInactivos) {
    filtrados = filtrados.filter((p) => !p.oculto)
  }
  // Buscador por nombre o código (la lista crece: encontrar rápido sin scrollear)
  const q = busqueda.trim().toLowerCase()
  if (q) {
    filtrados = filtrados.filter((p) => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))
  }
  // Vista "sin precio": productos que todavía no tienen ningún costo cargado
  if (soloSinPrecio) {
    filtrados = filtrados.filter((p) => !precios.some((pr) => pr.producto_id === p.id))
  }

  const categoriasUsadas = Array.from(new Set(productos.map((p) => p.categoria)))

  // ¿Este proveedor vende este producto? Criterio = marca (ver lib). Alias local
  // para no repetir prov.notas en cada llamada.
  const provVendeProducto = (prov: Proveedor, prod: Producto) => proveedorVendeProducto(prov.notas, prod)

  // Columnas = solo proveedores que venden al menos un producto visible: así la
  // grilla no arrastra columnas de proveedores que no vienen al caso.
  const proveedoresFiltrados = proveedores.filter((prov) => filtrados.some((prod) => provVendeProducto(prov, prod)))

  // Cuántos proveedores tienen precio cargado para un producto (chip "N proveedores")
  function proveedoresConPrecio(productoId: string): number {
    return precios.filter((p) => p.producto_id === productoId).length
  }

  // Antigüedad del precio: compras_precios.created_at se refresca en cada carga
  // (es el "último costo"), así que mide cuánto hace que no se actualiza.
  function antiguedadPrecio(createdAt?: string | null): { texto: string; viejo: boolean } | null {
    if (!createdAt) return null
    const dias = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000)
    if (dias <= 0) return { texto: 'hoy', viejo: false }
    if (dias < 30) return { texto: `hace ${dias}d`, viejo: false }
    if (dias < 60) return { texto: `hace ${dias}d`, viejo: true }
    const meses = Math.floor(dias / 30)
    return { texto: `hace ${meses}m`, viejo: true }
  }

  // Helper to get proveedor plazo from their notas
  function getProveedorPlazo(provId: string): string {
    const prov = proveedores.find(p => p.id === provId)
    if (!prov) return ''
    try {
      return JSON.parse(prov.notas)?.plazos || ''
    } catch {
      return ''
    }
  }

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
    setProductForm({ codigo: p.codigo, nombre: p.nombre, categoria: p.categoria, plataforma: p.plataforma === 'gomarket' ? 'gomarket' : 'gocelular', ean: p.ean ?? '' })
    setShowProductForm(true)
  }

  function cancelProductForm() {
    setShowProductForm(false)
    setEditingProductId(null)
    setProductForm(emptyProduct)
  }

  const formEsGomarket = productForm.plataforma === 'gomarket'
  // Para productos GOmarket la categoría es la de GOmarket (commerce_categories);
  // en edición se conserva la actual aunque ya no esté activa allá
  const opcionesCategoriaGomarket = productForm.categoria && !gomarketCategorias.includes(productForm.categoria)
    ? [productForm.categoria, ...gomarketCategorias]
    : gomarketCategorias

  function cambiarPlataforma(plataforma: string) {
    setProductForm((f) => ({
      ...f,
      plataforma,
      categoria: plataforma === 'gomarket' ? (gomarketCategorias[0] ?? '') : (CATEGORIAS.includes(f.categoria) ? f.categoria : 'Celulares'),
    }))
  }

  async function handleProductSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productForm.nombre.trim()) return
    if (formEsGomarket && !productForm.categoria) return
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

  async function handleToggleOculto(prod: Producto) {
    setLoading(true)
    await toggleOcultoProducto(prod.id, !prod.oculto)
    setLoading(false)
    router.refresh()
  }

  // Price CRUD
  function openPriceModal(productoId: string, proveedorId: string) {
    const existing = getPrecio(productoId, proveedorId)
    setPriceModal({ productoId, proveedorId, precioActual: existing })
    setPrecioInput(existing ? String(existing.precio) : '')
    // Use proveedor's plazo, fallback to existing price plazo
    const provPlazo = getProveedorPlazo(proveedorId)
    setPlazoInput(existing?.plazo || provPlazo || '')
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
    <div className="p-4 md:p-6 max-w-full mx-auto">
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
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Categoria{formEsGomarket && <span className="text-violet-600"> (de GOmarket)</span>}
                </label>
                <select
                  value={productForm.categoria}
                  onChange={(e) => setProductForm((f) => ({ ...f, categoria: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  disabled={formEsGomarket && opcionesCategoriaGomarket.length === 0}
                >
                  {formEsGomarket ? (
                    opcionesCategoriaGomarket.length === 0 ? (
                      <option value="">Sin categorías en GOmarket</option>
                    ) : (
                      opcionesCategoriaGomarket.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))
                    )
                  ) : (
                    CATEGORIAS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))
                  )}
                </select>
                {formEsGomarket && opcionesCategoriaGomarket.length === 0 && (
                  <p className="text-[10px] text-amber-600 mt-1">Todavía no hay categorías creadas en GOmarket — crealas en el admin de GOmarket y recargá esta página</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Plataforma</label>
                <select
                  value={productForm.plataforma}
                  onChange={(e) => cambiarPlataforma(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="gocelular">GOcelular</option>
                  <option value="gomarket">GOmarket</option>
                </select>
                <p className="text-[10px] text-gray-400 mt-1">Define a qué sistema se informan las compras de este producto</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">EAN <span className="text-gray-400 font-normal">(opcional)</span></label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{8,14}"
                  title="8 a 14 dígitos, sin espacios"
                  value={productForm.ean}
                  onChange={(e) => setProductForm((f) => ({ ...f, ean: e.target.value.replace(/\D/g, '') }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                  placeholder="7790000000000"
                />
                <p className="text-[10px] text-gray-400 mt-1">Código de barras de la caja. Si no lo tenés, la compra se informa con un EAN provisorio 299 automático</p>
              </div>
            </div>
            {formEsGomarket && (
              <p className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                Los productos de GOmarket se dan de alta UNA vez en el admin de GOmarket y aparecen acá solos con su
                categoría (sync automático al cargar la página). Cargalo a mano solo como excepción: si el SKU no existe
                en GOmarket, la compra rebota y el sync lo oculta.
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={cancelProductForm} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={loading || (formEsGomarket && !productForm.categoria)} className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Store filter pills */}
      <div className="flex flex-wrap gap-2 mb-2">
        {([['todas', 'Todas'], ['gocelular', 'GOcelular'], ['gomarket', 'GOmarket']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFiltroTienda(id)}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              filtroTienda === id
                ? id === 'gomarket' ? 'bg-violet-600 text-white border-violet-600' : 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2 mb-3">
        {categoriasUsadas.map((cat) => (
          <button
            key={cat}
            onClick={() => { setFiltroCategoria(cat); setFiltroMarca('') }}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              filtroCategoria === cat ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Aviso: productos de GOmarket a medio cargar (sin SKU no sincronizan ni se compran) */}
      {gomarketSinSku.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-4 text-xs text-amber-700">
          <p className="font-semibold mb-1">
            {gomarketSinSku.length === 1
              ? 'Hay 1 producto en GOmarket sin SKU cargado — hasta que le cargues el SKU (código + EAN) en el admin de GOmarket no aparece acá ni se puede comprar:'
              : `Hay ${gomarketSinSku.length} productos en GOmarket sin SKU cargado — hasta que les cargues el SKU (código + EAN) en el admin de GOmarket no aparecen acá ni se pueden comprar:`}
          </p>
          <ul className="list-disc ml-4">
            {gomarketSinSku.map((p) => (
              <li key={p.nombre}>{p.nombre}{p.categoria ? ` (${p.categoria})` : ''}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Aviso: categorías de GOmarket sincronizadas desde su admin */}
      {filtroCategoria && productos.some((p) => p.plataforma === 'gomarket' && p.categoria === filtroCategoria) && (
        <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-2.5 mb-4 text-xs text-violet-700">
          Los productos de GOmarket se sincronizan automaticamente desde el admin de GOmarket (SKU, nombre y categoria).
          Para agregar, renombrar o dar de baja uno, hacelo en GOmarket y recarga esta pagina.
        </div>
      )}

      {/* Aviso: kits sincronizados desde GOcelular */}
      {filtroCategoria === 'Kits de Seguridad' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 mb-4 text-xs text-blue-700">
          Los Kits de Seguridad se sincronizan automaticamente desde GOcelular (SKU y nombre).
          Para agregar, renombrar o dar de baja un kit, hacelo en GOcelular y recarga esta pagina.
        </div>
      )}

      {/* Marca filter (only for Celulares) */}
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

      {/* Buscador por nombre/código + vista sin precio */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto por nombre o código…"
            className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" title="Limpiar">✕</button>
          )}
        </div>
        <button
          onClick={() => setSoloSinPrecio((v) => !v)}
          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
            soloSinPrecio ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
          title="Mostrar solo productos que todavía no tienen ningún precio cargado"
        >
          {soloSinPrecio ? 'Solo sin precio ✓' : 'Sin precio'}
        </button>
        <span className="text-xs text-gray-400">{filtrados.length} productos</span>
      </div>

      {/* Toggle mostrar inactivos */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setMostrarInactivos(!mostrarInactivos)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
            mostrarInactivos ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mostrarInactivos ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
            )}
          </svg>
          {mostrarInactivos ? 'Ocultando inactivos' : 'Mostrar inactivos'}
        </button>
        {mostrarInactivos && (
          <span className="text-xs text-gray-400">
            ({productos.filter(p => p.oculto).length} ocultos)
          </span>
        )}
      </div>

      {/* Products table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Codigo</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Producto</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Categoria</th>
              {proveedoresFiltrados.map((prov) => (
                <th key={prov.id} className="text-center px-4 py-3 font-medium text-gray-600 min-w-[120px]">
                  {prov.nombre}
                </th>
              ))}
              <th className="text-center px-4 py-3 font-medium text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length > 0 && proveedoresFiltrados.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-center text-sm text-amber-700 bg-amber-50">
                  Ningún proveedor vende {filtroMarca ? `${filtroMarca} ` : ''}estos productos — revisá las marcas de cada
                  proveedor en{' '}
                  <Link href="/compras/proveedores" className="underline font-medium">Proveedores</Link>{' '}
                  para poder cargar precios acá.
                </td>
              </tr>
            )}
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={3 + proveedoresFiltrados.length + 1} className="px-4 py-8 text-center text-gray-400">
                  {busqueda || soloSinPrecio ? 'No hay productos que coincidan con el filtro' : 'No hay productos'}
                </td>
              </tr>
            ) : (
              filtrados.map((prod) => {
                const best = getBestPrecio(prod.id)
                return (
                  <tr key={prod.id} className={`border-b border-gray-100 hover:bg-gray-50 ${prod.oculto ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {prod.codigo || '-'}
                      {prod.ean && <div className="text-[10px] text-gray-400" title="EAN">EAN {prod.ean}</div>}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {prod.nombre}
                      {(() => {
                        const n = proveedoresConPrecio(prod.id)
                        return (
                          <div className={`text-[10px] font-normal ${n === 0 ? 'text-amber-500' : 'text-gray-400'}`}>
                            {n === 0 ? 'sin precio' : `${n} ${n === 1 ? 'proveedor' : 'proveedores'}`}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{prod.categoria}</span>
                      {prod.plataforma === 'gomarket' && (
                        <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-violet-100 text-violet-700">GOmarket</span>
                      )}
                    </td>
                    {proveedoresFiltrados.map((prov) => {
                      // El proveedor no vende este producto (por marca): celda inerte,
                      // no se puede cargar precio ahí.
                      if (!provVendeProducto(prov, prod)) {
                        return (
                          <td key={prov.id} className="px-4 py-3 text-center text-gray-200" title="Este proveedor no vende la marca de este producto">
                            —
                          </td>
                        )
                      }
                      const precio = getPrecio(prod.id, prov.id)
                      const isBest = precio && best !== null && precio.precio === best
                      const antig = precio && antiguedadPrecio(precio.created_at)
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
                              {antig && (
                                <span className={`text-[9px] ${antig.viejo ? 'text-amber-500' : 'text-gray-300'}`} title="Antigüedad del precio cargado">
                                  {antig.texto}
                                </span>
                              )}
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
                          onClick={() => handleToggleOculto(prod)}
                          title={prod.oculto ? 'Reactivar modelo' : 'Ocultar modelo'}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            prod.oculto
                              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {prod.oculto ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            )}
                          </svg>
                        </button>
                        {prod.categoria === 'Kits de Seguridad' ? (
                          <span
                            title="Sincronizado desde GOcelular"
                            className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded font-medium"
                          >
                            GOcelular
                          </span>
                        ) : (
                          <>
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
                          </>
                        )}
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
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {priceModal.precioActual ? 'Editar Precio' : 'Agregar Precio'}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              {productos.find(p => p.id === priceModal.productoId)?.nombre} — {proveedores.find(p => p.id === priceModal.proveedorId)?.nombre}
            </p>
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
              {plazoInput && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Condición de pago</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">{plazoInput}</div>
                </div>
              )}
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
