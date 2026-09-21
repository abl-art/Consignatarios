'use client'

import { useEffect, useRef, useState } from 'react'
import type { Canal } from './CanalPills'
import type { BloqueoFiltro } from './BloqueoPills'
import type { FiltroIndicadores } from '@/lib/actions/finanzas'

// Estado compartido de los filtros de PD/DPD/Vintage. Las variantes por canal
// vienen precargadas del server (canales); cualquier combinación con bloqueo
// o merchant/store se fetchea on-demand vía server action y se cachea en
// memoria — volver a una combinación ya vista es instantáneo.
export function useIndicadoresFiltro<T>(
  canales: { total: T; propia: T; terceros: T },
  fetcher: (f: FiltroIndicadores) => Promise<T>,
) {
  const [canal, setCanalRaw] = useState<Canal>('total')
  const [bloqueo, setBloqueo] = useState<BloqueoFiltro>('todas')
  const [merchantId, setMerchantId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [segmentoLetra, setSegmentoLetra] = useState('')
  const [segmentoNumero, setSegmentoNumero] = useState('')
  const [dataFiltrada, setDataFiltrada] = useState<T | null>(null)
  const [cargando, setCargando] = useState(false)
  const cache = useRef(new Map<string, T>())

  const esDefault = bloqueo === 'todas' && !merchantId && !storeId && !segmentoLetra && !segmentoNumero
  const key = `${canal}|${bloqueo}|${merchantId}|${storeId}|${segmentoLetra}|${segmentoNumero}`

  useEffect(() => {
    if (esDefault) {
      setDataFiltrada(null)
      setCargando(false)
      return
    }
    const cached = cache.current.get(key)
    if (cached !== undefined) {
      setDataFiltrada(cached)
      setCargando(false)
      return
    }
    let vivo = true
    setCargando(true)
    fetcher({
      canal,
      bloqueo: bloqueo === 'todas' ? undefined : bloqueo,
      merchantId: merchantId || undefined,
      storeId: storeId || undefined,
      segmentoLetra: segmentoLetra || undefined,
      segmentoNumero: segmentoNumero || undefined,
    })
      .then(d => {
        if (!vivo) return
        cache.current.set(key, d)
        setDataFiltrada(d)
      })
      .catch(() => {
        if (vivo) setDataFiltrada(null)
      })
      .finally(() => {
        if (vivo) setCargando(false)
      })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, esDefault])

  const setCanal = (c: Canal) => {
    setCanalRaw(c)
    if (c !== 'terceros') {
      setMerchantId('')
      setStoreId('')
    }
  }

  const setMerchant = (m: string) => {
    setMerchantId(m)
    setStoreId('')
  }

  const data = esDefault ? canales[canal] : dataFiltrada ?? canales[canal]

  return {
    canal,
    setCanal,
    bloqueo,
    setBloqueo,
    merchantId,
    setMerchant,
    storeId,
    setStore: setStoreId,
    segmentoLetra,
    setSegmentoLetra,
    segmentoNumero,
    setSegmentoNumero,
    data,
    cargando,
  }
}
