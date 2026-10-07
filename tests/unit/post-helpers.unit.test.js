const {
  mapPost,
  mapComment,
  postFromRequest,
  commentFromRequest,
} = require('../../routes/post-helpers');

describe('post route helpers', () => {
  test('mapPost maps database row fields to the public post shape', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-01T00:01:00.000Z');

    expect(mapPost({
      id: 10,
      user_id: 2,
      body: 'Hello wall',
      created_at: createdAt,
      updated_at: updatedAt,
      author_id: 2,
      display_name: 'Ada Lovelace',
      username: 'ada',
    })).toEqual({
      id: 10,
      userId: 2,
      body: 'Hello wall',
      createdAt,
      updatedAt,
      author: {
        id: 2,
        displayName: 'Ada Lovelace',
        username: 'ada',
      },
      comments: [],
    });
  });

  test('mapComment maps database row fields to the public comment shape', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-01T00:01:00.000Z');

    expect(mapComment({
      id: 20,
      post_id: 10,
      user_id: 3,
      body: 'Nice post',
      created_at: createdAt,
      updated_at: updatedAt,
      author_id: 3,
      display_name: 'Grace Hopper',
      username: 'grace',
    })).toEqual({
      id: 20,
      postId: 10,
      userId: 3,
      body: 'Nice post',
      createdAt,
      updatedAt,
      author: {
        id: 3,
        displayName: 'Grace Hopper',
        username: 'grace',
      },
    });
  });

  test('postFromRequest builds a created post response from the current session user', () => {
    const req = {
      session: {
        userId: 2,
        user: {
          id: 2,
          displayName: 'Ada Lovelace',
          username: 'ada',
        },
      },
    };

    expect(postFromRequest(req, 10, 'Hello wall', {
      createdAt: 'created-time',
      updatedAt: 'updated-time',
    })).toEqual({
      id: 10,
      userId: 2,
      body: 'Hello wall',
      createdAt: 'created-time',
      updatedAt: 'updated-time',
      author: {
        id: 2,
        displayName: 'Ada Lovelace',
        username: 'ada',
      },
      comments: [],
    });
  });

  test('commentFromRequest builds a created comment response from the current session user', () => {
    const req = {
      session: {
        userId: 3,
        user: {
          id: 3,
          displayName: 'Grace Hopper',
          username: 'grace',
        },
      },
    };

    expect(commentFromRequest(req, 20, 10, 'Nice post', {
      createdAt: 'created-time',
      updatedAt: 'updated-time',
    })).toEqual({
      id: 20,
      postId: 10,
      userId: 3,
      body: 'Nice post',
      createdAt: 'created-time',
      updatedAt: 'updated-time',
      author: {
        id: 3,
        displayName: 'Grace Hopper',
        username: 'grace',
      },
    });
  });
});
