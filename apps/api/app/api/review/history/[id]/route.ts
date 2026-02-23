import { getReviewById } from '@lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }
  const row = getReviewById(numId);
  if (!row) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    return Response.json({
      ...row,
      specialistOutputs: JSON.parse(row.specialistOutputs),
      disputeOutcomes: JSON.parse(row.disputeOutcomes),
      verdict: JSON.parse(row.verdict),
    });
  } catch {
    return Response.json({ error: 'Review record is corrupt' }, { status: 500 });
  }
}
