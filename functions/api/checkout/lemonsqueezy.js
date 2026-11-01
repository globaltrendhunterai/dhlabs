/**
 * Cloudflare Pages Function: POST /api/checkout/lemonsqueezy
 *
 * [1-Product Dynamic Price Override Engine]
 * 대표님께서 Lemon Squeezy 대시보드에 '기본 상품 딱 1개(Base Variant ID 1개)'만 만들어 두시면,
 * 고객이 홈페이지(checkout.html)나 프로그램(setup_wizard.html)에서 어떤 상품(워크플로우 본체 또는
 * 18종 상주형 무인 방어 엔진 30일/90일/365일 기간권)을 선택하든 서버에서 권위 가격표(Authoritative Matrix)를
 * 조회하여 Lemon Squeezy Checkouts API (`custom_price` + `product_options.name` + `checkout_data.custom`)를
 * 실시간 호출해 오버레이 결제 URL을 반환합니다.
 */

const AUTHORITATIVE_ENGINE_MATRIX = {
  managed: {
    ENGINE_HEAL: {
      30: { krw: 39000, usd_cents: 2900, name: 'AutoFlow 상주형 무인 자가치유 엔진 (기본형 · 30일권)' },
      90: { krw: 99000, usd_cents: 7500, name: 'AutoFlow 상주형 무인 자가치유 엔진 (기본형 · 90일권)' },
      365: { krw: 329000, usd_cents: 24900, name: 'AutoFlow 상주형 무인 자가치유 엔진 (기본형 · 365일권)' },
    },
    ENGINE_RECON: {
      30: { krw: 49000, usd_cents: 3900, name: 'AutoFlow 상주형 무인 정합성 대사 엔진 (기본형 · 30일권)' },
      90: { krw: 125000, usd_cents: 9500, name: 'AutoFlow 상주형 무인 정합성 대사 엔진 (기본형 · 90일권)' },
      365: { krw: 409000, usd_cents: 30900, name: 'AutoFlow 상주형 무인 정합성 대사 엔진 (기본형 · 365일권)' },
    },
    ENGINE_DUAL: {
      30: { krw: 69000, usd_cents: 4900, name: 'AutoFlow 상주형 무인 자가치유+정합성 듀얼 통합 엔진 (기본형 · 30일권)' },
      90: { krw: 175000, usd_cents: 12900, name: 'AutoFlow 상주형 무인 자가치유+정합성 듀얼 통합 엔진 (기본형 · 90일권)' },
      365: { krw: 579000, usd_cents: 43900, name: 'AutoFlow 상주형 무인 자가치유+정합성 듀얼 통합 엔진 (기본형 · 365일권)' },
    },
  },
  mcp: {
    ENGINE_HEAL: {
      30: { krw: 29000, usd_cents: 2200, name: 'AutoFlow 상주형 무인 자가치유 엔진 (MCP 연동 특가 · 30일권)' },
      90: { krw: 75000, usd_cents: 5700, name: 'AutoFlow 상주형 무인 자가치유 엔진 (MCP 연동 특가 · 90일권)' },
      365: { krw: 249000, usd_cents: 18900, name: 'AutoFlow 상주형 무인 자가치유 엔진 (MCP 연동 특가 · 365일권)' },
    },
    ENGINE_RECON: {
      30: { krw: 39000, usd_cents: 2900, name: 'AutoFlow 상주형 무인 정합성 대사 엔진 (MCP 연동 특가 · 30일권)' },
      90: { krw: 99000, usd_cents: 7500, name: 'AutoFlow 상주형 무인 정합성 대사 엔진 (MCP 연동 특가 · 90일권)' },
      365: { krw: 329000, usd_cents: 24900, name: 'AutoFlow 상주형 무인 정합성 대사 엔진 (MCP 연동 특가 · 365일권)' },
    },
    ENGINE_DUAL: {
      30: { krw: 49000, usd_cents: 3700, name: 'AutoFlow 상주형 무인 자가치유+정합성 듀얼 통합 엔진 (MCP 연동 특가 · 30일권)' },
      90: { krw: 125000, usd_cents: 9500, name: 'AutoFlow 상주형 무인 자가치유+정합성 듀얼 통합 엔진 (MCP 연동 특가 · 90일권)' },
      365: { krw: 409000, usd_cents: 30900, name: 'AutoFlow 상주형 무인 자가치유+정합성 듀얼 통합 엔진 (MCP 연동 특가 · 365일권)' },
    },
  },
};

