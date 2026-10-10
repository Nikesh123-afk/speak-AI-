import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { Queryable } from './db.js';
import type { FastifyReply } from 'fastify';
import type { Config } from './config.js';
const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const scrypt = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) =>
  scryptCallback(password, salt, 64, scryptOptions, (error, key) => error ? reject(error) : resolve(key)));
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, value] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !value) return false;
  const hash = await scrypt(password, salt);
  const expected = Buffer.from(value, 'hex');
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}
export class HttpError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}
export interface User { id: string; name: string; email: string; plan: 'free' | 'standard' | 'premium'; createdAt: string; }
export const userColumns = 'u.id, u.name, u.email, u.plan, u.created_at AS "createdAt"';
export async function findUser(db: Queryable, token?: string): Promise<User | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return (await db.query<User>(`SELECT ${userColumns} FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at > now()`, [digest(token)])).rows[0] ?? null;
}
export async function createSession(db: Queryable, reply: FastifyReply, userId: string, config: Config) {
  const token = randomBytes(32).toString('hex');
  await db.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [digest(token), userId, new Date(Date.now() + config.SESSION_DAYS * 86400000)]);
  reply.setCookie('ielts_session', token, { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: config.SESSION_DAYS * 86400 });
}
export async function rateLimit(db: Queryable, key: string, max: number, seconds: number) {
  const result = await db.query<{ count: number }>(`INSERT INTO rate_limits(key,count,expires_at) VALUES ($1,1,now()+($2 * interval '1 second'))
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at < now() THEN 1 ELSE rate_limits.count+1 END,
    expires_at=CASE WHEN rate_limits.expires_at < now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END RETURNING count`, [digest(key), seconds]);
  if (result.rows[0].count > max) throw new HttpError(429, 'Too many requests. Please try again later.');
}
