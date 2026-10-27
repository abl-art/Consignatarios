import { describe, it, expect } from 'vitest'
import { ordenarBacklog, armarMailBacklog, todoDeCompletada, labelPrioridad, type TareaBacklog } from '@/lib/backlog-operaciones'

const tarea = (id: string, prioridad: TareaBacklog['prioridad'], creadoAt: string): TareaBacklog => ({
  id, titulo: `t-${id}`, detalle: null, prioridad, creadoAt, realizadoAt: null, mailEnviadoAt: null,
})

describe('ordenarBacklog', () => {
  it('urgente arriba, después durante el día, después puede esperar', () => {
    const r = ordenarBacklog([
      tarea('a', 'puede_esperar', '2026-10-27T10:00:00Z'),
      tarea('b', 'urgente', '2026-10-27T12:00:00Z'),
      tarea('c', 'durante_dia', '2026-10-27T09:00:00Z'),
    ])
    expect(r.map(t => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('misma prioridad: la más vieja primero', () => {
    const r = ordenarBacklog([
      tarea('nueva', 'urgente', '2026-10-27T15:00:00Z'),
      tarea('vieja', 'urgente', '2026-10-26T08:00:00Z'),
    ])
    expect(r.map(t => t.id)).toEqual(['vieja', 'nueva'])
  })
})

describe('armarMailBacklog', () => {
  it('asunto con etiqueta de prioridad y título', () => {
    const m = armarMailBacklog({ titulo: 'Revisar rescates', detalle: null, prioridad: 'urgente' })
    expect(m.asunto).toBe('[Backlog Operaciones] 🔴 URGENTE: Revisar rescates')
    expect(m.cuerpo).toContain('Revisar rescates')
    expect(m.cuerpo).toContain('goabl.app/notas')
  })

  it('el detalle entra al cuerpo solo si existe', () => {
    const con = armarMailBacklog({ titulo: 'x', detalle: 'los 3 de ayer', prioridad: 'durante_dia' })
    expect(con.cuerpo).toContain('los 3 de ayer')
    expect(con.asunto).toContain('🟡 Durante el día')
    const sin = armarMailBacklog({ titulo: 'x', detalle: null, prioridad: 'puede_esperar' })
    expect(sin.asunto).toContain('⚪ Puede esperar 1 día')
  })
})

describe('todoDeCompletada', () => {
  it('arma el ToDo para Emiliano con id estable (no se duplica al re-marcar)', () => {
    const t = todoDeCompletada({ id: 'abc-123', titulo: 'Revisar rescates' })
    expect(t).toEqual({ id: 'backlog-abc-123', text: '✅ Yami completó: Revisar rescates', done: false })
  })
})

describe('labelPrioridad', () => {
  it('etiquetas en español', () => {
    expect(labelPrioridad('urgente')).toBe('Urgente')
    expect(labelPrioridad('durante_dia')).toBe('Durante el día')
    expect(labelPrioridad('puede_esperar')).toBe('Puede esperar 1 día')
  })
})
