const { requireAuth } = require('../../middleware/auth');

function createResponse() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };

  return res;
}

describe('requireAuth middleware', () => {
  test('returns 401 when there is no logged-in user', () => {
    const req = { session: {} };
    const res = createResponse();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'You must be logged in.' });
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next when there is a logged-in user', () => {
    const req = { session: { userId: 1 } };
    const res = createResponse();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
