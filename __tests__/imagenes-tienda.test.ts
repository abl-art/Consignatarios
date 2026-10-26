import { describe, it, expect } from 'vitest'
import { quitarFondoSolido, bboxAlfa, encajeEnLienzo, slugModelo, evaluarResolucion } from '@/lib/imagenes-tienda'

// Arma un buffer RGBA desde una grilla de caracteres: 'B' blanco opaco, 'N' negro opaco,
// 'R' rojo opaco, '.' transparente
function grilla(filas: string[]): { data: Uint8ClampedArray; w: number; h: number } {
  const h = filas.length
  const w = filas[0].length
  const data = new Uint8ClampedArray(w * h * 4)
  const colores: Record<string, number[]> = {
    B: [255, 255, 255, 255],
    N: [0, 0, 0, 255],
    R: [255, 0, 0, 255],
    '.': [0, 0, 0, 0],
  }
  filas.forEach((fila, y) => {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = colores[fila[x]]
      const i = (y * w + x) * 4
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a
    }
  })
  return { data, w, h }
}

const alfa = (g: { data: Uint8ClampedArray; w: number }, x: number, y: number) => g.data[(y * g.w + x) * 4 + 3]

describe('quitarFondoSolido', () => {
  it('vuelve transparente el fondo conectado al borde pero no el blanco encerrado', () => {
    const g = grilla([
      'BBBBB',
      'BNNNB',
      'BNBNB', // el B del centro está encerrado por N: es parte del producto
      'BNNNB',
      'BBBBB',
    ])
    const removido = quitarFondoSolido(g.data, g.w, g.h, 28)
    expect(removido).toBe(true)
    expect(alfa(g, 0, 0)).toBe(0)
    expect(alfa(g, 4, 4)).toBe(0)
    expect(alfa(g, 2, 2)).toBe(255) // blanco interior intacto
    expect(alfa(g, 1, 1)).toBe(255) // producto negro intacto
  })

  it('no toca píxeles distintos al color de fondo aunque toquen el borde', () => {
    const g = grilla([
      'BBB',
      'RNB',
      'BBB',
    ])
    quitarFondoSolido(g.data, g.w, g.h, 28)
    expect(alfa(g, 0, 1)).toBe(255) // rojo en el borde: no es fondo
    expect(alfa(g, 1, 1)).toBe(255)
    expect(alfa(g, 2, 1)).toBe(0)
  })

  it('con esquinas ya transparentes no hace nada y devuelve false', () => {
    const g = grilla([
      '...',
      '.N.',
      '...',
    ])
    const copia = Uint8ClampedArray.from(g.data)
    expect(quitarFondoSolido(g.data, g.w, g.h, 28)).toBe(false)
    expect(g.data).toEqual(copia)
  })

  it('respeta la tolerancia: un gris cercano al blanco cae, uno lejano queda', () => {
    const g = grilla(['BBB', 'BNB', 'BBB'])
    // gris 240 (dist 26 ≤ 28) en el borde superior y gris 200 (dist 95) en el inferior
    for (const [x, y, v] of [[1, 0, 240], [1, 2, 200]] as const) {
      const i = (y * 3 + x) * 4
      g.data[i] = v; g.data[i + 1] = v; g.data[i + 2] = v
    }
    quitarFondoSolido(g.data, g.w, g.h, 28)
    expect(alfa(g, 1, 0)).toBe(0)
    expect(alfa(g, 1, 2)).toBe(255)
  })
})

describe('bboxAlfa', () => {
  it('encuentra el rectángulo del contenido opaco', () => {
    const g = grilla([
      '.....',
      '.NN..',
      '.NN..',
      '.....',
    ])
    expect(bboxAlfa(g.data, g.w, g.h)).toEqual({ minx: 1, miny: 1, maxx: 2, maxy: 2 })
  })

  it('devuelve null si todo es transparente', () => {
    const g = grilla(['..', '..'])
    expect(bboxAlfa(g.data, g.w, g.h)).toBeNull()
  })
})

describe('encajeEnLienzo', () => {
  it('escala el lado mayor al 85% del lienzo y centra', () => {
    const e = encajeEnLienzo(1000, 500, 2000, 0.85)
    expect(e.ancho).toBe(1700)
    expect(e.alto).toBe(850)
    expect(e.left).toBe(150)
    expect(e.top).toBe(575)
  })

  it('contenido vertical escala por alto', () => {
    const e = encajeEnLienzo(500, 1000, 2000, 0.85)
    expect(e.alto).toBe(1700)
    expect(e.ancho).toBe(850)
  })

  it('contenido chico se agranda hasta el objetivo', () => {
    const e = encajeEnLienzo(100, 100, 2000, 0.85)
    expect(e.ancho).toBe(1700)
    expect(e.alto).toBe(1700)
  })
})

describe('slugModelo', () => {
  it('pasa a minúsculas con guiones y sin símbolos', () => {
    expect(slugModelo('Motorola Moto G17 256GB')).toBe('motorola-moto-g17-256gb')
    expect(slugModelo('Galaxy Tab A11+ 128/6GB')).toBe('galaxy-tab-a11-128-6gb')
  })

  it('quita acentos y colapsa separadores', () => {
    expect(slugModelo('Pulsera  inteligente — Xiaomi 9 Activé')).toBe('pulsera-inteligente-xiaomi-9-active')
  })
})

describe('evaluarResolucion', () => {
  it('fuente grande pasa sin aviso (solo achica o estira hasta 1.25x)', () => {
    expect(evaluarResolucion(2200, 1800).nivel).toBe('ok')
    expect(evaluarResolucion(1700, 900).nivel).toBe('ok')
    expect(evaluarResolucion(1500, 1000).nivel).toBe('ok') // render típico de otra tienda, estira 1.13x
    expect(evaluarResolucion(1360, 1000).nivel).toBe('ok') // justo en el límite 1.25x
  })

  it('fuente mediana procesa con advertencia (estira entre 1.25x y 2x)', () => {
    expect(evaluarResolucion(1359, 800).nivel).toBe('advertencia')
    const r = evaluarResolucion(1000, 800)
    expect(r.nivel).toBe('advertencia')
    expect(r.ladoMayor).toBe(1000)
  })

  it('fuente chica se rechaza (estiraría más de 2x)', () => {
    const r = evaluarResolucion(600, 849)
    expect(r.nivel).toBe('rechazo')
    expect(r.ladoMayor).toBe(849)
  })

  it('el umbral del rechazo: 850 es advertencia, 849 rechazo', () => {
    expect(evaluarResolucion(850, 500).nivel).toBe('advertencia')
    expect(evaluarResolucion(849, 500).nivel).toBe('rechazo')
  })
})
