import Stripe from 'stripe';
import type { FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import type { Database } from './db.js';
import { z } from 'zod';
import { HttpError, type User, rateLimit } from './security.js';

export function billing(config: Config, db: Database, app: FastifyInstance, authenticate: (request: import('fastify').FastifyRequest) => Promise<User>) {
  const stripe = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY, { timeout: 15000, maxNetworkRetries: 1 }) : null;
  app.post('/api/billing/checkout', async request => {
    const user = await authenticate(request);
    await rateLimit(db, `checkout:${user.id}`, 10, 3600);
    const { plan } = z.object({ plan: z.enum(['standard', 'premium']) }).strict().parse(request.body);
    const price = plan === 'standard' ? config.STRIPE_STANDARD_PRICE_ID : config.STRIPE_PREMIUM_PRICE_ID;
    if (!stripe || !price || !config.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, 'Purchases are not available yet.');
    const customer = await db.transaction(async tx => {
      const record = (await tx.query<{ stripe_customer_id: string | null; plan: string }>('SELECT stripe_customer_id,plan FROM users WHERE id=$1 FOR UPDATE', [user.id])).rows[0];
      if (record.plan !== 'free') throw new HttpError(409, 'You already have a paid plan. Manage it in the billing portal.');
      if (record.stripe_customer_id) return record.stripe_customer_id;
      const created = await stripe.customers.create({ email: user.email, metadata: { userId: user.id } }, { idempotencyKey: `customer:${user.id}` });
      await tx.query('UPDATE users SET stripe_customer_id=$1 WHERE id=$2', [created.id, user.id]);
      return created.id;
    });
    const subscriptions = await stripe.subscriptions.list({ customer, limit: 100, status: 'all' });
    if (subscriptions.data.some(s => ['active', 'trialing', 'past_due', 'incomplete'].includes(s.status))) throw new HttpError(409, 'An existing subscription needs attention. Please use the billing portal.');
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription', customer, line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      success_url: `${config.APP_ORIGIN}/?checkout=success`, cancel_url: `${config.APP_ORIGIN}/#pricing`
    }, { idempotencyKey: `checkout:${user.id}:${plan}:${Math.floor(Date.now() / 1800000)}` });
    return { url: checkout.url };
  });
  app.post('/api/billing/portal', async request => {
    const user = await authenticate(request);
    await rateLimit(db, `portal:${user.id}`, 20, 3600);
    if (!stripe) throw new HttpError(503, 'Billing is not available yet.');
    const record = (await db.query<{ stripe_customer_id: string | null }>('SELECT stripe_customer_id FROM users WHERE id=$1', [user.id])).rows[0];
    if (!record.stripe_customer_id) throw new HttpError(400, 'No billing account is associated with this user.');
    const portal = await stripe.billingPortal.sessions.create({ customer: record.stripe_customer_id, return_url: config.APP_ORIGIN });
    return { url: portal.url };
  });
  // Encapsulation preserves raw bytes solely for Stripe signature verification.
  app.register(async scope => {
    scope.removeContentTypeParser('application/json');
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    scope.post('/api/billing/webhook', async request => {
      if (!stripe || !config.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, 'Billing is not configured.');
      const signature = request.headers['stripe-signature'];
      if (typeof signature !== 'string') throw new HttpError(400, 'Missing signature.');
      let event: Stripe.Event;
      try { event = stripe.webhooks.constructEvent(request.body as Buffer, signature, config.STRIPE_WEBHOOK_SECRET); }
      catch { throw new HttpError(400, 'Invalid signature.'); }
      const supported = new Set(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed']);
      if (!supported.has(event.type)) return { received: true };
      const object = event.data.object as unknown as { customer: string | { id: string } };
      const customer = typeof object.customer === 'string' ? object.customer : object.customer.id;
      await db.transaction(async tx => {
        // Serialize deliveries per customer, then read Stripe's current state to handle out-of-order events.
        const record = (await tx.query<{ id: string }>('SELECT id FROM users WHERE stripe_customer_id=$1 FOR UPDATE', [customer])).rows[0];
        if (!record) throw new HttpError(409, 'Customer is not available yet; retry delivery.');
        const inserted = await tx.query('INSERT INTO stripe_events(id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id', [event.id]);
        if (!inserted.rows.length) return;
        const subscriptions = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 });
        let plan = 'free'; let subscriptionId: string | null = null;
        for (const subscription of subscriptions.data) {
          if (!['active', 'trialing'].includes(subscription.status)) continue;
          for (const item of subscription.items.data) {
            if (config.STRIPE_PREMIUM_PRICE_ID && item.price.id === config.STRIPE_PREMIUM_PRICE_ID) { plan = 'premium'; subscriptionId = subscription.id; }
            else if (plan !== 'premium' && config.STRIPE_STANDARD_PRICE_ID && item.price.id === config.STRIPE_STANDARD_PRICE_ID) { plan = 'standard'; subscriptionId = subscription.id; }
          }
        }
        await tx.query('UPDATE users SET plan=$1,stripe_subscription_id=$2 WHERE id=$3', [plan, subscriptionId, record.id]);
      });
      return { received: true };
    });
  });
}
