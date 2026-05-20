// ─── Client IDs centralizados ─────────────────────────────────────────────
// Cuando se agrega un nuevo client, solo hay que modificar este archivo.
// Propios = venta directa de GOcelular. Terceros = merchants externos.

export const CLIENT_IDS_PROPIOS = ['2026134', '2461631']

export const CLIENT_IDS_TERCEROS = ['1', '5495277', '6033574', '6115009']

// Todos los client IDs (propios + terceros) — para queries que necesitan el universo completo
export const CLIENT_IDS_TODOS = [...CLIENT_IDS_PROPIOS, ...CLIENT_IDS_TERCEROS]

// Helper para usar en queries SQL con IN (...)
export const SQL_IDS_TODOS = CLIENT_IDS_TODOS.map(id => `'${id}'`).join(', ')
export const SQL_IDS_PROPIOS = CLIENT_IDS_PROPIOS.map(id => `'${id}'`).join(', ')
export const SQL_IDS_TERCEROS = CLIENT_IDS_TERCEROS.map(id => `'${id}'`).join(', ')

// Client IDs terceros como números (para query a GOcuotas directa)
export const CLIENT_IDS_TERCEROS_NUM = CLIENT_IDS_TERCEROS.map(Number).filter(n => n > 1)
