export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return res.status(500).json({ error: 'STRIPE_SECRET_KEY not set in Vercel env vars' });

  const { plan, annual } = req.body;

  // Price IDs — you'll replace these with your real Stripe price IDs
  // Create products in Stripe dashboard first, then paste IDs here
  const prices = {
    starter_monthly:  process.env.STRIPE_STARTER_MONTHLY  || 'price_starter_monthly',
    starter_annual:   process.env.STRIPE_STARTER_ANNUAL   || 'price_starter_annual',
    pro_monthly:      process.env.STRIPE_PRO_MONTHLY      || 'price_pro_monthly',
    pro_annual:       process.env.STRIPE_PRO_ANNUAL       || 'price_pro_annual',
    agency_monthly:   process.env.STRIPE_AGENCY_MONTHLY   || 'price_agency_monthly',
    agency_annual:    process.env.STRIPE_AGENCY_ANNUAL    || 'price_agency_annual',
  };

  const priceKey = `${plan}_${annual ? 'annual' : 'monthly'}`;
  const priceId  = prices[priceKey];

  const origin = req.headers.origin || 'https://www.leadai.guru';

  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'subscription',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'success_url': `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
        'cancel_url':  `${origin}/pricing.html`,
        'allow_promotion_codes': 'true',
        'billing_address_collection': 'auto',
      }).toString()
    });

    const session = await response.json();
    if (session.error) throw new Error(session.error.message);

    return res.status(200).json({ url: session.url });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
