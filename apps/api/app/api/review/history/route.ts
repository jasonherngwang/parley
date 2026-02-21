import { getReviewList } from '@lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const rows = getReviewList(20, isNaN(offset) ? 0 : offset);
  return Response.json(rows);
}
