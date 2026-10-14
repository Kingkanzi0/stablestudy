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

app.use('/api', generalLimiter);
app.use('/api/auth', writeLimiter, require('./routes/auth'));
app.use('/api/sync', writeLimiter);
app.use('/api/courses', require('./routes/courses'));
app.use('/api/tutors', require('./routes/tutors'));
app.use('/api', require('./routes/misc'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
