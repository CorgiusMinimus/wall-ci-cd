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
        created_at: new Date(`2026-01-01T00:00:0${id}.000Z`),
        updated_at: new Date(`2026-01-01T00:00:0${id}.000Z`),
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
        created_at: new Date(`2026-01-01T00:01:0${id}.000Z`),
        updated_at: new Date(`2026-01-01T00:01:0${id}.000Z`),
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

    if (sql.includes('UPDATE comments SET body = ? WHERE id = ? AND user_id = ?')) {
      const [body, commentId, userId] = params;
      const comment = mockComments.find((candidate) => candidate.id === commentId && candidate.user_id === userId);

      if (!comment) {
        return [{ affectedRows: 0 }];
      }

      comment.body = body;
      comment.updated_at = new Date('2026-01-01T00:02:00.000Z');
      return [{ affectedRows: 1 }];
    }

    if (sql.includes('DELETE FROM comments WHERE id = ? AND user_id = ?')) {
      const [commentId, userId] = params;
      const commentIndex = mockComments.findIndex((candidate) => candidate.id === commentId && candidate.user_id === userId);

      if (commentIndex === -1) {
        return [{ affectedRows: 0 }];
      }

      mockComments.splice(commentIndex, 1);
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
      displayName: 'Comment Author',
      username: 'commentauthor',
      email: 'comment.author@example.com',
      password: 'password123',
      ...overrides,
    }),
  });

  return { response, cookie: sessionCookie(response), data: await json(response) };
}

async function createPost(cookie, body = 'Post for comments') {
  const response = await request('/api/posts', {
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

describe('comment CRUD integration', () => {
  test('a logged-in user can create, read, update, and delete their own comment', async () => {
    const { cookie } = await registerUser();
    const post = await createPost(cookie);

    expect(post.response.status).toBe(201);

    const createCommentResponse = await request('/api/posts/1/comments', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: JSON.stringify({ body: '  My first comment  ' }),
    });
    const createCommentData = await json(createCommentResponse);

    expect(createCommentResponse.status).toBe(201);
    expect(createCommentData.comment).toEqual(expect.objectContaining({
      id: 1,
      postId: 1,
      userId: 1,
      body: 'My first comment',
      author: expect.objectContaining({
        id: 1,
        displayName: 'Comment Author',
        username: 'commentauthor',
      }),
    }));

    const listResponse = await request('/api/posts', {
      headers: { Cookie: cookie },
    });
    const listData = await json(listResponse);

    expect(listResponse.status).toBe(200);
    expect(listData.posts).toHaveLength(1);
    expect(listData.posts[0].comments).toEqual([
      expect.objectContaining({
        id: 1,
        postId: 1,
        userId: 1,
        body: 'My first comment',
        author: expect.objectContaining({
          id: 1,
          displayName: 'Comment Author',
          username: 'commentauthor',
        }),
      }),
    ]);

    const updateCommentResponse = await request('/api/comments/1', {
      method: 'PUT',
      headers: { Cookie: cookie },
      body: JSON.stringify({ body: '  Updated comment  ' }),
    });
    const updateCommentData = await json(updateCommentResponse);

    expect(updateCommentResponse.status).toBe(200);
    expect(updateCommentData.comment).toEqual(expect.objectContaining({
      id: 1,
      userId: 1,
      body: 'Updated comment',
      updatedAt: expect.any(String),
      author: expect.objectContaining({
        id: 1,
        displayName: 'Comment Author',
        username: 'commentauthor',
      }),
    }));

    const updatedListResponse = await request('/api/posts', {
      headers: { Cookie: cookie },
    });
    const updatedListData = await json(updatedListResponse);

    expect(updatedListResponse.status).toBe(200);
    expect(updatedListData.posts[0].comments).toHaveLength(1);
    expect(updatedListData.posts[0].comments[0]).toEqual(expect.objectContaining({
      id: 1,
      body: 'Updated comment',
    }));

    const deleteCommentResponse = await request('/api/comments/1', {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    const deleteCommentData = await json(deleteCommentResponse);

    expect(deleteCommentResponse.status).toBe(200);
    expect(deleteCommentData).toEqual({ message: 'Comment deleted.' });

    const emptyCommentsResponse = await request('/api/posts', {
      headers: { Cookie: cookie },
    });
    const emptyCommentsData = await json(emptyCommentsResponse);

    expect(emptyCommentsResponse.status).toBe(200);
    expect(emptyCommentsData.posts[0].comments).toEqual([]);
  });
});
