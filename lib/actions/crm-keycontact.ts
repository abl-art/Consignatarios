'use server'

import { getKeyContactPool } from '@/lib/db-pool'

const PIPELINE_ID = '6d86ed8c-704b-41f9-adf6-772bb0fe0729'

export type Stage = {
  id: string
  name: string
  slug: string
  order_position: number
  is_closed: boolean
  is_won: boolean
}

export type Deal = {
  id: string
  name: string
  city: string | null
  province: string | null
  locations_count: number
  lead_score: number | null
  updated_at: string
  stage_name: string
  stage_slug: string
  order_position: number
  owner_name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
}

export type StageSummary = Stage & {
  deals_count: number
  entradas: number
  salidas: number
}

export type Owner = {
  id: string
  full_name: string
}

export type PipelineData = {
  stages: StageSummary[]
  deals: Deal[]
  owners: Owner[]
}

export async function fetchPipelineData(desde: string, hasta: string, stageSlug?: string, ownerId?: string): Promise<PipelineData> {
  const pool = getKeyContactPool()
  if (!pool) return { stages: [], deals: [], owners: [] }

  const client = await pool.connect()
  try {
    // 1. Stages
    const stagesRes = await client.query<Stage>(
      `SELECT id, name, slug, order_position, is_closed, is_won
       FROM pipeline_stages
       WHERE pipeline_id = $1 AND is_active = true
       ORDER BY order_position`,
      [PIPELINE_ID]
    )

    // 2. Current deal counts per stage
    const countsRes = await client.query<{ stage_id: string; cnt: string }>(
      `SELECT stage_id, COUNT(*)::text AS cnt
       FROM deals WHERE pipeline_id = $1
       GROUP BY stage_id`,
      [PIPELINE_ID]
    )
    const countMap = new Map(countsRes.rows.map(r => [r.stage_id, parseInt(r.cnt)]))

    // 3. Entradas per stage in period
    const entradasRes = await client.query<{ to_stage_id: string; cnt: string }>(
      `SELECT to_stage_id, COUNT(*)::text AS cnt
       FROM stage_history
       WHERE to_stage_id IN (SELECT id FROM pipeline_stages WHERE pipeline_id = $1)
         AND created_at >= $2::date AND created_at < ($3::date + 1)
       GROUP BY to_stage_id`,
      [PIPELINE_ID, desde, hasta]
    )
    const entradasMap = new Map(entradasRes.rows.map(r => [r.to_stage_id, parseInt(r.cnt)]))

    // 4. Salidas per stage in period
    const salidasRes = await client.query<{ from_stage_id: string; cnt: string }>(
      `SELECT from_stage_id, COUNT(*)::text AS cnt
       FROM stage_history
       WHERE from_stage_id IN (SELECT id FROM pipeline_stages WHERE pipeline_id = $1)
         AND from_stage_id IS NOT NULL
         AND created_at >= $2::date AND created_at < ($3::date + 1)
       GROUP BY from_stage_id`,
      [PIPELINE_ID, desde, hasta]
    )
    const salidasMap = new Map(salidasRes.rows.map(r => [r.from_stage_id, parseInt(r.cnt)]))

    const stages: StageSummary[] = stagesRes.rows.map(s => ({
      ...s,
      deals_count: countMap.get(s.id) ?? 0,
      entradas: entradasMap.get(s.id) ?? 0,
      salidas: salidasMap.get(s.id) ?? 0,
    }))

    // 5. Deals
    let dealsQuery = `
      SELECT d.id, d.name, d.city, d.province, d.locations_count, d.lead_score,
             d.updated_at::text,
             ps.name AS stage_name, ps.slug AS stage_slug, ps.order_position,
             u.full_name AS owner_name,
             c.full_name AS contact_name, c.email AS contact_email, c.phone AS contact_phone
      FROM deals d
      JOIN pipeline_stages ps ON ps.id = d.stage_id
      JOIN users u ON u.id = d.owner_id
      LEFT JOIN deal_contacts dc ON dc.deal_id = d.id AND dc.is_primary
      LEFT JOIN contacts c ON c.id = dc.contact_id AND c.deleted_at IS NULL
      WHERE d.pipeline_id = $1
        AND d.created_at >= $2::date AND d.created_at < ($3::date + 1)`
    const params: (string)[] = [PIPELINE_ID, desde, hasta]

    if (stageSlug && stageSlug !== '') {
      params.push(stageSlug)
      dealsQuery += ` AND ps.slug = $${params.length}`
    }
    if (ownerId && ownerId !== '') {
      params.push(ownerId)
      dealsQuery += ` AND d.owner_id = $${params.length}::uuid`
    }
    dealsQuery += ` ORDER BY d.created_at DESC`

    const dealsRes = await client.query<Deal>(dealsQuery, params)

    // 6. Owners for filter dropdown
    const ownersRes = await client.query<Owner>(
      `SELECT DISTINCT u.id, u.full_name
       FROM deals d JOIN users u ON u.id = d.owner_id
       WHERE d.pipeline_id = $1
       ORDER BY u.full_name`,
      [PIPELINE_ID]
    )

    return { stages, deals: dealsRes.rows, owners: ownersRes.rows }
  } finally {
    client.release()
  }
}

