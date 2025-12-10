/**
 * Vitamix Recommender Worker
 *
 * Main entry point for the Cloudflare Worker that powers the
 * AI-driven Vitamix Blender Recommender.
 *
 * Endpoints:
 * - GET /generate?query=...&slug=...&ctx=... - Stream page generation via SSE
 * - GET /health - Health check
 */

import type { Env, SessionContext, SSEEvent } from './types';
import { orchestrate } from './lib/orchestrator';

// ============================================
// CORS Headers
// ============================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ============================================
// SSE Stream Handler
// ============================================

function createSSEStream(): {
  readable: ReadableStream;
  write: (event: SSEEvent) => void;
  close: () => void;
} {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const readable = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      // Client disconnected
    },
  });

  return {
    readable,
    write: (event: SSEEvent) => {
      const data = JSON.stringify(event.data);
      const message = `event: ${event.event}\ndata: ${data}\n\n`;
      controller.enqueue(encoder.encode(message));
    },
    close: () => {
      controller.close();
    },
  };
}

// ============================================
// Request Handlers
// ============================================

async function handleGenerate(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get('query');
  const slug = url.searchParams.get('slug');
  const ctxParam = url.searchParams.get('ctx');
  const preset = url.searchParams.get('preset') || undefined; // Optional preset override (e.g., 'all-cerebras')

  if (!query) {
    return new Response(JSON.stringify({ error: 'Missing query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // Parse session context if provided
  let sessionContext: SessionContext | undefined;
  if (ctxParam) {
    try {
      sessionContext = JSON.parse(ctxParam);
    } catch (e) {
      console.error('Failed to parse session context:', e);
    }
  }

  // Create SSE stream
  const { readable, write, close } = createSSEStream();

  // Start orchestration in background
  const orchestrationPromise = orchestrate(
    query,
    slug || generateSlug(query),
    env,
    write,
    sessionContext,
    preset
  )
    .catch((error) => {
      console.error('Orchestration error:', error);
      write({
        event: 'error',
        data: { message: error.message || 'Generation failed' },
      });
    })
    .finally(() => {
      close();
    });

  // Return SSE response immediately
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...CORS_HEADERS,
    },
  });
}

function handleHealth(): Response {
  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'vitamix-recommender',
      timestamp: new Date().toISOString(),
    }),
    {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    }
  );
}

function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

// ============================================
// Utility Functions
// ============================================

function generateSlug(query: string): string {
  let slug = query
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);

  const hash = Math.abs(
    query.split('').reduce((acc, char) => {
      const code = char.charCodeAt(0);
      return ((acc << 5) - acc) + code;
    }, 0)
  )
    .toString(36)
    .slice(0, 6);

  return `${slug}-${hash}`;
}

// ============================================
// Main Handler
// ============================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions();
    }

    // Route requests
    switch (path) {
      case '/generate':
        return handleGenerate(request, env);
      case '/health':
        return handleHealth();
      default:
        return new Response('Not Found', { status: 404 });
    }
  },
};
