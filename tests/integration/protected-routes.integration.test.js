const mockExecute = jest.fn(async () => {
  throw new Error('Protected route reached the database without authentication.');
});

jest.mock('../db/connection', () => ({
  execute: mockExecute,
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
  mockExecute.mockClear();
});

describe('protected route authentication', () => {
  test.each([
    ['GET', '/api/posts', undefined],
    ['POST', '/api/posts', { body: 'Hello wall' }],
    ['PUT', '/api/posts/1', { body: 'Updated post' }],
    ['DELETE', '/api/posts/1', undefined],
    ['POST', '/api/posts/1/comments', { body: 'Nice post' }],
    ['PUT', '/api/comments/1', { body: 'Updated comment' }],
    ['DELETE', '/api/comments/1', undefined],
  ])('%s %s returns 401 without a logged-in session', async (method, path, payload) => {
    const response = await request(path, {
      method,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'You must be logged in.' });
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