const AUTHORITATIVE_WORKFLOW_TIERS = {
  39000: { krw: 39000, usd_cents: 2900, name: 'AutoFlow 워크플로우 완제품 + 무인 방어 엔진 7일 패키지 (₩39,000)' },
  49000: { krw: 49000, usd_cents: 3900, name: 'AutoFlow 워크플로우 완제품 + 무인 방어 엔진 7일 패키지 (₩49,000)' },
  59000: { krw: 59000, usd_cents: 4500, name: 'AutoFlow 워크플로우 완제품 + 무인 방어 엔진 7일 패키지 (₩59,000)' },
  69000: { krw: 69000, usd_cents: 5200, name: 'AutoFlow 워크플로우 완제품 + 무인 방어 엔진 7일 패키지 (₩69,000)' },
  79000: { krw: 79000, usd_cents: 5900, name: 'AutoFlow 워크플로우 완제품 + 무인 방어 엔진 7일 패키지 (₩79,000)' },
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
};

export function resolveAuthoritativeCheckoutSpec(body = {}) {
  const mode = String(body.mode || 'managed').toLowerCase() === 'mcp' ? 'mcp' : 'managed';
  const engineId = String(body.engineId || body.engine_id || '').toUpperCase();
  const validDays = Number(body.validDays || body.valid_days || 0);

  if (AUTHORITATIVE_ENGINE_MATRIX[mode] && AUTHORITATIVE_ENGINE_MATRIX[mode][engineId] && AUTHORITATIVE_ENGINE_MATRIX[mode][engineId][validDays]) {
    const item = AUTHORITATIVE_ENGINE_MATRIX[mode][engineId][validDays];
    return {
      kind: 'ENGINE_PASS',
      mode,
      engineId,
      validDays,
      krw: item.krw,
      usd_cents: item.usd_cents,
      name: item.name,
      description: `PC 1대(HWID 귀속) 기준 ${validDays}일간 127ms 무인 방어 엔진 정품 라이선스 티켓(AF-TKT-v1)이 즉시 발급됩니다.`,
    };
  }

  const priceTier = Number(body.priceKrw || body.price_krw || 39000);
  const wf = AUTHORITATIVE_WORKFLOW_TIERS[priceTier] || AUTHORITATIVE_WORKFLOW_TIERS[39000];
  return {
    kind: 'WORKFLOW_PACKAGE',
    mode: 'managed',
    engineId: 'ENGINE_DUAL',
    validDays: 7,
    krw: wf.krw,
    usd_cents: wf.usd_cents,
    name: body.productName ? String(body.productName).slice(0, 120) : wf.name,
    description: '1제품=1사이트 영구 소장 워크플로우 본체 + 7일 상주형 무인 방어 엔진(자가치유·정합성) 기본 탑재 패키지',
  };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const spec = resolveAuthoritativeCheckoutSpec(body);
    const env = context.env || {};

    const apiKey = env.LEMONSQUEEZY_API_KEY || '';
    const storeId = env.LEMONSQUEEZY_STORE_ID || '';
    const baseVariantId = env.LEMONSQUEEZY_BASE_VARIANT_ID || '';
    const currency = String(env.LEMONSQUEEZY_STORE_CURRENCY || 'KRW').toUpperCase();

    // custom_price는 스토어 통화가 KRW이면 원화(예: 39000 또는 3900000), USD이면 센트(예: 2900)
    const customPrice = currency === 'USD' ? spec.usd_cents : spec.krw;

    const checkoutPayload = {
      data: {
        type: 'checkouts',
        attributes: {
          custom_price: customPrice,
          product_options: {
            name: spec.name,
            description: spec.description,
          },
          checkout_data: {
            email: body.email ? String(body.email).trim() : undefined,
            custom: {
              kind: spec.kind,
              engine_id: spec.engineId,
              mode: spec.mode,
              valid_days: String(spec.validDays),
              paid_amount_krw: String(spec.krw),
              hwid: body.hwid ? String(body.hwid).trim() : 'UNBOUND',
            },
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: String(storeId || 'PENDING_STORE_ID') } },
          variant: { data: { type: 'variants', id: String(baseVariantId || 'PENDING_VARIANT_ID') } },
        },
      },
    };

    // 아직 Lemon Squeezy 스토어 심사 중이거나 API 키가 설정되기 전에는 폴백 URL과 생성된 페이로드 스펙을 함께 반환
    if (!apiKey || !storeId || !baseVariantId) {
      return new Response(
        JSON.stringify({
          ok: true,
          mode: 'STATIC_FALLBACK_UNTIL_STORE_APPROVED',
          spec,
          lemon_api_payload_preview: checkoutPayload,
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    const res = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(checkoutPayload),
    });

    const data = await res.json();
    const checkoutUrl = data && data.data && data.data.attributes && data.data.attributes.url;
    if (!res.ok || !checkoutUrl) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'LEMON_CHECKOUT_CREATE_FAILED',
          details: data,
        }),
        { status: 502, headers: CORS_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        mode: 'DYNAMIC_CUSTOM_PRICE_OVERLAY',
        checkoutUrl,
        spec,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message || 'INVALID_REQUEST' }),
      { status: 400, headers: CORS_HEADERS }
    );
  }
}
