/**
 * dist/cloudflare_pages/functions/api/telemetry/beacon.js
 * ============================================================================
 * AutoFlow HQ Serverless Telemetry Beacon & Anonymized Error Collector
 * (Cloudflare Pages Functions — Zero Monthly Server Cost)
 *
 * Routes:
 *   POST /api/telemetry/beacon
 *   GET  /api/telemetry/beacon
 * ============================================================================
 */

const EDGE_SANITIZE_PATTERNS = [
  { regex: /01[016789]-?\d{3,4}-?\d{4}/g, replacement: '[MASKED_PHONE]' },
  { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[MASKED_EMAIL]' },
  { regex: /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi, replacement: 'Bearer [MASKED_TOKEN]' }
];

function sanitizeEdgeString(str) {
  if (typeof str !== 'string') return '';
  let out = str;
  for (const { regex, replacement } of EDGE_SANITIZE_PATTERNS) {
    out = out.replace(regex, replacement);
  }
  return out;
}

export async function onRequestGet() {
  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'AutoFlow HQ Serverless Telemetry Beacon',
      pii_masking_enforced: true,
      dynamic_healing_rules_version: '2026.10.25-v3',
      server_time: new Date().toISOString()
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Cache-Control': 'no-store'
      }
    }
  );
}

export async function onRequestPost(context) {
  try {
    const rawBody = await context.request.text();
    let payload = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch (_) {
      return new Response(
        JSON.stringify({ success: false, error: 'INVALID_JSON_PAYLOAD' }),
        { status: 400, headers: { 'Content-Type': 'application/json;charset=UTF-8' } }
      );
    }

    const hwid = sanitizeEdgeString(String(payload.hwid || payload.client_hwid || 'AF-ANONYMOUS-NODE'));
    const traceId = sanitizeEdgeString(String(payload.trace_id || `TRACE-EDGE-${Date.now()}`));
    const errorMessage = sanitizeEdgeString(String(payload.error_message || payload.message || ''));

    // Optional Cloudflare KV persistence if bound in dashboard as AUTOFLOW_TELEMETRY_KV
    if (context.env && context.env.AUTOFLOW_TELEMETRY_KV && typeof context.env.AUTOFLOW_TELEMETRY_KV.put === 'function') {
      await context.env.AUTOFLOW_TELEMETRY_KV.put(
        `trace:${traceId}`,
        JSON.stringify({
          trace_id: traceId,
          hwid,
          error_name: sanitizeEdgeString(String(payload.error_name || 'HeartbeatOrError')),
          error_message: errorMessage,
          received_at: new Date().toISOString()
        }),
        { expirationTtl: 60 * 60 * 24 * 30 }
      );
    }

    return new Response(
      JSON.stringify({
        status: 'ok',
        ack: true,
        trace_id: traceId,
        hwid,
        pii_scrubbed: !/01[016789]-\d{3,4}-\d{4}/.test(errorMessage),
        server_time: new Date().toISOString(),
        commands: []
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Cache-Control': 'no-store'
        }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'BEACON_INTERNAL_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json;charset=UTF-8' } }
    );
  }
}
