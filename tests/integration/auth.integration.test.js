const mockUsers = [];
let mockNextUserId = 1;

jest.mock('bcrypt', () => ({
  hash: jest.fn(async (password) => `hashed:${password}`),
  compare: jest.fn(async (password, hash) => hash === `hashed:${password}`),
}));

jest.mock('../db/connection', () => ({
  execute: jest.fn(async (sql, params) => {
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

    if (sql.includes('SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1')) {
      const [identifier] = params;
      return [mockUsers.filter((user) => user.username === identifier || user.email === identifier).slice(0, 1)];
    }

    if (sql.includes('SELECT id, display_name, username, email, created_at FROM users WHERE id = ? LIMIT 1')) {
      const [id] = params;
      const user = mockUsers.find((candidate) => candidate.id === id);
      return [user ? [{
        id: user.id,
        display_name: user.display_name,
        username: user.username,
        email: user.email,
        created_at: user.created_at,
      }] : []];
    }

    throw new Error(`Unexpected SQL in test: ${sql}`);
  }),
  query: jest.fn(async () => [[]]),
}));

const app = require('../../server');

let server;
let baseUrl;

function sessionCookie(response) {
  const setCookie = response.headers.get('set-cookie');
  return setCookie ? setCookie.split(';')[0] : '';
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Origin') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method)) {
    headers.set('Origin', baseUrl);
  }

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${baseUrl}${path}`, { ...options, headers });
}

async function json(response) {
  return response.json();
}

async function registerUser(overrides = {}) {
  const payload = {
    displayName: 'Test User',
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
    ...overrides,
  };

  const response = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return { response, payload, cookie: sessionCookie(response), data: await json(response) };
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
});

describe('auth session integration', () => {
  test('registration creates a logged-in session and returns a safe user payload', async () => {
    const { response, data, cookie } = await registerUser({
      displayName: 'Ada Lovelace',
      username: 'Ada_User',
      email: 'ADA@Example.com',
    });

    expect(response.status).toBe(201);
    expect(cookie).toMatch(/^feedline\.sid=/);
    expect(data).toEqual({
      user: expect.objectContaining({
        id: 1,
        displayName: 'Ada Lovelace',
        username: 'ada_user',
        email: 'ada@example.com',
      }),
    });
    expect(data.user.password).toBeUndefined();
    expect(data.user.passwordHash).toBeUndefined();
    expect(mockUsers[0].password_hash).toBe('hashed:password123');

    const meResponse = await request('/api/auth/me', {
      headers: { Cookie: cookie },
    });
    const meData = await json(meResponse);

    expect(meResponse.status).toBe(200);
    expect(meData.user).toEqual(expect.objectContaining({
      id: 1,
      displayName: 'Ada Lovelace',
      username: 'ada_user',
      email: 'ada@example.com',
    }));
  });

  test('login, logout, and current-user state work with username credentials', async () => {
    const registered = await registerUser();

    const logoutResponse = await request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: registered.cookie },
    });
    expect(logoutResponse.status).toBe(200);

    const loggedOutMeResponse = await request('/api/auth/me', {
      headers: { Cookie: registered.cookie },
    });
    expect(loggedOutMeResponse.status).toBe(401);

    const loginResponse = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'testuser', password: 'password123' }),
    });
    const loginData = await json(loginResponse);
    const loginCookie = sessionCookie(loginResponse);

    expect(loginResponse.status).toBe(200);
    expect(loginCookie).toMatch(/^feedline\.sid=/);
    expect(loginData.user).toEqual(expect.objectContaining({
      id: 1,
      displayName: 'Test User',
      username: 'testuser',
      email: 'test@example.com',
    }));

    const loggedInMeResponse = await request('/api/auth/me', {
      headers: { Cookie: loginCookie },
    });
    expect(loggedInMeResponse.status).toBe(200);

    const secondLogoutResponse = await request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: loginCookie },
    });
    expect(secondLogoutResponse.status).toBe(200);

    const finalMeResponse = await request('/api/auth/me', {
      headers: { Cookie: loginCookie },
    });
    expect(finalMeResponse.status).toBe(401);
  });

  test('login works with email credentials', async () => {
    const registered = await registerUser();
    await request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: registered.cookie },
    });

    const loginResponse = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'TEST@EXAMPLE.COM', password: 'password123' }),
    });
    const loginData = await json(loginResponse);

    expect(loginResponse.status).toBe(200);
    expect(loginData.user).toEqual(expect.objectContaining({
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
    }));
  });
});
