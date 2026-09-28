// Umbral de incobrabilidad por mora, en días desde el vencimiento de la
// cuota. Definido por Emiliano: cuota impaga con esta mora (o más) se
// castiga como incobrable en Finanzas, Vintage, el simulador y la tarjeta
// del Dashboard 360. Historia: 120 días hasta el 28-sep-2026, 90 desde
// entonces. Los buckets de RECUPERO del vintage (cobradas tarde) conservan
// su granularidad propia y no dependen de este umbral.
export const DIAS_INCOBRABLE = 90
