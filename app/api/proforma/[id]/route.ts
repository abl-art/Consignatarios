import { NextResponse } from 'next/server'
import { getProformaConItems } from '@/lib/actions/proformas'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const proforma = await getProformaConItems(id)
  if (!proforma) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  return NextResponse.json(proforma)
}
