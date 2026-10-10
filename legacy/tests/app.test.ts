import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { configSchema } from '../src/config.js';
import { embedded, type Database } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { buildApp } from '../src/app.js';
import type { Assessor } from '../src/feedback.js';

const config = configSchema.parse({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
const headers = { 'x-app-request': '1', 'content-type': 'application/json', origin: config.APP_ORIGIN };
let db: Database;
let app: FastifyInstance;
let assessorCalls = 0;
const assessor: Assessor = async () => {
  assessorCalls++;
  return { band: null, criteria: { 'Lexical Resource': 6.5, Pronunciation: null }, strengths: ['Clear answer'], improvements: ['Add examples'], summary: 'Transcript only.' };
};

before(async () => {
  db = await embedded();
  await migrate(db);
  app = await buildApp(config, db, { assessor, allowAssessment: true });
});
after(async () => { await app.close(); await db.close(); });

async function signup(email = `${randomUUID()}@example.com`) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/signup', headers, payload: { name: 'Test User', email, password: 'correct horse battery' } });
  assert.equal(response.statusCode, 201, response.body);
  const cookie = response.cookies.find(c => c.name === 'ielts_session');
  assert.ok(cookie?.httpOnly);
  return { email, cookie: `ielts_session=${cookie.value}` };
}
const practice = (answer = 'I come from a coastal city.') => ({ topic: 'Hometown', part: 1, answers: [{ question: 'Where are you from?', answer }] });

test('health and readiness', async () => {
  assert.equal((await app.inject('/api/health')).statusCode, 200);
  assert.equal((await app.inject('/api/ready')).statusCode, 200);
});

test('state-changing requests require the app header, same origin and JSON', async () => {
  const payload = { email: 'a@example.com', password: 'x' };
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', payload, headers: { 'content-type': 'application/json' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', payload, headers: { ...headers, origin: 'https://evil.example' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', payload: 'email=a', headers: { 'x-app-request': '1', 'content-type': 'application/x-www-form-urlencoded' } })).statusCode, 415);
});

test('signup, session, login, logout', async () => {
  const { email, cookie } = await signup();
  const me = await app.inject({ url: '/api/auth/me', headers: { cookie } });
  assert.equal(me.json().user.email, email);
  assert.equal(me.json().user.password_hash, undefined);

  const duplicate = await app.inject({ method: 'POST', url: '/api/auth/signup', headers, payload: { name: 'X', email, password: 'correct horse battery' } });
  assert.equal(duplicate.statusCode, 409);

  const short = await app.inject({ method: 'POST', url: '/api/auth/signup', headers, payload: { name: 'X', email: 'short@example.com', password: 'short' } });
  assert.equal(short.statusCode, 400);

  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { email, password: 'wrong password!!' } })).statusCode, 401);
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers, payload: { email: email.toUpperCase(), password: 'correct horse battery' } });
  assert.equal(login.statusCode, 200);

  await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { ...headers, cookie }, payload: {} });
  assert.equal((await app.inject({ url: '/api/auth/me', headers: { cookie } })).json().user, null);
});

test('feedback requires login and an idempotency key', async () => {
  assert.equal((await app.inject({ method: 'POST', url: '/api/feedback', headers, payload: practice() })).statusCode, 401);
  const { cookie } = await signup();
  assert.equal((await app.inject({ method: 'POST', url: '/api/feedback', headers: { ...headers, cookie }, payload: practice() })).statusCode, 400);
});

test('feedback is idempotent, stored, and limited on the free plan', async () => {
  const { cookie } = await signup();
  const key = randomUUID();
  const send = (k: string, body = practice()) => app.inject({ method: 'POST', url: '/api/feedback', headers: { ...headers, cookie, 'idempotency-key': k }, payload: body });

  const before = assessorCalls;
  const first = await send(key);
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(first.json().practice.status, 'complete');
  const retry = await send(key);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.json().practice.id, first.json().practice.id);
  assert.equal(assessorCalls, before + 1);
  assert.equal((await send(key, practice('Different answer'))).statusCode, 409);

  assert.equal((await send(randomUUID(), { ...practice(), part: 2 })).statusCode, 403);
  assert.equal((await send(randomUUID())).statusCode, 201);
  assert.equal((await send(randomUUID())).statusCode, 201);
  assert.equal((await send(randomUUID())).statusCode, 403);

  const history = await app.inject({ url: '/api/practices', headers: { cookie } });
  assert.equal(history.json().total, 3);
});

test('a failed assessment does not use quota', async () => {
  const failing = await buildApp(config, db, { assessor: async () => { throw new Error('provider down'); }, allowAssessment: true });
  try {
    const { cookie, email } = await signup();
    const response = await failing.inject({ method: 'POST', url: '/api/feedback', headers: { ...headers, cookie, 'idempotency-key': randomUUID() }, payload: practice() });
    assert.equal(response.statusCode, 500);
    assert.doesNotMatch(response.body, /provider down/);
    const rows = await db.query<{ status: string }>('SELECT p.status FROM practices p JOIN users u ON u.id=p.user_id WHERE u.email=$1', [email]);
    assert.deepEqual(rows.rows.map(r => r.status), ['failed']);
  } finally { await failing.close(); }
});

test('billing is unavailable without Stripe configuration', async () => {
  const { cookie } = await signup();
  assert.equal((await app.inject({ method: 'POST', url: '/api/billing/checkout', headers: { ...headers, cookie }, payload: { plan: 'standard' } })).statusCode, 503);
  assert.equal((await app.inject({ method: 'POST', url: '/api/billing/webhook', headers: { 'content-type': 'application/json' }, payload: {} })).statusCode, 503);
  assert.equal((await app.inject('/api/config')).json().billingAvailable, false);
});

test('webhook rejects invalid signatures', async () => {
  const billingApp = await buildApp({ ...config, STRIPE_SECRET_KEY: 'sk_test_dummy', STRIPE_WEBHOOK_SECRET: 'whsec_dummy' }, db, { assessor });
  try {
    const response = await billingApp.inject({ method: 'POST', url: '/api/billing/webhook', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bad' }, payload: '{"id":"evt_1"}' });
    assert.equal(response.statusCode, 400);
  } finally { await billingApp.close(); }
});

test('signup is rate limited per IP', async () => {
  const limited = await buildApp(config, db, { assessor });
  try {
    let last = 0;
    for (let i = 0; i < 22; i++) {
      last = (await limited.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '203.0.113.9', headers, payload: { email: `${i}@example.com`, password: 'x' } })).statusCode;
    }
    assert.equal(last, 429);
  } finally { await limited.close(); }
});

test('security headers are set', async () => {
  const response = await app.inject('/api/health');
  assert.ok(response.headers['content-security-policy']);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.ok(response.headers['x-request-id']);
});
