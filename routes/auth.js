const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/connection');
const {
  safeUser,
  normalizeUsername,
  normalizeEmail,
  isValidEmail,
  isValidUsername,
} = require('./auth-helpers');

const router = express.Router();
const SALT_ROUNDS = 12;
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_REQUESTS = 20;
const authAttempts = new Map();

function cleanExpiredAuthAttempts() {
  const now = Date.now();
  for (const [key, attempt] of authAttempts.entries()) {
    if (attempt.resetAt <= now) {
      authAttempts.delete(key);
    }
  }
}

const authCleanupTimer = setInterval(cleanExpiredAuthAttempts, AUTH_WINDOW_MS);
authCleanupTimer.unref?.();

function authRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  const attempt = authAttempts.get(key) || { count: 0, resetAt: now + AUTH_WINDOW_MS };

  if (attempt.resetAt <= now) {
    attempt.count = 0;
    attempt.resetAt = now + AUTH_WINDOW_MS;
  }

  attempt.count += 1;
  authAttempts.set(key, attempt);

  if (attempt.count > AUTH_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Too many authentication attempts. Please try again later.' });
  }

  next();
}

function establishSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        return reject(error);
      }

      req.session.userId = user.id;
      req.session.user = safeUser(user);
      resolve();
    });
  });
}

router.post('/register', authRateLimit, async (req, res) => {
  try {
    const displayName = String(req.body.displayName || '').trim();
    const username = normalizeUsername(String(req.body.username || ''));
    const email = normalizeEmail(String(req.body.email || ''));
    const password = String(req.body.password || '');

    if (!displayName || !username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (displayName.length > 100) {
      return res.status(400).json({ error: 'Display name cannot exceed 100 characters.' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({
        error: 'Username must be 3-50 characters and use only letters, numbers, or underscores.',
      });
    }

    if (email.length > 255) {
      return res.status(400).json({ error: 'Email cannot exceed 255 characters.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    if (password.length > 128) {
      return res.status(400).json({ error: 'Password cannot exceed 128 characters.' });
    }

    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',
      [username, email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ error: 'Username or email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const [result] = await pool.execute(
      'INSERT INTO users (display_name, username, email, password_hash) VALUES (?, ?, ?, ?)',
      [displayName, username, email, passwordHash]
    );

    const user = {
      id: result.insertId,
      display_name: displayName,
      username,
      email,
      created_at: new Date(),
    };

    await establishSession(req, user);
    res.status(201).json({ user: safeUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not register user.' });
  }
});

router.post('/login', authRateLimit, async (req, res) => {
  try {
    const identifier = String(req.body.identifier || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username/email and password are required.' });
    }

    if (identifier.length > 255 || password.length > 128) {
      return res.status(401).json({ error: 'Invalid login credentials.' });
    }

    const [users] = await pool.execute(
      'SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1',
      [identifier, identifier]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid login credentials.' });
    }

    const user = users[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid login credentials.' });
    }

    await establishSession(req, user);
    res.json({ user: safeUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not log in.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({ error: 'Could not log out.' });
    }

    res.clearCookie('feedline.sid');
    res.json({ message: 'Logged out.' });
  });
});

router.get('/me', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }

    const [users] = await pool.execute(
      'SELECT id, display_name, username, email, created_at FROM users WHERE id = ? LIMIT 1',
      [req.session.userId]
    );

    if (users.length === 0) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Not authenticated.' });
    }

    req.session.user = safeUser(users[0]);
    res.json({ user: req.session.user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not load current user.' });
  }
});

module.exports = router;
