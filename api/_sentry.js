// Shared Sentry initialisation for all API routes.
// Requires SENTRY_DSN environment variable set in Vercel dashboard.
// If SENTRY_DSN is missing, Sentry is a no-op — no crashes, no side effects.

const Sentry = require('@sentry/node');

if (process.env.SENTRY_DSN && !Sentry.getClient()) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV || 'production',
    tracesSampleRate: 0.1,
  });
}

module.exports = Sentry;
