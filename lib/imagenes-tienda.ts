// Procesado de imágenes de producto para la tienda GOcelular.
// Formato estándar del catálogo (relevado de store_product_images, oct 2026):
// PNG 2000×2000 RGBA, fondo transparente, producto centrado ocupando ~85% del lienzo.
// Lógica pura sobre buffers RGBA — el ensamblado con sharp vive en la API route.

export const LIENZO_TIENDA = 2000
export const ESCALA_CONTENIDO = 0.85
export const TOLERANCIA_FONDO = 28

type BufferRGBA = Uint8Array | Uint8ClampedArray | Buffer

/**
 * Quita un fondo sólido por inundación desde los bordes: solo los píxeles
 * conectados al borde y parecidos al color de las esquinas se vuelven
 * transparentes, así un producto blanco no se agujerea. Muta `data`.
 * Devuelve false (sin tocar nada) si la imagen ya tiene esquinas transparentes.
 */
export function quitarFondoSolido(data: BufferRGBA, w: number, h: number, tolerancia = TOLERANCIA_FONDO): boolean {
  const idx = (x: number, y: number) => (y * w + x) * 4
  const esquinas = [idx(0, 0), idx(w - 1, 0), idx(0, h - 1), idx(w - 1, h - 1)]
  if (esquinas.some(i => data[i + 3] <= 10)) return false

  const bg = [0, 1, 2].map(c => Math.round(esquinas.reduce((s, i) => s + data[i + c], 0) / 4))
  const esFondo = (i: number) => {
    const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2]
    return Math.sqrt(dr * dr + dg * dg + db * db) <= tolerancia
  }

  const visto = new Uint8Array(w * h)
  const cola: number[] = []
  for (let x = 0; x < w; x++) cola.push(x, x + (h - 1) * w)
  for (let y = 0; y < h; y++) cola.push(y * w, y * w + w - 1)
  while (cola.length) {
    const p = cola.pop()!
    if (visto[p]) continue
    visto[p] = 1
    const i = p * 4
    if (!esFondo(i)) continue
    data[i + 3] = 0
    const x = p % w, y = (p / w) | 0
    if (x > 0) cola.push(p - 1)
    if (x < w - 1) cola.push(p + 1)
    if (y > 0) cola.push(p - w)
    if (y < h - 1) cola.push(p + w)
  }
  return true
}

/** Rectángulo mínimo que contiene los píxeles con alfa > 10, o null si no hay. */
export function bboxAlfa(data: BufferRGBA, w: number, h: number): { minx: number; miny: number; maxx: number; maxy: number } | null {
  let minx = w, miny = h, maxx = -1, maxy = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 10) {
        if (x < minx) minx = x
        if (x > maxx) maxx = x
        if (y < miny) miny = y
        if (y > maxy) maxy = y
      }
    }
  }
  return maxx < 0 ? null : { minx, miny, maxx, maxy }
}

/** Tamaño y posición del contenido escalado para que su lado mayor ocupe `escala` del lienzo, centrado. */
export function encajeEnLienzo(cw: number, ch: number, lienzo = LIENZO_TIENDA, escala = ESCALA_CONTENIDO): { ancho: number; alto: number; left: number; top: number } {
  const objetivo = Math.round(lienzo * escala)
  const factor = objetivo / Math.max(cw, ch)
  const ancho = Math.max(1, Math.round(cw * factor))
  const alto = Math.max(1, Math.round(ch * factor))
  return { ancho, alto, left: Math.round((lienzo - ancho) / 2), top: Math.round((lienzo - alto) / 2) }
}

/**
 * Califica la resolución del contenido (el producto, ya sin fondo) contra el
 * objetivo de 1700px: estirar poco no se nota, estirar mucho sale borroso en
 * la tienda. 'ok' estira hasta 1,25× (un render de 1500px de otra tienda pasa
 * limpio), 'advertencia' hasta 2×, más que eso se rechaza.
 */
export function evaluarResolucion(cw: number, ch: number): { nivel: 'ok' | 'advertencia' | 'rechazo'; ladoMayor: number } {
  const objetivo = Math.round(LIENZO_TIENDA * ESCALA_CONTENIDO)
  const ladoMayor = Math.max(cw, ch)
  const factor = objetivo / ladoMayor
  const nivel = factor <= 1.25 ? 'ok' : factor <= 2 ? 'advertencia' : 'rechazo'
  return { nivel, ladoMayor }
}

const MARCAS_CONOCIDAS = ['Samsung', 'Motorola', 'Xiaomi', 'Honor', 'Nubia', 'JBL', 'TCL', 'ZTE', 'Redmi'] as const

/**
 * Marca para las píldoras de filtro, detectada en cualquier parte del nombre
 * (compras_productos no tiene columna marca; los accesorios arrancan con el
 * tipo, ej. "Auriculares JBL..."). Redmi/Galaxy sueltos mapean a su marca madre.
 */
export function marcaDeModelo(nombre: string): string {
  const n = nombre.toLowerCase()
  for (const marca of MARCAS_CONOCIDAS) {
    if (n.includes(marca.toLowerCase())) return marca === 'Redmi' ? 'Xiaomi' : marca
  }
  if (n.includes('galaxy')) return 'Samsung'
  if (n.includes('moto ')) return 'Motorola'
  return 'Otras'
}

/** Nombre de archivo prolijo a partir del nombre del modelo. */
export function slugModelo(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
