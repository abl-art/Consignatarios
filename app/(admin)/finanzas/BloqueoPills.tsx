'use client'

// Filtro por solución de bloqueo: Knox = Samsung, Motosafe = Motorola,
// DLC = todas las demás marcas (definición de Emiliano, 17 sep 2026)
export type BloqueoFiltro = 'todas' | 'knox' | 'motosafe' | 'dlc'

const OPCIONES: { id: BloqueoFiltro; label: string; title: string }[] = [
  { id: 'todas', label: 'Todas', title: 'Sin filtro de solución de bloqueo' },
  { id: 'knox', label: 'Knox', title: 'Todos los equipos Samsung' },
  { id: 'motosafe', label: 'Motosafe', title: 'Todos los equipos Motorola' },
  { id: 'dlc', label: 'DLC', title: 'Todas las demás marcas' },
]

export default function BloqueoPills({ bloqueo, onChange }: { bloqueo: BloqueoFiltro; onChange: (b: BloqueoFiltro) => void }) {
  return (
    <div className="flex gap-1">
      {OPCIONES.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          title={o.title}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
            bloqueo === o.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
