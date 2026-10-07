function mapPost(row) {
  return {
    id: row.id,
    userId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: {
      id: row.author_id,
      displayName: row.display_name,
      username: row.username,
    },
    comments: [],
  };
}

function mapComment(row) {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: {
      id: row.author_id,
      displayName: row.display_name,
      username: row.username,
    },
  };
}

function currentUser(req) {
  return req.session.user || { id: req.session.userId };
}

function postFromRequest(req, id, body, timestamps = {}) {
  const user = currentUser(req);
  const now = new Date().toISOString();

  return {
    id,
    userId: req.session.userId,
    body,
    createdAt: timestamps.createdAt || now,
    updatedAt: timestamps.updatedAt || now,
    author: {
      id: user.id,
      displayName: user.displayName,
      username: user.username,
    },
    comments: [],
  };
}

function commentFromRequest(req, id, postId, body, timestamps = {}) {
  const user = currentUser(req);
  const now = new Date().toISOString();

  return {
    id,
    postId,
    userId: req.session.userId,
    body,
    createdAt: timestamps.createdAt || now,
    updatedAt: timestamps.updatedAt || now,
    author: {
      id: user.id,
      displayName: user.displayName,
      username: user.username,
    },
  };
}

module.exports = {
  mapPost,
  mapComment,
  postFromRequest,
  commentFromRequest,
};
