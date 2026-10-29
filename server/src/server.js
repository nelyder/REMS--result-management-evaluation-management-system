let env;
try {
  ({ env } = await import('./config/env.js'));
} catch (err) {
  console.error(`\n[config] ${err.message}\n`);
  process.exit(1);
}

const { createApp } = await import('./app.js');
const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`REMS API listening on http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
});

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
