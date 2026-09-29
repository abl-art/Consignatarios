// Reclutamiento: tipos, criterios default y helpers puros.
// Los criterios v2 (sep 2026) salen del cruce entre las prioridades de Emiliano
// y el perfil de puesto Responsable GOmarket; cada búsqueda puede definir los suyos.

export interface Criterio {
  clave: string
  nombre: string
  prioritario: boolean
}

export const CRITERIOS_DEFAULT: Criterio[] = [
  { clave: 'ejecucion', nombre: 'Ejecución', prioritario: true },
  { clave: 'vision_negocios', nombre: 'Visión de negocios', prioritario: true },
  { clave: 'procesos', nombre: 'Procesos', prioritario: true },
  { clave: 'resolucion_problemas', nombre: 'Resolución de problemas', prioritario: true },
  { clave: 'nativo_digital', nombre: 'Nativo digital', prioritario: true },
  { clave: 'data_driven', nombre: 'Data driven', prioritario: false },
  { clave: 'negociacion', nombre: 'Negociación / comercial', prioritario: false },
  { clave: 'liderazgo', nombre: 'Liderazgo', prioritario: false },
]

export type Assessment = 'pendiente' | 'pasa' | 'no_pasa'

export interface FichaCandidato {
  nombre: string
  arquetipo: string
  etiquetas: string[]
  resumen: string
  scores: Record<string, number>
  favor: string[]
  riesgos: string[]
  preguntas: string
}

export interface AnalisisEntrevista {
  veredicto: string
  intro: string
  bien: string[]
  mal: string[]
  lectura: string
}

export type EstadoEntrevista = 'pendiente' | 'transcribiendo' | 'analizando' | 'listo' | 'error'

// Acepta links de Drive en sus variantes usuales y devuelve el file id, o null.
// https://drive.google.com/file/d/<ID>/view · /open?id=<ID> · uc?id=<ID>
export function extraerDriveFileId(link: string): string | null {
  const limpio = link.trim()
  const porPath = limpio.match(/\/(?:file\/d|document\/d)\/([\w-]{20,})/)
  if (porPath) return porPath[1]
  const porQuery = limpio.match(/[?&]id=([\w-]{20,})/)
  if (porQuery) return porQuery[1]
  if (/^[\w-]{20,}$/.test(limpio)) return limpio
  return null
}

// claude-opus-5 devuelve bloques thinking antes del texto: juntar SOLO los text.
export function textoDeClaude(content: { type: string; text?: string }[]): string {
  const texto = content
    .filter((b) => b.type === 'text')
    .map((b) => b.text || '')
    .join('')
  if (!texto.trim()) throw new Error('Claude devolvió una respuesta vacía')
  return texto
}

// Claude a veces envuelve el JSON en fences aunque se le pida que no.
export function parseJsonDeClaude<T>(texto: string): T {
  const limpio = texto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  return JSON.parse(limpio) as T
}

export function promptFichaCV(criterios: Criterio[], mandato: string | null): string {
  const lista = criterios
    .map((c) => `- "${c.clave}": ${c.nombre}${c.prioritario ? ' (PRIORITARIO)' : ''}`)
    .join('\n')
  return `Sos un reclutador experto senior. Analizá este CV (PDF de LinkedIn) para la búsqueda con este mandato:
${mandato || 'No especificado'}

Puntuá al candidato de 1 a 5 en cada criterio, siendo exigente y basándote SOLO en evidencia del CV (logros concretos y verificables valen más que títulos o autodescripciones):
${lista}

Respondé ÚNICAMENTE con un JSON válido, sin markdown:
{
  "nombre": "<nombre completo>",
  "arquetipo": "<2-4 palabras que resuman el perfil, ej 'Operador e-commerce'>",
  "etiquetas": ["<disponibilidad laboral si se infiere>", "<ubicación>", "<otra relevante>"],
  "resumen": "<2-3 oraciones: quién es y por qué importa para esta búsqueda>",
  "scores": { ${criterios.map((c) => `"${c.clave}": <1-5>`).join(', ')} },
  "favor": ["<3-5 puntos fuertes concretos con evidencia>"],
  "riesgos": ["<3-5 riesgos o cosas a validar, incluyendo banderas del CV como logros sin números, inconsistencias o duplicados>"],
  "preguntas": "<2-4 preguntas clave para la entrevista, separadas por ' · '>"
}`
}

export function promptAnalisisEntrevista(
  criterios: Criterio[],
  mandato: string | null,
  ficha: { nombre: string; resumen: string | null; scores: Record<string, number> },
  transcript: string
): string {
  return `Sos un reclutador experto senior. Analizá esta transcripción de entrevista técnica (caso práctico) para la búsqueda con mandato:
${mandato || 'No especificado'}

Candidato: ${ficha.nombre}. Contexto del CV: ${ficha.resumen || 's/d'}. Puntajes actuales (1-5): ${JSON.stringify(ficha.scores)}.

La transcripción es automática y tiene errores fonéticos — juzgá el hilo argumental, no la literalidad. Evaluá: ¿decide o solo diagnostica? ¿cuantifica impactos? ¿integra restricciones (caja, stock, riesgo)? ¿pide datos? ¿qué evidencia da en los criterios prioritarios (${criterios.filter((c) => c.prioritario).map((c) => c.nombre).join(', ')})?

TRANSCRIPCIÓN:
${transcript}

Respondé ÚNICAMENTE con un JSON válido, sin markdown:
{
  "veredicto": "<5-8 palabras, ej 'diagnóstico fuerte, decisión floja'>",
  "intro": "<1-2 oraciones: formato de la entrevista y qué se evaluó>",
  "bien": ["<4-7 puntos: qué mostró bien, con citas o momentos concretos>"],
  "mal": ["<3-5 puntos: qué quedó flojo, con evidencia>"],
  "lectura": "<3-5 oraciones: tu lectura de reclutador — cómo cambia (o confirma) lo que decía el CV, y qué define su avance>",
  "scores_sugeridos": { "<clave_criterio>": <1-5 SOLO para los criterios donde la entrevista justifica cambiar el puntaje actual> }
}`
}

export function promptRecomendacion(
  criterios: Criterio[],
  mandato: string | null,
  candidatos: {
    nombre: string
    arquetipo: string | null
    scores: Record<string, number>
    resumen: string | null
    assessment: string
    entrevistas: { veredicto?: string; lectura?: string }[]
  }[]
): string {
  return `Sos un reclutador experto senior asesorando al dueño de la empresa. Búsqueda con mandato:
${mandato || 'No especificado'}

Criterios (los marcados * son prioritarios para el dueño): ${criterios.map((c) => c.nombre + (c.prioritario ? '*' : '')).join(', ')}.

Candidatos (puntajes 1-5 por criterio, y análisis de entrevistas si las hay):
${JSON.stringify(candidatos, null, 1)}

Escribí una recomendación final en markdown (español rioplatense, directo, sin diplomacia vacía): ranking con justificación por candidato anclada en los criterios prioritarios, el desempate concreto entre los primeros, qué testear en la próxima etapa (assessment) para cada finalista, y qué candidatos sirven para OTROS roles de la empresa aunque no para este. Máximo 350 palabras. No uses tablas.`
}
