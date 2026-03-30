const STATIC_RATES_FROM_GBP = {
  GBP: 1,
  EUR: 1.17,
  USD: 1.27,
  CAD: 1.72,
  AUD: 1.95,
  JPY: 191.0
};

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const base = (url.searchParams.get('base') || 'GBP').toUpperCase();
  const symbolsRaw = url.searchParams.get('symbols') || 'EUR,USD,CAD,AUD,JPY';
  const symbols = symbolsRaw
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  if (base !== 'GBP') {
    return new Response(
      JSON.stringify({
        error: 'Only GBP base is supported',
        base: 'GBP'
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }

  const fallback = {
    base: 'GBP',
    date: new Date().toISOString().slice(0, 10),
    rates: {
      GBP: 1
    }
  };

  symbols.forEach((symbol) => {
    if (STATIC_RATES_FROM_GBP[symbol]) {
      fallback.rates[symbol] = STATIC_RATES_FROM_GBP[symbol];
    }
  });

  try {
    const endpoint = `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(symbols.join(','))}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return new Response(JSON.stringify(fallback), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    const data = await response.json();
    const normalized = {
      base: data.base || 'GBP',
      date: data.date || new Date().toISOString().slice(0, 10),
      rates: {
        GBP: 1,
        ...(data.rates || {})
      }
    };

    return new Response(JSON.stringify(normalized), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify(fallback), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}
