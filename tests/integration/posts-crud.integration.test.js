const mockUsers = [];
const mockPosts = [];
let mockNextUserId = 1;
let mockNextPostId = 1;

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

    if (sql.includes('INSERT INTO posts')) {
      const [userId, body] = params;
      const id = mockNextPostId++;
      mockPosts.push({
        id,
        user_id: userId,
        body,
        created_at: new Date(`2026-01-01T00:00:0${id}.000Z`),
        updated_at: new Date(`2026-01-01T00:00:0${id}.000Z`),
      });
      return [{ insertId: id }];
    }

    if (sql.includes('FROM posts') && sql.includes('JOIN users ON users.id = posts.user_id')) {
      const [limit, offset] = params;
      const rows = mockPosts
        .map((post) => {
          const user = mockUsers.find((candidate) => candidate.id === post.user_id);
          return {
            id: post.id,
            user_id: post.user_id,
            body: post.body,
            created_at: post.created_at,
            updated_at: post.updated_at,
            author_id: user.id,
            display_name: user.display_name,
            username: user.username,
          };
        })
        .sort((left, right) => right.created_at - left.created_at || right.id - left.id)
        .slice(offset, offset + limit);

      return [rows];
    }

    if (sql.includes('ranked_comments')) {
      return [[]];
    }

    if (sql.includes('UPDATE posts SET body = ? WHERE id = ? AND user_id = ?')) {
      const [body, postId, userId] = params;
      const post = mockPosts.find((candidate) => candidate.id === postId && candidate.user_id === userId);

      if (!post) {
        return [{ affectedRows: 0 }];
      }

      post.body = body;
      post.updated_at = new Date('2026-01-01T00:01:00.000Z');
      return [{ affectedRows: 1 }];
    }

    if (sql.includes('DELETE FROM posts WHERE id = ? AND user_id = ?')) {
      const [postId, userId] = params;
      const postIndex = mockPosts.findIndex((candidate) => candidate.id === postId && candidate.user_id === userId);

      if (postIndex === -1) {
        return [{ affectedRows: 0 }];
      }

      mockPosts.splice(postIndex, 1);
      return [{ affectedRows: 1 }];
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
  const response = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      displayName: 'Post Author',
      username: 'postauthor',
      email: 'post.author@example.com',
      password: 'password123',
      ...overrides,
    }),
  });

  return { response, cookie: sessionCookie(response), data: await json(response) };
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
  mockPosts.length = 0;
  mockNextUserId = 1;
  mockNextPostId = 1;
});

describe('post CRUD integration', () => {
  test('a logged-in user can create, read, update, and delete their own post', async () => {
    const { cookie } = await registerUser();

    const createResponse = await request('/api/posts', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: JSON.stringify({ body: '  My first wall post  ' }),
    });
    const createData = await json(createResponse);

    expect(createResponse.status).toBe(201);
    expect(createData.post).toEqual(expect.objectContaining({
      id: 1,
      userId: 1,
      body: 'My first wall post',
      author: expect.objectContaining({
        id: 1,
        displayName: 'Post Author',
        username: 'postauthor',
      }),
      comments: [],
    }));

    const listResponse = await request('/api/posts', {
      headers: { Cookie: cookie },
    });
    const listData = await json(listResponse);

    expect(listResponse.status).toBe(200);
    expect(listData).toEqual({
      posts: [expect.objectContaining({
        id: 1,
        userId: 1,
        body: 'My first wall post',
        author: expect.objectContaining({
          id: 1,
          displayName: 'Post Author',
          username: 'postauthor',
        }),
        comments: [],
      })],
      pagination: { limit: 20, offset: 0 },
    });

    const updateResponse = await request('/api/posts/1', {
      method: 'PUT',
      headers: { Cookie: cookie },
      body: JSON.stringify({ body: '  Updated wall post  ' }),
    });
    const updateData = await json(updateResponse);

    expect(updateResponse.status).toBe(200);
    expect(updateData.post).toEqual(expect.objectContaining({
      id: 1,
      body: 'Updated wall post',
      updatedAt: expect.any(String),
    }));

    const updatedListResponse = await request('/api/posts', {
      headers: { Cookie: cookie },
    });
    const updatedListData = await json(updatedListResponse);

    expect(updatedListResponse.status).toBe(200);
    expect(updatedListData.posts).toHaveLength(1);
    expect(updatedListData.posts[0]).toEqual(expect.objectContaining({
      id: 1,
      body: 'Updated wall post',
    }));

    const deleteResponse = await request('/api/posts/1', {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    const deleteData = await json(deleteResponse);

    expect(deleteResponse.status).toBe(200);
    expect(deleteData).toEqual({ message: 'Post deleted.' });

    const emptyListResponse = await request('/api/posts', {
      headers: { Cookie: cookie },
    });
    const emptyListData = await json(emptyListResponse);

    expect(emptyListResponse.status).toBe(200);
    expect(emptyListData.posts).toEqual([]);
  });
});
