import { normalisePinterestResponse, type PinterestStatus } from '@/lib/pinterest';

export async function GET(request: Request) {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  if (!token) return Response.json({status:'not_configured',images:[]});
  const url = new URL(request.url);
  const query = url.searchParams.get('query')?.trim();
  if (!query) return Response.json({status:'configured',images:[]});
  if (query.length > 240) return Response.json({status:'unavailable',images:[],message:'Search phrase is too long.'},{status:400});
  const params = new URLSearchParams({term:query,country_code:'SG',limit:'10'});
  const bookmark = url.searchParams.get('bookmark');
  if (bookmark && bookmark.length < 1000) params.set('bookmark',bookmark);
  try {
    // Partner search needs an approved Pinterest app, not just an ordinary account token.
    const response = await fetch(`https://api.pinterest.com/v5/search/partner/pins?${params}`, {
      headers:{Authorization:`Bearer ${token}`}, signal:AbortSignal.timeout(8000), next:{revalidate:3600},
    });
    if (!response.ok) {
      const status: PinterestStatus = response.status === 401 || response.status === 403 ? 'access_required' : response.status === 429 ? 'rate_limited' : 'unavailable';
      return Response.json({status,images:[]});
    }
    const data = await response.json();
    return Response.json({status:'connected',images:normalisePinterestResponse(data),bookmark:typeof data.bookmark === 'string' ? data.bookmark : undefined});
  } catch { return Response.json({status:'unavailable',images:[]}); }
}
