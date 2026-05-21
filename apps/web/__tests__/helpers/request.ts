/**
 * Request helpers for invoking App Router route handlers directly.
 *
 * Next.js App Router route handlers are plain `(req: NextRequest) => Response`
 * functions. We don't need a server — just construct a NextRequest and call the
 * handler.
 *
 * Why NextRequest specifically: `req.nextUrl` is used by the verify endpoint.
 * Plain Request doesn't expose `nextUrl`.
 */

import { NextRequest } from 'next/server';

export interface JsonRequestInit {
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

/**
 * Build a POST NextRequest with a JSON body. Pass `body: undefined` for no
 * body, or `body: 'not json'` (a string) to simulate invalid JSON.
 */
export function jsonRequest(init: JsonRequestInit = {}): NextRequest {
  const url = init.url ?? 'http://localhost:3000/';
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init.headers ?? {}),
  };
  let body: BodyInit | undefined;
  if (init.body === undefined) {
    body = undefined;
  } else if (typeof init.body === 'string') {
    body = init.body;
  } else {
    body = JSON.stringify(init.body);
  }
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body,
  });
}

export interface GetRequestInit {
  url: string;
  headers?: Record<string, string>;
}

/**
 * Build a GET NextRequest with the supplied URL (query string baked in).
 */
export function getRequest(init: GetRequestInit): NextRequest {
  return new NextRequest(init.url, {
    method: 'GET',
    headers: { ...(init.headers ?? {}) },
  });
}

/**
 * Build a NextRequest carrying an Authorization: Bearer header.
 */
export function bearerRequest(
  url: string,
  token: string | undefined,
  scheme: string = 'Bearer',
): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== undefined) {
    headers.authorization = `${scheme} ${token}`;
  }
  return new NextRequest(url, { method: 'GET', headers });
}

/**
 * Build a NextRequest with NO Authorization header.
 */
export function unauthedRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}
