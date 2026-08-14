import { NextRequest, NextResponse } from 'next/server';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'transfer-encoding',
]);

function apiBaseUrl(): string {
  return (process.env.API_INTERNAL_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  const { path } = await context.params;
  const target = `${apiBaseUrl()}/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
      cache: 'no-store',
      redirect: 'manual',
    });
    const responseHeaders = new Headers(response.headers);
    for (const header of HOP_BY_HOP_HEADERS) responseHeaders.delete(header);
    return new NextResponse(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return NextResponse.json({ success: false, error: { code: 'API_UNAVAILABLE', message: 'The NotifyKIT API is unavailable. Please try again shortly.' } }, { status: 502 });
  }
}

export const dynamic = 'force-dynamic';
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
