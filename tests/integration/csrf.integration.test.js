const mockUsers = [];
let mockNextUserId = 1;
const mockExecute = jest.fn(async (sql, params) => {
  if (sql.includes('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1')) {
    const [username, email] = params;
    return [mockUsers.filter((user) => user.username === username || user.email === email).slice(0, 1)];
  }

  if (sql.includes('INSERT INTO users')) {
    const [displayName, username, email, passwordHash] = params;
    const id = mockNextUserId++;
    mockUsers.push({
      id,
      display_name: displayName,
      username,
      email,
      password_hash: passwordHash,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });
    return [{ insertId: id }];
  }

  throw new Error(`Unexpected SQL in test: ${sql}`);
});

jest.mock('bcrypt', () => ({
  hash: jest.fn(async (password) => `hashed:${password}`),
  compare: jest.fn(async (password, hash) => hash === `hashed:${password}`),
}));

jest.mock('../../db/connection', () => ({
  execute: mockExecute,
  query: jest.fn(async () => [[]]),
}));

const app = require('../../server');

let server;
let baseUrl;

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${baseUrl}${path}`, { ...options, headers });
}

async function json(response) {
  return response.json();
}

function registrationPayload(overrides = {}) {
  return JSON.stringify({
    displayName: 'CSRF User',
    username: 'csrfuser',
    email: 'csrf.user@example.com',
    password: 'password123',
    ...overrides,
  });
}

beforeAll((done) => {
  server = app.listen(0, () => {
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

beforeEach(() => {
  mockUsers.length = 0;
  mockNextUserId = 1;
  mockExecute.mockClear();
});

describe('CSRF same-origin protection', () => {
  test('unsafe API requests without Origin or Referer are rejected', async () => {
    const response = await request('/api/auth/register', {
      method: 'POST',
      body: registrationPayload(),
    });
    const data = await json(response);

    expect(response.status).toBe(403);
    expect(data).toEqual({ error: 'CSRF validation failed.' });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test('unsafe API requests from a foreign origin are rejected', async () => {
    const response = await request('/api/auth/register', {
      method: 'POST',
      headers: { Origin: 'https://evil.example.com' },
      body: registrationPayload(),
    });
    const data = await json(response);

    expect(response.status).toBe(403);
    expect(data).toEqual({ error: 'CSRF validation failed.' });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test('unsafe API requests from the same origin are allowed', async () => {
    const response = await request('/api/auth/register', {
      method: 'POST',
      headers: { Origin: baseUrl },
      body: registrationPayload(),
    });
    const data = await json(response);

    expect(response.status).toBe(201);
    expect(data.user).toEqual(expect.objectContaining({
      id: 1,
      displayName: 'CSRF User',
      username: 'csrfuser',
      email: 'csrf.user@example.com',
    }));
    expect(mockExecute).toHaveBeenCalled();
  });

  test('unsafe API requests with a same-origin Referer are allowed', async () => {
    const response = await request('/api/auth/register', {
      method: 'POST',
      headers: { Referer: `${baseUrl}/` },
      body: registrationPayload({ username: 'refereruser', email: 'referer.user@example.com' }),
    });
    const data = await json(response);

    expect(response.status).toBe(201);
    expect(data.user).toEqual(expect.objectContaining({
      id: 1,
      username: 'refereruser',
      email: 'referer.user@example.com',
    }));
  });

  test('safe API requests are not blocked by CSRF validation', async () => {
    const response = await request('/api/health');
    const data = await json(response);

    expect(response.status).toBe(200);
    expect(data).toEqual({ status: 'ok' });
  });
});
