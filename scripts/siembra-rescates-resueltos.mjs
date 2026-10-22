#!/usr/bin/env node
// SIEMBRA ÚNICA (22/10/2026, regla de Emiliano): al pasar la pestaña Rescates
// a resolución 100% manual, se marcan como ya resueltos SOLO los rescates que
// al momento del cambio estaban Rendidos Y con la orden GOcuotas anulada.
// Todo lo demás (rendidos con orden activa, entregados igual, etc.) queda
// pendiente de gestión para que Yami lo revise. De acá en adelante NADA se
// resuelve solo: lo hace Yami con el botón Resolver.
//
// Uso:
//   node scripts/siembra-rescates-resueltos.mjs           # dry-run (muestra qué marcaría)
//   node scripts/siembra-rescates-resueltos.mjs --write   # escribe resuelto_at en Supabase
//
// Reusa armarRescates/armarRescatesManuales de lib/rescates.ts (Node ≥23.6
// corre TypeScript erasable nativo) para clasificar EXACTAMENTE igual que la
// pestaña.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { armarRescates, armarRescatesManuales } from "../lib/rescates.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");

function loadEnvLocal() {
  const content = fs.readFileSync(path.join(repoRoot, ".env.local"), "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[t.slice(0, i).trim()] = v.replace(/\\n/g, "").replace(/\n/g, "").trim();
  }
  return env;
}

const SELECT_RESCATE_RAW = `
  SELECT so.order_number AS "orderNumber",
         so.customer_name AS "clienteNombre", so.customer_dni AS "clienteDni",
         so.customer_phone AS "clienteTelefono", so.product_name AS producto,
         so.shipping_city AS ciudad, so.shipping_province AS provincia,
         s.tracking_number AS tracking, s.traces,
         go.order_id::text AS "gocuotasOrderId", go.order_status AS "gocuotasStatus",
         go.order_discarded_at::text AS "gocuotasDiscardedAt"
  FROM shipments s
  JOIN store_orders so ON so.id = s.store_order_id
  LEFT JOIN gocuotas_orders go ON go.order_id::text = so.gocuotas_order_id::text`;

async function main() {
  const env = loadEnvLocal();
  const gocelular = new Client({ connectionString: env.GOCELULAR_DB_URL, ssl: { rejectUnauthorized: false } });
  const supabase = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await Promise.all([gocelular.connect(), supabase.connect()]);

  try {
    const segRows = await supabase.query(
      "SELECT tracking, motivo, created_at, resuelto_at FROM rescates_seguimiento"
    );
    const seguimientos = segRows.rows.map((r) => ({
      tracking: r.tracking,
      motivo: r.motivo,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      resueltoAt: r.resuelto_at ? r.resuelto_at.toISOString() : null,
    }));

    const ahora = new Date();
    const autosRaw = await gocelular.query(
      `${SELECT_RESCATE_RAW}
       WHERE s.type = 'outbound'
         AND s.traces @> '[{"evento":"SolicitudDeRescate"}]'`
    );
    const autos = armarRescates(autosRaw.rows, ahora, seguimientos);

    const yaListados = new Set(autos.map((r) => r.tracking).filter(Boolean));
    const faltantes = seguimientos.filter((s) => !yaListados.has(s.tracking)).map((s) => s.tracking);
    let manuales = [];
    if (faltantes.length > 0) {
      const manualesRaw = await gocelular.query(
        `${SELECT_RESCATE_RAW}
         WHERE s.tracking_number = ANY($1)`,
        [faltantes]
      );
      manuales = armarRescatesManuales(manualesRaw.rows, seguimientos, ahora, yaListados);
    }

    const rescates = [...manuales, ...autos];
    const candidatos = rescates.filter(
      (r) => r.estado === "rendido" && r.ordenActiva === false && !r.resueltoAt && r.tracking
    );
    const restantes = rescates.filter((r) => !r.resueltoAt && !candidatos.includes(r));

    console.log(`Rescates totales: ${rescates.length} (autos ${autos.length} + manuales ${manuales.length})`);
    console.log(`A marcar resueltos (rendido + orden anulada): ${candidatos.length}`);
    console.table(candidatos.map((r) => ({
      orden: r.orderNumber, tracking: r.tracking, estado: r.estado,
      orden_gocuotas: r.gocuotasOrderId, status: r.gocuotasStatus, rendido: r.rendidoAt?.slice(0, 10) ?? "",
    })));
    console.log(`Quedan en gestión para Yami: ${restantes.length}`);
    console.table(
      restantes.map((r) => ({
        orden: r.orderNumber, estado: r.estado,
        ordenActiva: r.ordenActiva, tracking: r.tracking ?? "(sin tracking)",
      }))
    );

    if (!WRITE) {
      console.log("\nDry-run: no se escribió nada. Correr con --write para sembrar.");
      return;
    }

    const now = new Date().toISOString();
    for (const r of candidatos) {
      await supabase.query(
        `INSERT INTO rescates_seguimiento (tracking, resuelto_at, updated_at)
         VALUES ($1, $2, $2)
         ON CONFLICT (tracking) DO UPDATE SET resuelto_at = $2, updated_at = $2`,
        [r.tracking, now]
      );
    }
    console.log(`\nSembrados ${candidatos.length} rescates como resueltos (resuelto_at = ${now}).`);
  } finally {
    await Promise.all([gocelular.end(), supabase.end()]);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
