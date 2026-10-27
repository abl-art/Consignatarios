// Backlog Operaciones: TODOs de Emiliano para Yamila con tres prioridades.
// Lógica pura — el mail y la DB viven en lib/actions/backlog-operaciones.ts.

export type PrioridadBacklog = 'urgente' | 'durante_dia' | 'puede_esperar'

export interface TareaBacklog {
  id: string
  titulo: string
  detalle: string | null
  prioridad: PrioridadBacklog
  creadoAt: string
  realizadoAt: string | null
  mailEnviadoAt: string | null
}

export const PRIORIDADES: { id: PrioridadBacklog; label: string; orden: number }[] = [
  { id: 'urgente', label: 'Urgente', orden: 0 },
  { id: 'durante_dia', label: 'Durante el día', orden: 1 },
  { id: 'puede_esperar', label: 'Puede esperar 1 día', orden: 2 },
]

export function labelPrioridad(p: PrioridadBacklog): string {
  return PRIORIDADES.find(x => x.id === p)?.label ?? p
}

/** Pendientes primero por prioridad (urgente arriba) y dentro por antigüedad (la más vieja primero). */
export function ordenarBacklog(tareas: TareaBacklog[]): TareaBacklog[] {
  const orden = new Map(PRIORIDADES.map(p => [p.id, p.orden]))
  return [...tareas].sort((a, b) => {
    const pa = orden.get(a.prioridad) ?? 9
    const pb = orden.get(b.prioridad) ?? 9
    if (pa !== pb) return pa - pb
    return a.creadoAt.localeCompare(b.creadoAt)
  })
}

/** Asunto y cuerpo del mail que recibe Yamila al cargarse una tarea. */
export function armarMailBacklog(t: { titulo: string; detalle: string | null; prioridad: PrioridadBacklog }): { asunto: string; cuerpo: string } {
  const etiqueta = t.prioridad === 'urgente' ? '🔴 URGENTE' : t.prioridad === 'durante_dia' ? '🟡 Durante el día' : '⚪ Puede esperar 1 día'
  return {
    asunto: `[Backlog Operaciones] ${etiqueta}: ${t.titulo}`,
    cuerpo: [
      `Hola Yami,`,
      ``,
      `Tenés una tarea nueva en el Backlog de Operaciones:`,
      ``,
      `Prioridad: ${etiqueta}`,
      `Tarea: ${t.titulo}`,
      ...(t.detalle ? [``, t.detalle] : []),
      ``,
      `Cuando la termines, marcala como realizada acá:`,
      `https://goabl.app/notas (pestaña Backlog Operaciones)`,
    ].join('\n'),
  }
}

/** El ToDo que se le carga a Emiliano (app_todos) cuando Yami completa una tarea. */
export function todoDeCompletada(t: { id: string; titulo: string }): { id: string; text: string; done: boolean } {
  return { id: `backlog-${t.id}`, text: `✅ Yami completó: ${t.titulo}`, done: false }
}
