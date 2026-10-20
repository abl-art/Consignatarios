import { describe, expect, it } from 'vitest'
import { promptAnalisisEntrevista, promptFichaCV, type Criterio } from '@/lib/reclutamiento'

// Rúbrica de evaluación (Emiliano, 20/10): cada criterio puede traer los
// descriptores de nivel 1/3/5 y los prompts deben anclar el puntaje en ellos.
const CON_RUBRICA: Criterio[] = [
  {
    clave: 'vision_integral',
    nombre: 'Visión integral',
    prioritario: false,
    rubrica: {
      bajo: 'Analiza una dimensión aislada.',
      esperado: 'Relaciona varias variables relevantes.',
      excelente: 'Integra crecimiento, stock, economics, caja, riesgo y operación.',
    },
  },
  { clave: 'priorizacion', nombre: 'Priorización', prioritario: false },
]

describe('prompts de reclutamiento con rúbrica', () => {
  it('promptFichaCV incluye los descriptores 1/3/5 cuando el criterio los trae', () => {
    const p = promptFichaCV(CON_RUBRICA, 'mandato X')
    expect(p).toContain('Analiza una dimensión aislada.')
    expect(p).toContain('Relaciona varias variables relevantes.')
    expect(p).toContain('Integra crecimiento, stock, economics, caja, riesgo y operación.')
    // el criterio sin rúbrica sigue apareciendo por nombre
    expect(p).toContain('Priorización')
  })

  it('promptAnalisisEntrevista incluye los descriptores cuando el criterio los trae', () => {
    const p = promptAnalisisEntrevista(
      CON_RUBRICA,
      'mandato X',
      { nombre: 'Ana', resumen: null, scores: {} },
      'transcript...'
    )
    expect(p).toContain('Integra crecimiento, stock, economics, caja, riesgo y operación.')
    expect(p).toContain('Analiza una dimensión aislada.')
  })

  it('promptAnalisisEntrevista pide el cuadro qa de preguntas y respuestas resumidas', () => {
    const p = promptAnalisisEntrevista(
      CON_RUBRICA,
      'mandato X',
      { nombre: 'Ana', resumen: null, scores: {} },
      'transcript...'
    )
    expect(p).toContain('"qa"')
    expect(p).toContain('pregunta')
    expect(p).toContain('respuesta')
  })
})
