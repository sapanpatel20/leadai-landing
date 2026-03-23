/**
 * api/checkout.js
 * ─────────────────────────────────────────────
 * Creates Stripe Checkout sessions for:
 *   - Pay-per-video credits ($3 one-time, 1 video credit)
 *   - Pro subscription ($29/month, 30 videos)
 *   - Agency subscription ($79/month, 100 videos)
 *
 * POST body: { plan: 'credits'|'pro'|'agency', quantity: 1 }
 * Response:  { url: 'https://checkout.stripe.com/...' }
 *
 * Vercel env vars needed:
 *   STRIPE_SECRET_KEY
 *   STRIPE_PRICE_CREDITS   (one-time $3 price ID)
 *   STRIPE_PRICE_PRO       ($29/month price ID)
 *   STRIPE_PRICE_AGENCY    ($79/month price ID)
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(500).json({
      error: 'STRIPE_SECRET_KEY not set. Add it to Vercel environment variables.'
    });
  }

  const { plan = 'pro', quantity = 1 } = req.body;
  const origin = req.headers.origin || 'https://www.leadai.guru';

  // Route to correct price ID and mode
  const config = {
    credits: {
      priceId: process.env.STRIPE_PRICE_CREDITS,
      mode: 'payment',           // one-time payment
      label: 'Video Credits',
      qty: Math.max(1, Math.min(50, parseInt(quantity) || 1)), // 1-50 credits
    },
    pro: {
      priceId: process.env.STRIPE_PRICE_PRO,
      mode: 'subscription',
      label: 'Pro',
      qty: 1,
    },
    agency: {
      priceId: process.env.STRIPE_PRICE_AGENCY,
      mode: 'subscription',
      label: 'Agency',
      qty: 1,
    },
  };

  const planConfig = config[plan];
  if (!planConfig) {
    return res.status(400).json({ error: `Unknown plan: ${plan}` });
  }

  if (!planConfig.priceId) {
    // Price ID not set yet — send to pricing page
    return res.status(200).json({
      redirect: `${origin}/pricing.html`,
      message: `STRIPE_PRICE_${plan.toUpperCase()} not set in Vercel env vars yet`
    });
  }

  try {
    const params = new URLSearchParams({
      'mode': planConfig.mode,
      'line_items[0][price]': planConfig.priceId,
      'line_items[0][quantity]': String(planConfig.qty),
      'success_url': `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}&plan=${plan}&qty=${planConfig.qty}`,
      'cancel_url': `${origin}/pricing.html`,
      'allow_promotion_codes': 'true',
      'billing_address_collection': 'auto',
      // Pass plan as metadata so webhook can act on it
      'metadata[plan]': plan,
      'metadata[qty]': String(planConfig.qty),
    });

    // For subscriptions add customer portal link
    if (planConfig.mode === 'subscription') {
      params.append('subscription_data[metadata][plan]', plan);
    }

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await response.json();
    if (session.error) throw new Error(session.error.message);

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
