export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getModelosAgregables } from '@/lib/actions/lista-precios-canales'
import { getModelosConImagenes } from '@/lib/actions/imagenes-tienda'
import ImagenesTiendaClient from './ImagenesTiendaClient'

export default async function ImagenesTiendaPage() {
  const [modelos, conImagenes] = await Promise.all([getModelosAgregables(), getModelosConImagenes()])

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <Link href="/canales/tienda" className="text-gray-400 hover:text-gray-600 text-sm">← Tienda Online</Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1 mt-2">Imágenes Tienda</h1>
      <p className="text-sm text-gray-500 mb-6">
        Subí las fotos del modelo como las encuentres en la web y salen listas para la tienda:
        PNG 2000×2000 con fondo transparente y el producto centrado
      </p>
      <ImagenesTiendaClient modelos={modelos} conImagenes={conImagenes} />
    </div>
  )
}
