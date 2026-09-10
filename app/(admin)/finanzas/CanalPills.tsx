'use client'

export type Canal = 'total' | 'propia' | 'terceros'

const OPCIONES: { id: Canal; label: string }[] = [
  { id: 'total', label: 'Total' },
  { id: 'propia', label: 'Venta Propia' },
  { id: 'terceros', label: 'Venta de Terceros' },
]

export default function CanalPills({ canal, onChange }: { canal: Canal; onChange: (c: Canal) => void }) {
  return (
    <div className="flex gap-1">
      {OPCIONES.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
            canal === o.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
