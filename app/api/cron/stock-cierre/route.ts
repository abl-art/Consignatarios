import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  SMARTWATCHES_CONFIG,
  PARLANTES_CONFIG,
  AURICULARES_CONFIG,
  type CategoriaConfig,
} from '@/lib/actions/accesorios-ventas'
import { getInventarioByCategoria } from '@/lib/actions/compras'
import { getModelosOcultos } from '@/lib/actions/kits-ocultos'

export const dynamic = 'force-dynamic'

const CONFIGS = [SMARTWATCHES_CONFIG, PARLANTES_CONFIG, AURICULARES_CONFIG]

async function getStockForConfig(config: CategoriaConfig): Promise<{
  stock: number
  precio: number
}> {
  const pool = getPool()
  if (!pool) return { stock: 0, precio: 0 }

  const client = await pool.connect()
  try {
    const res = await client.query<{ display_name: string; stock: string; price: string }>(
      `SELECT display_name, COALESCE(stock, 0)::text AS stock, price
       FROM store_products
       WHERE is_addon = true AND status = 'active' AND display_name NOT ILIKE '%E2E%'`
    )
    const matchKeyword = (name: string) => {
      const lower = name.toLowerCase()
      return config.keywords.some(k => lower.includes(k))
    }
    const items = res.rows.filter(r => matchKeyword(r.display_name))
    let stock = 0
    let precio = 0
    for (const r of items) {
      stock += Number(r.stock)
      if (Number(r.price) > 0) precio = Number(r.price) / 100
    }
    return { stock, precio }
  } finally {
    client.release()
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Período = mes anterior (el cron corre el día 1 a las 02:59 UTC = 23:59 AR del último día)
  const now = new Date()
  const mesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const periodo = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, '0')}`

  const admin = createAdminClient()
  const results: string[] = []

  for (const config of CONFIGS) {
    // Verificar si ya existe cierre para este período y categoría
    const { data: existing } = await admin
      .from('stock_cierre_mensual')
      .select('id')
      .eq('periodo', periodo)
      .eq('categoria', config.categoria)
      .maybeSingle()

    if (existing) {
      results.push(`${config.categoria}: ya existe cierre para ${periodo}`)
      continue
    }

    const { stock, precio } = await getStockForConfig(config)

    const { error } = await admin.from('stock_cierre_mensual').insert({
      periodo,
      categoria: config.categoria,
      producto: config.nombreUnificado,
      stock_final: stock,
      precio_unitario: precio,
      valuacion: stock * precio,
    })

    if (error) {
      results.push(`${config.categoria}: ERROR ${error.message}`)
    } else {
      results.push(`${config.categoria}: stock=${stock}, precio=${precio}, valuacion=${stock * precio}`)
    }
  }

  // --- Kits de Seguridad ---
  const kitsCategoria = 'kits-seguridad'
  const { data: kitsExisting } = await admin
    .from('stock_cierre_mensual')
    .select('id')
    .eq('periodo', periodo)
    .eq('categoria', kitsCategoria)
    .maybeSingle()

  if (kitsExisting) {
    results.push(`${kitsCategoria}: ya existe cierre para ${periodo}`)
  } else {
    const modelosOcultos = await getModelosOcultos()
    const kitsItems = await getInventarioByCategoria('Kits de Seguridad', modelosOcultos)
    const totalDisponible = kitsItems.reduce((s, r) => s + r.disponible, 0)
    const totalValuacion = kitsItems.reduce((s, r) => s + r.valuacion, 0)
    const precioPromedio = kitsItems.length > 0
      ? Math.round(totalValuacion / Math.max(totalDisponible, 1))
      : 0

    const { error: kitsError } = await admin.from('stock_cierre_mensual').insert({
      periodo,
      categoria: kitsCategoria,
      producto: 'Kits de Seguridad',
      stock_final: totalDisponible,
      precio_unitario: precioPromedio,
      valuacion: totalValuacion,
    })

    if (kitsError) {
      results.push(`${kitsCategoria}: ERROR ${kitsError.message}`)
    } else {
      results.push(`${kitsCategoria}: stock=${totalDisponible}, valuacion=${totalValuacion}`)
    }
  }

  return NextResponse.json({ periodo, results })
}
