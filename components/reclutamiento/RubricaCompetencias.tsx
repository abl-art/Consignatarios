import type { Criterio } from '@/lib/reclutamiento'

// Pestaña "Competencias": la rúbrica de evaluación de la búsqueda, para que
// quien use el apartado entienda qué mide cada competencia y qué significa
// cada puntaje (1 = bajo, 3 = esperado, 5 = excelente).
export default function RubricaCompetencias({ criterios }: { criterios: Criterio[] }) {
  const maxTotal = criterios.length * 5
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto mb-6">
      <div className="px-4 pt-4">
        <h2 className="font-semibold text-gray-900 text-sm">Rúbrica de evaluación</h2>
        <p className="text-xs text-gray-400 mb-3">
          Cada competencia se califica de 1 a 5 combinando CV + entrevista técnica. Puntaje máximo: {maxTotal}.
        </p>
      </div>
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr className="bg-gray-900 text-white text-xs uppercase tracking-wide">
            <th className="text-left px-4 py-3 font-medium">Competencia</th>
            <th className="text-left px-4 py-3 font-medium">1 — Bajo</th>
            <th className="text-left px-4 py-3 font-medium">3 — Esperado</th>
            <th className="text-left px-4 py-3 font-medium">5 — Excelente</th>
          </tr>
        </thead>
        <tbody>
          {criterios.map((c) => (
            <tr key={c.clave} className="border-t border-gray-100 align-top">
              <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                {c.nombre}
                {c.prioritario ? ' *' : ''}
              </td>
              {c.rubrica ? (
                <>
                  <td className="px-4 py-3 text-gray-600">{c.rubrica.bajo}</td>
                  <td className="px-4 py-3 text-gray-600">{c.rubrica.esperado}</td>
                  <td className="px-4 py-3 text-gray-600">{c.rubrica.excelente}</td>
                </>
              ) : (
                <td className="px-4 py-3 text-gray-400 italic" colSpan={3}>
                  Sin rúbrica definida para este criterio
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-400 px-4 py-2 border-t border-gray-100">
        Los análisis de CV y de entrevista anclan los puntajes en estos descriptores; los chips del
        cuadro de la pestaña Entrevista usan estas mismas competencias.
      </p>
    </div>
  )
}
