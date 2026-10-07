const mockUsers = [];
const mockPosts = [];
const mockComments = [];
let mockNextUserId = 1;
let mockNextPostId = 1;
let mockNextCommentId = 1;

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

    if (sql.includes('INSERT INTO posts')) {
      const [userId, body] = params;
      const id = mockNextPostId++;
      mockPosts.push({
        id,
        user_id: userId,
        body,
        created_at: new Date(`2026-01-01T00:00:${String(id).padStart(2, '0')}.000Z`),
        updated_at: new Date(`2026-01-01T00:00:${String(id).padStart(2, '0')}.000Z`),
      });
      return [{ insertId: id }];
    }

    if (sql.includes('INSERT INTO comments')) {
      const [postId, userId, body] = params;
      const post = mockPosts.find((candidate) => candidate.id === postId);

      if (!post) {
        const error = new Error('Referenced post does not exist.');
        error.code = 'ER_NO_REFERENCED_ROW_2';
        throw error;
      }

      const id = mockNextCommentId++;
      mockComments.push({
        id,
        post_id: postId,
        user_id: userId,
        body,
        created_at: new Date(`2026-01-01T00:01:${String(id).padStart(2, '0')}.000Z`),
        updated_at: new Date(`2026-01-01T00:01:${String(id).padStart(2, '0')}.000Z`),
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
      const postIds = params.slice(0, -1);
      const limit = params[params.length - 1];
      const rows = [];

      postIds.forEach((postId) => {
        mockComments
          .filter((comment) => comment.post_id === postId)
          .sort((left, right) => left.created_at - right.created_at || left.id - right.id)
          .slice(0, limit)
          .forEach((comment) => {
            const user = mockUsers.find((candidate) => candidate.id === comment.user_id);
            rows.push({
              id: comment.id,
              post_id: comment.post_id,
              user_id: comment.user_id,
              body: comment.body,
              created_at: comment.created_at,
              updated_at: comment.updated_at,
              author_id: user.id,
              display_name: user.display_name,
              username: user.username,
            });
          });
      });

      return [rows.sort((left, right) => left.post_id - right.post_id || left.created_at - right.created_at || left.id - right.id)];
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

async function registerUser() {
  const response = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      displayName: 'Feed User',
      username: 'feeduser',
      email: 'feed.user@example.com',
      password: 'password123',
    }),
  });

  return { response, cookie: sessionCookie(response), data: await json(response) };
}

async function createPost(cookie, body) {
  const response = await request('/api/posts', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: JSON.stringify({ body }),
  });

  return { response, data: await json(response) };
}

async function createComment(cookie, postId, body) {
  const response = await request(`/api/posts/${postId}/comments`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: JSON.stringify({ body }),
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
  mockPosts.length = 0;
  mockComments.length = 0;
  mockNextUserId = 1;
  mockNextPostId = 1;
  mockNextCommentId = 1;
});

describe('feed pagination and ordering integration', () => {
  test('returns posts newest-first and honors limit and offset', async () => {
    const { cookie } = await registerUser();
    await createPost(cookie, 'Oldest post');
    await createPost(cookie, 'Middle post');
    await createPost(cookie, 'Newest post');

    const firstPageResponse = await request('/api/posts?limit=2&offset=0', {
      headers: { Cookie: cookie },
    });
    const firstPageData = await json(firstPageResponse);

    expect(firstPageResponse.status).toBe(200);
    expect(firstPageData.pagination).toEqual({ limit: 2, offset: 0 });
    expect(firstPageData.posts.map((post) => post.body)).toEqual(['Newest post', 'Middle post']);

    const secondPageResponse = await request('/api/posts?limit=2&offset=2', {
      headers: { Cookie: cookie },
    });
    const secondPageData = await json(secondPageResponse);

    expect(secondPageResponse.status).toBe(200);
    expect(secondPageData.pagination).toEqual({ limit: 2, offset: 2 });
    expect(secondPageData.posts.map((post) => post.body)).toEqual(['Oldest post']);
  });

  test('clamps invalid pagination values to safe bounds', async () => {
    const { cookie } = await registerUser();
    await Promise.all([
      createPost(cookie, 'Post 1'),
      createPost(cookie, 'Post 2'),
      createPost(cookie, 'Post 3'),
    ]);

    const invalidResponse = await request('/api/posts?limit=-10&offset=-5', {
      headers: { Cookie: cookie },
    });
    const invalidData = await json(invalidResponse);

    expect(invalidResponse.status).toBe(200);
    expect(invalidData.pagination).toEqual({ limit: 1, offset: 0 });
    expect(invalidData.posts).toHaveLength(1);

    const tooLargeResponse = await request('/api/posts?limit=999&offset=0', {
      headers: { Cookie: cookie },
    });
    const tooLargeData = await json(tooLargeResponse);

    expect(tooLargeResponse.status).toBe(200);
    expect(tooLargeData.pagination).toEqual({ limit: 50, offset: 0 });
  });

  test('returns at most five oldest comments per post', async () => {
    const { cookie } = await registerUser();
    const post = await createPost(cookie, 'Post with many comments');

    for (let index = 1; index <= 6; index += 1) {
      await createComment(cookie, post.data.post.id, `Comment ${index}`);
    }

    const response = await request('/api/posts', {
      headers: { Cookie: cookie },
    });
    const data = await json(response);

    expect(response.status).toBe(200);
    expect(data.posts).toHaveLength(1);
    expect(data.posts[0].comments).toHaveLength(5);
    expect(data.posts[0].comments.map((comment) => comment.body)).toEqual([
      'Comment 1',
      'Comment 2',
      'Comment 3',
      'Comment 4',
      'Comment 5',
    ]);
  });
});
