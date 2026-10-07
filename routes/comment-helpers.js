function currentUser(req) {
  return req.session.user || { id: req.session.userId };
}

function commentUpdateFromRequest(req, id, body) {
  const user = currentUser(req);

  return {
    id,
    userId: req.session.userId,
    body,
    updatedAt: new Date().toISOString(),
    author: {
      id: user.id,
      displayName: user.displayName,
      username: user.username,
    },
  };
}

module.exports = { commentUpdateFromRequest };
