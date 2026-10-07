const express = require('express');
const pool = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
const {
  mapPost,
  mapComment,
  postFromRequest,
  commentFromRequest,
} = require('./post-helpers');

const router = express.Router();
const COMMENTS_PER_POST_LIMIT = 5;

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const [rows] = await pool.execute(
      `SELECT
        posts.id,
        posts.user_id,
        posts.body,
        posts.created_at,
        posts.updated_at,
        users.id AS author_id,
        users.display_name,
        users.username
      FROM posts
      JOIN users ON users.id = posts.user_id
      ORDER BY posts.created_at DESC, posts.id DESC
      LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const posts = rows.map(mapPost);

    if (posts.length > 0) {
      const postIds = posts.map((post) => post.id);
      const placeholders = postIds.map(() => '?').join(', ');
      const [commentRows] = await pool.execute(
        `SELECT
          ranked_comments.id,
          ranked_comments.post_id,
          ranked_comments.user_id,
          ranked_comments.body,
          ranked_comments.created_at,
          ranked_comments.updated_at,
          ranked_comments.author_id,
          ranked_comments.display_name,
          ranked_comments.username
        FROM (
          SELECT
            comments.id,
            comments.post_id,
            comments.user_id,
            comments.body,
            comments.created_at,
            comments.updated_at,
            users.id AS author_id,
            users.display_name,
            users.username,
            ROW_NUMBER() OVER (
              PARTITION BY comments.post_id
              ORDER BY comments.created_at ASC, comments.id ASC
            ) AS comment_rank
          FROM comments
          JOIN users ON users.id = comments.user_id
          WHERE comments.post_id IN (${placeholders})
        ) AS ranked_comments
        WHERE ranked_comments.comment_rank <= ?
        ORDER BY ranked_comments.post_id ASC, ranked_comments.created_at ASC, ranked_comments.id ASC`,
        [...postIds, COMMENTS_PER_POST_LIMIT]
      );

      const commentsByPostId = new Map();
      commentRows.map(mapComment).forEach((comment) => {
        if (!commentsByPostId.has(comment.postId)) {
          commentsByPostId.set(comment.postId, []);
        }
        commentsByPostId.get(comment.postId).push(comment);
      });

      posts.forEach((post) => {
        post.comments = commentsByPostId.get(post.id) || [];
      });
    }

    res.json({ posts, pagination: { limit, offset } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not load posts.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = String(req.body.body || '').trim();

    if (!body) {
      return res.status(400).json({ error: 'Post body is required.' });
    }

    if (body.length > 2000) {
      return res.status(400).json({ error: 'Posts cannot exceed 2,000 characters.' });
    }

    const [result] = await pool.execute(
      'INSERT INTO posts (user_id, body) VALUES (?, ?)',
      [req.session.userId, body]
    );

    res.status(201).json({ post: postFromRequest(req, result.insertId, body) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not create post.' });
  }
});

router.post('/:postId/comments', async (req, res) => {
  try {
    const postId = Number(req.params.postId);
    const body = String(req.body.body || '').trim();

    if (!Number.isInteger(postId) || postId < 1) {
      return res.status(400).json({ error: 'Invalid post id.' });
    }

    if (!body) {
      return res.status(400).json({ error: 'Comment body is required.' });
    }

    if (body.length > 1000) {
      return res.status(400).json({ error: 'Comments cannot exceed 1,000 characters.' });
    }

    const [result] = await pool.execute(
      'INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)',
      [postId, req.session.userId, body]
    );

    res.status(201).json({ comment: commentFromRequest(req, result.insertId, postId, body) });
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(404).json({ error: 'Post not found.' });
    }

    console.error(error);
    res.status(500).json({ error: 'Could not create comment.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const body = String(req.body.body || '').trim();

    if (!Number.isInteger(postId) || postId < 1) {
      return res.status(400).json({ error: 'Invalid post id.' });
    }

    if (!body) {
      return res.status(400).json({ error: 'Post body is required.' });
    }

    if (body.length > 2000) {
      return res.status(400).json({ error: 'Posts cannot exceed 2,000 characters.' });
    }

    const [result] = await pool.execute(
      'UPDATE posts SET body = ? WHERE id = ? AND user_id = ?',
      [body, postId, req.session.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    res.json({ post: { id: postId, body, updatedAt: new Date().toISOString() } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not update post.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const postId = Number(req.params.id);

    if (!Number.isInteger(postId) || postId < 1) {
      return res.status(400).json({ error: 'Invalid post id.' });
    }

    const [result] = await pool.execute(
      'DELETE FROM posts WHERE id = ? AND user_id = ?',
      [postId, req.session.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    res.json({ message: 'Post deleted.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not delete post.' });
  }
});

module.exports = router;
