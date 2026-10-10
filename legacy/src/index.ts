import { readConfig } from './config.js';
import { connect } from './db.js';
import { migrate } from './migrate.js';
import { buildApp } from './app.js';
const config = readConfig();
const db = await connect(config);
// Production migrations run as a separate release job, not with the app's runtime role.
if (config.NODE_ENV !== 'production') await migrate(db);
const app = await buildApp(config, db);
for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal, async () => {
  await app.close(); await db.close(); process.exit(0);
});
try { await app.listen({ port: config.PORT, host: config.HOST }); }
catch (error) { app.log.error(error); await app.close(); await db.close(); process.exitCode=1; }
