const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { allowedOrigins } = require('./config');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();

app.set('trust proxy', 1); // behind Render/Railway/Vercel proxies
app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      // Allow server-to-server calls (no Origin) and the configured frontends.
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
  }),
);
app.use(express.json({ limit: '200kb' }));

const generalLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });

const rpcLimiter = rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false });

// Read-only chain proxy gets its own, higher limit (wallet UIs poll it).
app.use('/api/rpc', rpcLimiter, require('./routes/rpc'));
app.use('/api', generalLimiter);
app.use('/api/auth', writeLimiter, require('./routes/auth'));
app.use('/api/sync', writeLimiter);
app.use('/api/courses', require('./routes/courses'));
app.use('/api/tutors', require('./routes/tutors'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/orders', require('./routes/orders').router);
app.use('/api/agent', require('./routes/agent'));
app.use('/api', require('./routes/misc'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
