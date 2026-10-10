import { z } from 'zod';

const optional = z.string().trim().default('');
export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_ORIGIN: z.url().default('http://localhost:3000'),
  DATABASE_URL: optional,
  DATABASE_SSL: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info'),
  GEMINI_API_KEY: optional,
  GEMINI_MODEL: z.string().regex(/^[a-zA-Z0-9.-]+$/).default('gemini-2.5-flash'),
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_STANDARD_PRICE_ID: optional,
  STRIPE_PREMIUM_PRICE_ID: optional
}).superRefine((v, ctx) => {
  if (new URL(v.APP_ORIGIN).origin !== v.APP_ORIGIN) ctx.addIssue({ code: 'custom', message: 'APP_ORIGIN must be an origin without a path or trailing slash.' });
  if (v.NODE_ENV === 'production') {
    if (!/^postgres(ql)?:\/\//.test(v.DATABASE_URL)) ctx.addIssue({ code: 'custom', message: 'Production requires DATABASE_URL for PostgreSQL.' });
    if (!v.APP_ORIGIN.startsWith('https://')) ctx.addIssue({ code: 'custom', message: 'Production requires an HTTPS APP_ORIGIN.' });
  }
});
export type Config = z.infer<typeof configSchema>;
export const readConfig = () => configSchema.parse(process.env);
