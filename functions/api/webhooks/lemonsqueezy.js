/**
 * dist/cloudflare_pages/functions/api/webhooks/lemonsqueezy.js
 * ============================================================================
 * AutoFlow HQ Serverless Lemon Squeezy Webhook & Signed Ticket Issuer
 * (Cloudflare Pages Functions — Web Crypto HMAC-SHA256 Verification)
 *
 * Route:
 *   POST /api/webhooks/lemonsqueezy
 *
 * Capabilities:
 *   1. Verifies Lemon Squeezy `X-Signature` header via HMAC-SHA256 (`LEMON_SQUEEZY_WEBHOOK_SECRET`).
 *   2. Extracts custom checkout metadata (`hwid`, `engine`, `mode`, `days`, `sku`).
 *   3. Mints a cryptographically signed `AF-TKT-v1.<payload>.<sig>` module ticket
 *      100% compatible with `core/license_manager.js` (`previewModuleTicketUnlock` & `activateModuleTicket`).
 * ============================================================================
 */

const DEFAULT_TICKET_HMAC_SECRET = 'AF-ENTERPRISE-MODULAR-TICKET-HMAC-2026';

const ENGINE_BITMASK_MAP = {
  ENGINE_HEAL: 275,     // MOD_A1_LOCAL_HEALER | MOD_A2_HQ_FINETUNE_BOT | MOD_D_COMPLIANCE_PII | MOD_H_DRIFTFLOW_RADAR
  ENGINE_RECON: 66060,  // MOD_B_RECON_ENGINE | MOD_C_PACE_DEDUP | MOD_D_COMPLIANCE_PII | MOD_I_PROFITFLOW_GUARD | MOD_P_MARKETPLACE_FEE_OVERCHARGE_GUARD
  ENGINE_DUAL: 262143   // All 18 enterprise defense modules unlocked
};

const OFFICIAL_ENGINE_PRICES_KRW = {
  managed: {
    ENGINE_HEAL: { 30: 39000, 90: 99000, 365: 329000 },
    ENGINE_RECON: { 30: 49000, 90: 125000, 365: 409000 },
    ENGINE_DUAL: { 30: 69000, 90: 175000, 365: 579000 }
  },
  mcp: {
    ENGINE_HEAL: { 30: 29000, 90: 75000, 365: 249000 },
    ENGINE_RECON: { 30: 39000, 90: 99000, 365: 329000 },
    ENGINE_DUAL: { 30: 49000, 90: 125000, 365: 409000 }
  }
};

function toBase64Url(uint8Array) {
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function stringToBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  return toBase64Url(bytes);
}

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function verifyLemonWebhookSignature(rawBody, signatureHex, secret) {
  if (!secret || !signatureHex) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const macBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const calculatedHex = Array.from(new Uint8Array(macBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return timingSafeEqualStr(calculatedHex, signatureHex.trim().toLowerCase());
}

export async function issueEdgeSignedModuleTicket({
  engine = 'ENGINE_DUAL',
  mode = 'managed',
  validDays = 30,
  hwid = 'AF-GLOBAL-BUYER',
  orderId = '',
  ticketSecret = DEFAULT_TICKET_HMAC_SECRET
}) {
  const normEngine = ['ENGINE_HEAL', 'ENGINE_RECON', 'ENGINE_DUAL'].includes(engine) ? engine : 'ENGINE_DUAL';
  const normMode = mode === 'mcp' ? 'mcp' : 'managed';
  const normDays = [30, 90, 365].includes(Number(validDays)) ? Number(validDays) : 30;
  const bitmask = ENGINE_BITMASK_MAP[normEngine] || ENGINE_BITMASK_MAP.ENGINE_DUAL;
  const paidAmountKrw =
    (OFFICIAL_ENGINE_PRICES_KRW[normMode] &&
      OFFICIAL_ENGINE_PRICES_KRW[normMode][normEngine] &&
      OFFICIAL_ENGINE_PRICES_KRW[normMode][normEngine][normDays]) ||
    69000;

  const ticketId = `TKT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + normDays * 24 * 60 * 60 * 1000).toISOString();

  const tokenPayload = {
    v: 1,
    ticketId,
    bitmask,
    validDays: normDays,
    paidAmountKrw,
    purchaseChannel: 'LEMON_SQUEEZY',
    customerId: hwid,
    orderId: String(orderId || ''),
    issuedAt,
    expiresAt,
    requiresRedownload: false
  };

  const b64Payload = stringToBase64Url(JSON.stringify(tokenPayload));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ticketSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(`AF-TKT-v1.${b64Payload}`));
  const hmacSig = toBase64Url(new Uint8Array(sigBuf));
  const ticket = `AF-TKT-v1.${b64Payload}.${hmacSig}`;

  return {
    ticket,
    ticketId,
    bitmask,
    validDays: normDays,
    paidAmountKrw,
    issuedAt,
    expiresAt
  };
}

export async function onRequestPost(context) {
  try {
    const rawBody = await context.request.text();
    const signature = context.request.headers.get('X-Signature') || '';
    const eventName = context.request.headers.get('X-Event-Name') || 'order_created';
    const webhookSecret = (context.env && context.env.LEMON_SQUEEZY_WEBHOOK_SECRET) || '';

    if (webhookSecret) {
      const validSig = await verifyLemonWebhookSignature(rawBody, signature, webhookSecret);
      if (!validSig) {
        return new Response(
          JSON.stringify({ success: false, error: 'INVALID_WEBHOOK_SIGNATURE' }),
          { status: 401, headers: { 'Content-Type': 'application/json;charset=UTF-8' } }
        );
      }
    }

    const payload = rawBody ? JSON.parse(rawBody) : {};
    const custom = (payload.meta && payload.meta.custom_data) || {};
    const orderId = (payload.data && payload.data.id) || custom.order_id || `LS-${Date.now()}`;
    const engine = String(custom.engine || 'ENGINE_DUAL').toUpperCase();
    const mode = String(custom.mode || 'managed').toLowerCase();
    const validDays = Number(custom.days || 30) || 30;
    const hwid = String(custom.hwid || 'AF-GLOBAL-BUYER').trim();
    const ticketSecret = (context.env && context.env.AUTOFLOW_MODULE_TICKET_SECRET) || DEFAULT_TICKET_HMAC_SECRET;

    const issued = await issueEdgeSignedModuleTicket({
      engine,
      mode,
      validDays,
      hwid,
      orderId,
      ticketSecret
    });

    if (context.env && context.env.AUTOFLOW_ORDERS_KV && typeof context.env.AUTOFLOW_ORDERS_KV.put === 'function') {
      await context.env.AUTOFLOW_ORDERS_KV.put(
        `order:${orderId}`,
        JSON.stringify({
          order_id: orderId,
          event: eventName,
          hwid,
          engine,
          mode,
          valid_days: issued.validDays,
          ticket: issued.ticket,
          ticket_id: issued.ticketId,
          issued_at: issued.issuedAt,
          expires_at: issued.expiresAt
        }),
        { expirationTtl: 60 * 60 * 24 * 400 }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        event: eventName,
        order_id: orderId,
        ticket_id: issued.ticketId,
        ticket: issued.ticket,
        valid_days: issued.validDays,
        expires_at: issued.expiresAt
      }),
      { status: 200, headers: { 'Content-Type': 'application/json;charset=UTF-8' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'WEBHOOK_INTERNAL_ERROR' }),
      { status: 400, headers: { 'Content-Type': 'application/json;charset=UTF-8' } }
    );
  }
}
