const mockUsers = [];
let mockNextUserId = 1;

jest.mock('bcrypt', () => ({
  hash: jest.fn(async (password) => `hashed:${password}`),
  compare: jest.fn(async (password, hash) => hash === `hashed:${password}`),
}));

jest.mock('../../db/connection', () => ({
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

    throw new Error(`Unexpected SQL in test: ${sql}`);
  }),
  query: jest.fn(async () => [[]]),
}));

const app = require('../../server');

let server;
let baseUrl;

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

function registrationPayload(overrides = {}) {
  return {
    displayName: 'Valid User',
    username: 'validuser',
    email: 'valid.user@example.com',
    password: 'password123',
    ...overrides,
  };
}

async function register(overrides = {}) {
  const response = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(registrationPayload(overrides)),
  });

  return { response, data: await json(response) };
}

async function login(payload) {
  const response = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return { response, data: await json(response) };
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

describe('auth validation integration', () => {
  test.each([
    [{ displayName: '' }, 'All fields are required.'],
    [{ username: '' }, 'All fields are required.'],
    [{ email: '' }, 'All fields are required.'],
    [{ password: '' }, 'All fields are required.'],
    [{ username: 'ab' }, 'Username must be 3-50 characters and use only letters, numbers, or underscores.'],
    [{ username: 'bad-user!' }, 'Username must be 3-50 characters and use only letters, numbers, or underscores.'],
    [{ email: 'not-an-email' }, 'Enter a valid email address.'],
    [{ password: 'short' }, 'Password must be at least 8 characters.'],
  ])('registration rejects invalid input %#', async (overrides, expectedError) => {
    const { response, data } = await register(overrides);

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: expectedError });
    expect(mockUsers).toHaveLength(0);
  });

  test('registration prevents duplicate usernames and emails', async () => {
    const firstRegistration = await register({
      username: 'duplicate',
      email: 'duplicate@example.com',
    });

    expect(firstRegistration.response.status).toBe(201);

    const duplicateUsername = await register({
      username: 'DUPLICATE',
      email: 'unique@example.com',
    });

    expect(duplicateUsername.response.status).toBe(409);
    expect(duplicateUsername.data).toEqual({ error: 'Username or email is already registered.' });

    const duplicateEmail = await register({
      username: 'uniqueuser',
      email: 'DUPLICATE@example.com',
    });

    expect(duplicateEmail.response.status).toBe(409);
    expect(duplicateEmail.data).toEqual({ error: 'Username or email is already registered.' });
    expect(mockUsers).toHaveLength(1);
  });

  test('registration normalizes username and email before storing and responding', async () => {
    const { response, data } = await register({
      username: 'Mixed_Case',
      email: 'Mixed.Case@Example.COM',
    });

    expect(response.status).toBe(201);
    expect(data.user).toEqual(expect.objectContaining({
      username: 'mixed_case',
      email: 'mixed.case@example.com',
    }));
    expect(mockUsers[0]).toEqual(expect.objectContaining({
      username: 'mixed_case',
      email: 'mixed.case@example.com',
    }));
  });

  test.each([
    [{ identifier: '', password: 'password123' }, 400, 'Username/email and password are required.'],
    [{ identifier: 'validuser', password: '' }, 400, 'Username/email and password are required.'],
    [{ identifier: 'a'.repeat(256), password: 'password123' }, 401, 'Invalid login credentials.'],
    [{ identifier: 'validuser', password: 'a'.repeat(129) }, 401, 'Invalid login credentials.'],
  ])('login rejects invalid input %#', async (payload, expectedStatus, expectedError) => {
    const { response, data } = await login(payload);

    expect(response.status).toBe(expectedStatus);
    expect(data).toEqual({ error: expectedError });
  });

  test('login returns the same generic error for unknown users and incorrect passwords', async () => {
    await register({ username: 'knownuser', email: 'known@example.com' });

    const unknownUser = await login({
      identifier: 'missinguser',
      password: 'password123',
    });

    expect(unknownUser.response.status).toBe(401);
    expect(unknownUser.data).toEqual({ error: 'Invalid login credentials.' });

    const badPassword = await login({
      identifier: 'knownuser',
      password: 'wrongpassword',
    });

    expect(badPassword.response.status).toBe(401);
    expect(badPassword.data).toEqual({ error: 'Invalid login credentials.' });
  });
});
