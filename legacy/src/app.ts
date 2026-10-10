import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import staticFiles from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z, ZodError } from 'zod';
import type { Config } from './config.js';
import type { Database, Queryable } from './db.js';
import { createSession, digest, findUser, hashPassword, HttpError, rateLimit, userColumns, verifyPassword, type User } from './security.js';
import { geminiAssessor, practiceSchema, type Assessor } from './feedback.js';
import { topics } from './topics.js';
import { billing } from './billing.js';

const emailSchema = z.email().trim().toLowerCase().max(254);
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();
const signupSchema = loginSchema.extend({ name: z.string().trim().min(1).max(100), password: z.string().min(12).max(128) });
const practiceColumns = 'id,topic,part,answers,feedback,status,created_at AS "createdAt"';

export async function buildApp(config: Config, db: Database, options: { assessor?: Assessor; staticRoot?: string; allowAssessment?: boolean } = {}) {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL, redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["stripe-signature"]', 'req.body', 'res.headers["set-cookie"]'] },
    genReqId: () => randomUUID(), trustProxy: config.TRUST_PROXY, bodyLimit: 262144, requestTimeout: 65000
  });
  const assessor = options.assessor ?? geminiAssessor(config);
  const feedbackReady = options.allowAssessment ?? Boolean(config.GEMINI_API_KEY);
  const dummyHash = await hashPassword(randomUUID());
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
    upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null
  } }, hsts: config.NODE_ENV === 'production' ? { maxAge: 31536000 } : false });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && request.url.split('?')[0] !== '/api/billing/webhook') {
      if (request.headers['x-app-request'] !== '1' || (request.headers.origin && request.headers.origin !== config.APP_ORIGIN)) throw new HttpError(403, 'Request origin is not allowed.');
      if (!request.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Use application/json.');
    }
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: 'Please check the submitted fields.', fields: error.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
    const status = error instanceof HttpError ? error.statusCode : typeof (error as { statusCode?: unknown }).statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500;
    if (status >= 500) request.log.error({ requestId: request.id, errorType: error instanceof Error ? error.name : 'Unknown' }, 'Request failed');
    if (status === 429) reply.header('Retry-After', '60');
    return reply.code(status).send({ error: error instanceof HttpError ? error.message : status < 500 ? 'Invalid request.' : 'Something went wrong. Please try again.', requestId: request.id });
  });
  const authenticate = async (request: import('fastify').FastifyRequest) => {
    const user = await findUser(db, request.cookies.ielts_session);
    if (!user) throw new HttpError(401, 'Please log in to continue.');
    return user;
  };
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/ready', async () => { await db.query('SELECT 1'); return { ok: true }; });
  app.get('/api/config', async () => ({ feedbackAvailable: feedbackReady, billingAvailable: Boolean(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET && config.STRIPE_STANDARD_PRICE_ID && config.STRIPE_PREMIUM_PRICE_ID) }));
  app.get('/api/topics', async () => topics);
  app.get('/api/auth/me', async request => ({ user: await findUser(db, request.cookies.ielts_session) }));
  app.post('/api/auth/signup', async (request, reply) => {
    await rateLimit(db, `auth-ip:${request.ip}`, 20, 900);
    const input = signupSchema.parse(request.body);
    const passwordHash = await hashPassword(input.password);
    const user = await db.transaction(async tx => {
      const result = await tx.query<User>(`INSERT INTO users AS u(id,name,email,password_hash) VALUES ($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING ${userColumns}`, [randomUUID(), input.name, input.email, passwordHash]);
      if (!result.rows.length) throw new HttpError(409, 'An account with this email already exists.');
      if (request.cookies.ielts_session) await tx.query('DELETE FROM sessions WHERE token_hash=$1', [digest(request.cookies.ielts_session)]);
      await createSession(tx, reply, result.rows[0].id, config);
      return result.rows[0];
    });
    return reply.code(201).send({ user });
  });
  app.post('/api/auth/login', async (request, reply) => {
    await rateLimit(db, `auth-ip:${request.ip}`, 20, 900);
    const input = loginSchema.parse(request.body);
    await rateLimit(db, `auth-account:${input.email}`, 15, 900);
    const record = (await db.query<User & { password_hash: string }>(`SELECT ${userColumns},u.password_hash FROM users u WHERE email=$1`, [input.email])).rows[0];
    const valid = await verifyPassword(input.password, record?.password_hash ?? dummyHash);
    if (!record || !valid) throw new HttpError(401, 'Invalid email or password.');
    await db.transaction(async tx => {
      if (request.cookies.ielts_session) await tx.query('DELETE FROM sessions WHERE token_hash=$1', [digest(request.cookies.ielts_session)]);
      await createSession(tx, reply, record.id, config);
    });
    const { password_hash: _secret, ...user } = record;
    return { user };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    if (request.cookies.ielts_session) await db.query('DELETE FROM sessions WHERE token_hash=$1', [digest(request.cookies.ielts_session)]);
    reply.clearCookie('ielts_session', { path: '/' }); return { ok: true };
  });
  app.get('/api/practices', async request => {
    const user = await authenticate(request);
    const query = z.object({ offset: z.coerce.number().int().min(0).max(100000).default(0), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(request.query);
    const practices = await db.query(`SELECT ${practiceColumns} FROM practices WHERE user_id=$1 AND status='complete' ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [user.id, query.limit, query.offset]);
    const total = (await db.query<{ count: string }>("SELECT count(*) FROM practices WHERE user_id=$1 AND status='complete'", [user.id])).rows[0].count;
    return { practices: practices.rows, total: Number(total), offset: query.offset };
  });
  app.post('/api/feedback', async (request, reply) => {
    const user = await authenticate(request);
    const input = practiceSchema.parse(request.body);
    const key = z.uuid().parse(request.headers['idempotency-key']);
    if (!feedbackReady) throw new HttpError(503, 'Speaking feedback is not available yet. Your answers remain on this screen.');
    await rateLimit(db, `feedback:${user.id}`, 30, 3600);
    const reservation = await db.transaction(async tx => {
      const fresh = (await tx.query<{ plan: string }>('SELECT plan FROM users WHERE id=$1 FOR UPDATE', [user.id])).rows[0];
      // Recover abandoned requests after the provider's hard timeout and release their quota.
      await tx.query("UPDATE practices SET status='failed' WHERE user_id=$1 AND status='pending' AND created_at < now()-interval '2 minutes'", [user.id]);
      const prior = (await tx.query<Record<string, unknown>>(`SELECT ${practiceColumns} FROM practices WHERE user_id=$1 AND request_key=$2`, [user.id, key])).rows[0];
      if (prior) {
        if (prior.topic !== input.topic || prior.part !== input.part || JSON.stringify(prior.answers) !== JSON.stringify(input.answers)) {
          // JSONB key order is not stable; compare each answer structurally.
          const oldAnswers = prior.answers as { question: string; answer: string }[];
          if (prior.topic !== input.topic || prior.part !== input.part || oldAnswers.length !== input.answers.length || oldAnswers.some((a,i) => a.question !== input.answers[i].question || a.answer !== input.answers[i].answer)) throw new HttpError(409, 'This request key was already used for different answers.');
        }
        if (prior.status === 'complete') return { cached: prior, id: String(prior.id) };
        if (prior.status === 'pending') throw new HttpError(409, 'This assessment is already running. Please wait before retrying.');
      }
      if (fresh.plan === 'free') {
        if (input.part !== 1) throw new HttpError(403, 'Your plan includes Part 1 practice.');
        const count = (await tx.query<{ count: string }>("SELECT count(*) FROM practices WHERE user_id=$1 AND status IN ('pending','complete')", [user.id])).rows[0].count;
        if (Number(count) >= 3) throw new HttpError(403, 'Your three free assessments have been used. Choose a paid plan to continue.');
      }
      const id = prior ? String(prior.id) : randomUUID();
      await tx.query(`INSERT INTO practices(id,user_id,request_key,topic,part,answers,status) VALUES ($1,$2,$3,$4,$5,$6,'pending')
        ON CONFLICT(user_id,request_key) DO UPDATE SET status='pending',created_at=now()`, [id,user.id,key,input.topic,input.part,JSON.stringify(input.answers)]);
      return { id, cached: null };
    });
    if (reservation.cached) return { practice: reservation.cached };
    try {
      const feedback = await assessor(input);
      const result = await db.query(`UPDATE practices SET feedback=$1,status='complete' WHERE id=$2 RETURNING ${practiceColumns}`, [JSON.stringify(feedback),reservation.id]);
      return reply.code(201).send({ practice: result.rows[0] });
    } catch (error) {
      await db.query("UPDATE practices SET status='failed' WHERE id=$1", [reservation.id]);
      throw error;
    }
  });
  app.post('/api/subscribe', async request => {
    await rateLimit(db, `subscribe:${request.ip}`, 5, 3600);
    const input = z.object({ email: emailSchema }).strict().parse(request.body);
    await db.query('INSERT INTO subscribers(email) VALUES ($1) ON CONFLICT DO NOTHING', [input.email]);
    return { message: 'Your interest has been saved. Thank you!' };
  });
  billing(config, db, app, authenticate);
  await app.register(staticFiles, { root: resolve(options.staticRoot ?? (config.NODE_ENV === 'production' ? 'dist/client' : 'public')), maxAge: config.NODE_ENV === 'production' ? '1h' : 0 });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Not found.' }));
  // Database-side limits and sessions have indexed expiries. Cleanup is safe across instances.
  const timer = setInterval(() => {
    db.transaction(async (tx: Queryable) => {
      await tx.query('DELETE FROM sessions WHERE expires_at < now()');
      await tx.query('DELETE FROM rate_limits WHERE expires_at < now()');
    }).catch(() => app.log.warn('Expired-record cleanup failed'));
  }, 3600000).unref();
  app.addHook('onClose', async () => { clearInterval(timer); });
  return app;
}
