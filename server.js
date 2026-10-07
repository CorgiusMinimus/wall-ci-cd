const express = require('express');
const session = require('express-session');
const path = require('path');
const pool = require('./db/connection');
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const commentRoutes = require('./routes/comments');
require('dotenv').config();

if (process.env.NODE_ENV === 'test') {
  require('dotenv').config({ path: '.env.test' });
}

const app = express();
const PORT = process.env.PORT || 3000;
const sessionMaxAgeHours = Number(process.env.SESSION_MAX_AGE_HOURS) || 24;
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function requireSameOrigin(req, res, next) {
  if (!unsafeMethods.has(req.method)) {
    return next();
  }

  const source = req.get('origin') || req.get('referer');
  if (!source) {
    return res.status(403).json({ error: 'CSRF validation failed.' });
  }

  try {
    const sourceOrigin = new URL(source).origin;
    const requestOrigin = `${req.protocol}://${req.get('host')}`;

    if (sourceOrigin !== requestOrigin) {
      return res.status(403).json({ error: 'CSRF validation failed.' });
    }
  } catch (error) {
    return res.status(403).json({ error: 'CSRF validation failed.' });
  }

  next();
}

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: 'feedline.sid',
    secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: sessionMaxAgeHours * 60 * 60 * 1000,
    },
  })
);

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', requireSameOrigin);

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health/db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      message: error.message,
    });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

app.use((error, req, res, next) => {
  console.error(error);

  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }

  res.status(500).json({ error: 'Unexpected server error.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Feedline server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
