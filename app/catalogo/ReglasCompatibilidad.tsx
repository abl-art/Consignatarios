// Reglas generales de compatibilidad por marca, con ejemplos sí/no.
// Fuente: condiciones del proveedor del sistema de bloqueo (oct 2026):
// - Samsung Knox Guard: Android 12 nativo en adelante, fabricado para región Américas.
// - Motorola Motosafe 3.0: familia 6 en adelante (lanzada desde 2025).
// - Xiaomi: línea 15 en adelante (desde ago 2025); la línea 14 ya está habilitada y en uso.
// - Nubia: solo los modelos habilitados expresamente por GOcelular.

interface ReglaMarca {
  marca: string
  solucion: string
  headerClass: string
  regla: string
  detalle: string[]
  si: string[]
  no: string[]
}

const REGLAS: ReglaMarca[] = [
  {
    marca: 'Samsung',
    solucion: 'Knox Guard',
    headerClass: 'bg-blue-700',
    regla: 'Equipos que vinieron de fábrica con Android 12 o superior y fueron fabricados para la región Américas.',
    detalle: [
      'En la práctica: modelos lanzados en 2022 o después.',
      'El número de modelo (Ajustes → Acerca del teléfono) tiene que terminar en M, por ejemplo SM-A165M. Los importados de otras regiones (terminan en otra letra) pueden no funcionar.',
    ],
    si: ['Galaxy A07', 'Galaxy A16', 'Galaxy A17', 'Galaxy A26', 'Galaxy A36', 'Galaxy A56', 'Galaxy A13 o más nuevo'],
    no: ['Galaxy A12', 'Galaxy A03s', 'Galaxy S21', 'Cualquiera lanzado antes de 2022', 'Importados de Europa o Asia'],
  },
  {
    marca: 'Motorola',
    solucion: 'Motosafe 3.0',
    headerClass: 'bg-sky-700',
    regla: 'Familia 6 en adelante (lanzadas desde 2025). Traen Motosafe 3.0; las familias anteriores usan Motosafe 2.0 y NO sirven.',
    detalle: [
      'La familia es el último número del modelo: G06, G56, G86 son familia 6; G17, G47, G67, G77 son familia 7.',
      'En los Edge, vale desde el Edge 60 en adelante.',
    ],
    si: ['Moto G06', 'Moto G17', 'Moto G47', 'Moto G56', 'Moto G67', 'Moto G77', 'Moto G86', 'Edge 60', 'Edge 70'],
    no: ['Moto G05', 'Moto G15', 'Moto G75', 'Moto G24 / G34 / G84', 'Edge 50', 'Toda familia 5 o anterior'],
  },
  {
    marca: 'Xiaomi',
    solucion: 'Bloqueo Xiaomi',
    headerClass: 'bg-orange-600',
    regla: 'Línea 15 en adelante (a la venta desde agosto 2025) — y la línea 14, que ya está habilitada y funcionando.',
    detalle: [
      'El número de línea va en el nombre: Redmi 15, Redmi 15C, Redmi Note 15, Note 15 Pro… y todo lo que venga después.',
      'La línea 14 (Redmi 14C, Note 14, Note 14 Pro) también está habilitada.',
    ],
    si: ['Redmi 15', 'Redmi 15C', 'Redmi Note 15', 'Redmi Note 15 Pro', 'Redmi 14C', 'Redmi Note 14'],
    no: ['Redmi A5', 'Redmi 13 / 13C', 'Redmi Note 13', 'POCO y líneas viejas', 'Toda línea 13 o anterior'],
  },
  {
    marca: 'Nubia',
    solucion: 'Habilitación por modelo',
    headerClass: 'bg-purple-700',
    regla: 'Solo los modelos habilitados expresamente por GOcelular. Hoy es uno solo: Nubia Music 2.',
    detalle: [
      'Con Nubia no hay regla general: cada modelo se habilita a mano. Si no está en esta lista, no se puede vender, aunque parezca nuevo.',
    ],
    si: ['Nubia Music 2'],
    no: ['Nubia Neo 3GT', 'Nubia Neo 3 5G', 'Cualquier otro Nubia / ZTE'],
  },
]

function Chip({ texto, ok }: { texto: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
        ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
      }`}
    >
      {ok ? '✓' : '✗'} {texto}
    </span>
  )
}

export default function ReglasCompatibilidad() {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {REGLAS.map(r => (
        <div key={r.marca} className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
          <div className={`${r.headerClass} px-5 py-3 flex items-baseline justify-between gap-2`}>
            <h2 className="text-white font-bold text-lg">{r.marca}</h2>
            <span className="text-white/80 text-xs font-medium">{r.solucion}</span>
          </div>
          <div className="p-5 flex flex-col gap-3 grow">
            <p className="text-sm font-semibold text-gray-900">{r.regla}</p>
            <ul className="text-xs text-gray-600 space-y-1 list-disc pl-4">
              {r.detalle.map(d => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <div className="mt-auto space-y-2 pt-2">
              <div className="flex flex-wrap gap-1.5">
                {r.si.map(e => (
                  <Chip key={e} texto={e} ok />
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.no.map(e => (
                  <Chip key={e} texto={e} ok={false} />
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
