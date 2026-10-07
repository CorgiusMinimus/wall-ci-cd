const { commentUpdateFromRequest } = require('../routes/comment-helpers');

describe('comment route helpers', () => {
  test('commentUpdateFromRequest builds an updated comment response from the current session user', () => {
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

    const result = commentUpdateFromRequest(req, 20, 'Updated comment');

    expect(result).toEqual({
      id: 20,
      userId: 3,
      body: 'Updated comment',
      updatedAt: expect.any(String),
      author: {
        id: 3,
        displayName: 'Grace Hopper',
        username: 'grace',
      },
    });
  });

  test('commentUpdateFromRequest falls back to session userId when cached user details are missing', () => {
    const req = { session: { userId: 3 } };

    const result = commentUpdateFromRequest(req, 20, 'Updated comment');

    expect(result).toEqual({
      id: 20,
      userId: 3,
      body: 'Updated comment',
      updatedAt: expect.any(String),
      author: {
        id: 3,
        displayName: undefined,
        username: undefined,
      },
    });
  });
});
