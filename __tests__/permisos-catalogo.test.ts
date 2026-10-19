import { test, expect } from 'vitest'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { CATALOGO } from '@/lib/permisos-catalogo'

test('toda ruta top-level de app/(admin) está catalogada', () => {
  const base = join(__dirname, '..', 'app', '(admin)')
  const dirs = readdirSync(base).filter(d => statSync(join(base, d)).isDirectory())
  const rutasCatalogo = new Set(
    CATALOGO.flatMap(s => [s.href, ...s.subitems.map(i => i.ruta ?? '')]).map(r => r.split('/')[1])
  )
  for (const dir of dirs) expect(rutasCatalogo).toContain(dir)
})

test('finanzas tiene las 9 pestañas con los ids reales', () => {
  const fin = CATALOGO.find(s => s.id === 'finanzas')!
  const tabs = fin.subitems.filter(i => i.tab).map(i => i.tab)
  expect(tabs).toEqual(['flujo', 'egresos', 'deuda', 'indicadores', 'dpd', 'vintage', 'simulador', 'precios', 'resultado'])
})

test('ids de sección únicos y subitems únicos por sección', () => {
  const ids = CATALOGO.map(s => s.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const s of CATALOGO) {
    const sub = s.subitems.map(i => i.id)
    expect(new Set(sub).size).toBe(sub.length)
  }
})
