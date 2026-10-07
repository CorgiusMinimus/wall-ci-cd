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

    if (sql.includes('UPDATE posts SET body = ? WHERE id = ? AND user_id = ?')) {
      const [body, postId, userId] = params;
      const post = mockPosts.find((candidate) => candidate.id === postId && candidate.user_id === userId);

      if (!post) {
        return [{ affectedRows: 0 }];
      }

      post.body = body;
      post.updated_at = new Date('2026-01-01T00:02:00.000Z');
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

    if (sql.includes('UPDATE comments SET body = ? WHERE id = ? AND user_id = ?')) {
      const [body, commentId, userId] = params;
      const comment = mockComments.find((candidate) => candidate.id === commentId && candidate.user_id === userId);

      if (!comment) {
        return [{ affectedRows: 0 }];
      }

      comment.body = body;
      comment.updated_at = new Date('2026-01-01T00:03:00.000Z');
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

async function registerUser(userNumber) {
  const response = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      displayName: `User ${userNumber}`,
      username: `user${userNumber}`,
      email: `user${userNumber}@example.com`,
      password: 'password123',
    }),
  });

  return { response, cookie: sessionCookie(response), data: await json(response) };
}

async function createPost(cookie, body = 'Original post') {
  const response = await request('/api/posts', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: JSON.stringify({ body }),
  });

  return { response, data: await json(response) };
}

async function createComment(cookie, postId, body = 'Original comment') {
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

describe('ownership enforcement integration', () => {
  test('a user cannot update or delete another user\'s post', async () => {
    const userA = await registerUser(1);
    const userB = await registerUser(2);
    const post = await createPost(userA.cookie, 'User A original post');

    expect(post.response.status).toBe(201);

    const updateResponse = await request('/api/posts/1', {
      method: 'PUT',
      headers: { Cookie: userB.cookie },
      body: JSON.stringify({ body: 'User B attempted update' }),
    });
    const updateData = await json(updateResponse);

    expect(updateResponse.status).toBe(404);
    expect(updateData).toEqual({ error: 'Post not found.' });

    const afterUpdateResponse = await request('/api/posts', {
      headers: { Cookie: userA.cookie },
    });
    const afterUpdateData = await json(afterUpdateResponse);

    expect(afterUpdateResponse.status).toBe(200);
    expect(afterUpdateData.posts).toHaveLength(1);
    expect(afterUpdateData.posts[0]).toEqual(expect.objectContaining({
      id: 1,
      userId: 1,
      body: 'User A original post',
    }));

    const deleteResponse = await request('/api/posts/1', {
      method: 'DELETE',
      headers: { Cookie: userB.cookie },
    });
    const deleteData = await json(deleteResponse);

    expect(deleteResponse.status).toBe(404);
    expect(deleteData).toEqual({ error: 'Post not found.' });

    const afterDeleteResponse = await request('/api/posts', {
      headers: { Cookie: userA.cookie },
    });
    const afterDeleteData = await json(afterDeleteResponse);

    expect(afterDeleteResponse.status).toBe(200);
    expect(afterDeleteData.posts).toHaveLength(1);
    expect(afterDeleteData.posts[0]).toEqual(expect.objectContaining({
      id: 1,
      userId: 1,
      body: 'User A original post',
    }));
  });

  test('a user cannot update or delete another user\'s comment', async () => {
    const userA = await registerUser(1);
    const userB = await registerUser(2);
    const post = await createPost(userA.cookie, 'Post owned by user A');
    const comment = await createComment(userB.cookie, post.data.post.id, 'User B original comment');

    expect(post.response.status).toBe(201);
    expect(comment.response.status).toBe(201);

    const updateResponse = await request('/api/comments/1', {
      method: 'PUT',
      headers: { Cookie: userA.cookie },
      body: JSON.stringify({ body: 'User A attempted update' }),
    });
    const updateData = await json(updateResponse);

    expect(updateResponse.status).toBe(404);
    expect(updateData).toEqual({ error: 'Comment not found.' });

    const afterUpdateResponse = await request('/api/posts', {
      headers: { Cookie: userA.cookie },
    });
    const afterUpdateData = await json(afterUpdateResponse);

    expect(afterUpdateResponse.status).toBe(200);
    expect(afterUpdateData.posts[0].comments).toEqual([
      expect.objectContaining({
        id: 1,
        userId: 2,
        body: 'User B original comment',
      }),
    ]);

    const deleteResponse = await request('/api/comments/1', {
      method: 'DELETE',
      headers: { Cookie: userA.cookie },
    });
    const deleteData = await json(deleteResponse);

    expect(deleteResponse.status).toBe(404);
    expect(deleteData).toEqual({ error: 'Comment not found.' });

    const afterDeleteResponse = await request('/api/posts', {
      headers: { Cookie: userA.cookie },
    });
    const afterDeleteData = await json(afterDeleteResponse);

    expect(afterDeleteResponse.status).toBe(200);
    expect(afterDeleteData.posts[0].comments).toEqual([
      expect.objectContaining({
        id: 1,
        userId: 2,
        body: 'User B original comment',
      }),
    ]);
  });
});
