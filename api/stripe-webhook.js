/**
 * api/stripe-webhook.js
 * ─────────────────────────────────────────────
 * Stripe calls this after every successful payment.
 * Verifies the signature, then records the purchase in Supabase.
 *
 * Vercel env vars needed:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET   (from Stripe dashboard → Webhooks)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Events handled:
 *   checkout.session.completed  → credits or subscription activated
 */

export const config = {
  api: { bodyParser: false },  // Stripe needs raw body for signature verification
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    console.error('Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return res.status(500).end();
  }

  // Read raw body for signature check
  const rawBody = await streamToBuffer(req);
  const signature = req.headers['stripe-signature'];

  // Verify webhook signature manually (no Stripe SDK)
  let event;
  try {
    event = await verifyStripeWebhook(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const plan = session.metadata?.plan || 'pro';
    const qty  = parseInt(session.metadata?.qty || '1');
    const customerEmail = session.customer_details?.email || '';
    const customerId = session.customer || '';
    const sessionId = session.id;

    try {
      await recordPurchase({
        email: customerEmail,
        customerId,
        sessionId,
        plan,
        qty,
        mode: session.mode, // 'payment' or 'subscription'
        amount: session.amount_total,
      });
      console.log(`Recorded: ${plan} x${qty} for ${customerEmail}`);
    } catch (err) {
      console.error('recordPurchase failed:', err.message);
      // Still return 200 so Stripe doesn't retry
    }
  }

  return res.status(200).json({ received: true });
}

// ── Record purchase in Supabase ──
async function recordPurchase({ email, customerId, sessionId, plan, qty, mode, amount }) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  // Upsert user record
  await fetch(`${supabaseUrl}/rest/v1/purchases`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      email,
      stripe_customer_id: customerId,
      stripe_session_id: sessionId,
      plan,
      credits_purchased: plan === 'credits' ? qty : 0,
      subscription_plan: mode === 'subscription' ? plan : null,
      amount_cents: amount,
      created_at: new Date().toISOString(),
    }),
  });
}

// ── Stripe webhook signature verification (no SDK) ──
async function verifyStripeWebhook(rawBody, signature, secret) {
  const sigParts = {};
  signature.split(',').forEach(part => {
    const [k, v] = part.split('=');
    sigParts[k] = v;
  });

  const timestamp = sigParts.t;
  const v1 = sigParts.v1;

  const payload = `${timestamp}.${rawBody.toString()}`;

  // HMAC-SHA256
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (computed !== v1) throw new Error('Signature mismatch');

  // Reject old webhooks (> 5 minutes)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (age > 300) throw new Error('Webhook too old: ' + age + 's');

  return JSON.parse(rawBody.toString());
}

function streamToBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