export type ConversionData = {
  stages: { id: string; name: string; slug: string; order_position: number; is_won: boolean; deals_count: number }[]
  transitions: { from_name: string; to_name: string; count: number; from_count: number; rate: number }[]
  total_rate: number
  avg_time_per_stage: { stage_name: string; avg_days: number }[]
  avg_total_days: number
}

export async function fetchConversionData(desde: string, hasta: string): Promise<ConversionData> {
  const pool = getKeyContactPool()
  if (!pool) return { stages: [], transitions: [], total_rate: 0, avg_time_per_stage: [], avg_total_days: 0 }

  const client = await pool.connect()
  try {
    // Stages with deal counts (deals that were in each stage during the period)
    const stagesRes = await client.query<{ id: string; name: string; slug: string; order_position: number; is_won: boolean; deals_count: number }>(
      `SELECT ps.id, ps.name, ps.slug, ps.order_position, ps.is_won,
              COUNT(d.id)::int AS deals_count
       FROM pipeline_stages ps
       LEFT JOIN deals d ON d.stage_id = ps.id AND d.pipeline_id = $1
       WHERE ps.pipeline_id = $1 AND ps.is_active = true
       GROUP BY ps.id, ps.name, ps.slug, ps.order_position, ps.is_won
       ORDER BY ps.order_position`,
      [PIPELINE_ID]
    )

    // Transitions in period
    const transRes = await client.query<{ from_slug: string; from_name: string; to_slug: string; to_name: string; cnt: string }>(
      `SELECT pf.slug AS from_slug, pf.name AS from_name, pt.slug AS to_slug, pt.name AS to_name,
              COUNT(*)::text AS cnt
       FROM stage_history sh
       JOIN pipeline_stages pf ON pf.id = sh.from_stage_id
       JOIN pipeline_stages pt ON pt.id = sh.to_stage_id
       WHERE pt.pipeline_id = $1
         AND sh.from_stage_id IS NOT NULL
         AND sh.created_at >= $2::date AND sh.created_at < ($3::date + 1)
       GROUP BY pf.slug, pf.name, pt.slug, pt.name, pf.order_position
       ORDER BY pf.order_position`,
      [PIPELINE_ID, desde, hasta]
    )

    // Entradas per stage to calculate rates
    const entradasRes = await client.query<{ to_stage_id: string; cnt: string }>(
      `SELECT to_stage_id, COUNT(*)::text AS cnt
       FROM stage_history
       WHERE to_stage_id IN (SELECT id FROM pipeline_stages WHERE pipeline_id = $1)
         AND created_at >= $2::date AND created_at < ($3::date + 1)
       GROUP BY to_stage_id`,
      [PIPELINE_ID, desde, hasta]
    )
    const entradasMap = new Map(entradasRes.rows.map(r => [r.to_stage_id, parseInt(r.cnt)]))

    // Build transitions with rates
    const stageBySlug = new Map(stagesRes.rows.map(s => [s.slug, s]))
    const transitions = transRes.rows.map(t => {
      const fromStage = stageBySlug.get(t.from_slug)
      const fromEntradas = fromStage ? (entradasMap.get(fromStage.id) ?? fromStage.deals_count) : 1
      const count = parseInt(t.cnt)
      return {
        from_name: t.from_name,
        to_name: t.to_name,
        count,
        from_count: fromEntradas,
        rate: fromEntradas > 0 ? (count / fromEntradas) * 100 : 0,
      }
    })

    // Total rate: deals that reached Ganado or Parcialmente Ganado / deals that were Prospecto
    const prospectoStage = stagesRes.rows.find(s => s.slug === 'prospecto')
    const ganadoEntradas = stagesRes.rows
      .filter(s => s.is_won || s.slug === 'parcialmente_ganado')
      .reduce((sum, s) => sum + (entradasMap.get(s.id) ?? 0), 0)
    const prospectoEntradas = prospectoStage ? (entradasMap.get(prospectoStage.id) ?? prospectoStage.deals_count) : 1
    const total_rate = prospectoEntradas > 0 ? (ganadoEntradas / prospectoEntradas) * 100 : 0

    // Average time per stage
    const timeRes = await client.query<{ stage_name: string; avg_days: number }>(
      `SELECT ps.name AS stage_name,
              COALESCE(AVG(
                CASE WHEN sh.time_in_previous_stage_days IS NOT NULL
                  THEN sh.time_in_previous_stage_days
                  ELSE EXTRACT(DAY FROM sh.created_at - LAG(sh.created_at) OVER (PARTITION BY sh.deal_id ORDER BY sh.created_at))::int
                END
              ), 0)::int AS avg_days
       FROM stage_history sh
       JOIN pipeline_stages ps ON ps.id = sh.from_stage_id
       WHERE ps.pipeline_id = $1
         AND sh.from_stage_id IS NOT NULL
         AND sh.created_at >= $2::date AND sh.created_at < ($3::date + 1)
       GROUP BY ps.name, ps.order_position
       ORDER BY ps.order_position`,
      [PIPELINE_ID, desde, hasta]
    )

    // Total average days for deals that reached Ganado/Parcialmente Ganado
    const totalTimeRes = await client.query<{ avg_total: number }>(
      `SELECT COALESCE(AVG(total_days), 0)::int AS avg_total
       FROM (
         SELECT sh.deal_id, SUM(COALESCE(sh.time_in_previous_stage_days, 0)) AS total_days
         FROM stage_history sh
         JOIN pipeline_stages ps ON ps.id = sh.to_stage_id
         WHERE ps.pipeline_id = $1 AND (ps.is_won = true OR ps.slug = 'parcialmente_ganado')
           AND sh.created_at >= $2::date AND sh.created_at < ($3::date + 1)
         GROUP BY sh.deal_id
       ) sub`,
      [PIPELINE_ID, desde, hasta]
    )

    return {
      stages: stagesRes.rows,
      transitions,
      total_rate,
      avg_time_per_stage: timeRes.rows,
      avg_total_days: totalTimeRes.rows[0]?.avg_total ?? 0,
    }
  } finally {
    client.release()
  }
}

export type Meeting = {
  id: string
  scheduled_date: string
  meeting_type: string | null
  executed_at: string | null
  outcome: string | null
  deal_name: string
}

export type MeetingsData = {
  total: number
  meetings: Meeting[]
}

export async function fetchMeetingsData(desde: string, hasta: string): Promise<MeetingsData> {
  const pool = getKeyContactPool()
  if (!pool) return { total: 0, meetings: [] }

  const client = await pool.connect()
  try {
    const res = await client.query<Meeting>(
      `SELECT m.id, m.scheduled_date::text, m.meeting_type, m.executed_at::text, m.outcome,
              d.name AS deal_name
       FROM meetings m
       JOIN deals d ON d.id = m.deal_id
       WHERE d.pipeline_id = $1
         AND m.scheduled_date >= $2::date AND m.scheduled_date < ($3::date + 1)
       ORDER BY m.scheduled_date DESC`,
      [PIPELINE_ID, desde, hasta]
    )

    return { total: res.rows.length, meetings: res.rows }
  } finally {
    client.release()
  }
}
