const express = require('express');
const pool = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
const { commentUpdateFromRequest } = require('./comment-helpers');

const router = express.Router();

router.use(requireAuth);

router.put('/:id', async (req, res) => {
  try {
    const commentId = Number(req.params.id);
    const body = String(req.body.body || '').trim();

    if (!Number.isInteger(commentId) || commentId < 1) {
      return res.status(400).json({ error: 'Invalid comment id.' });
    }

    if (!body) {
      return res.status(400).json({ error: 'Comment body is required.' });
    }

    if (body.length > 1000) {
      return res.status(400).json({ error: 'Comments cannot exceed 1,000 characters.' });
    }

    const [result] = await pool.execute(
      'UPDATE comments SET body = ? WHERE id = ? AND user_id = ?',
      [body, commentId, req.session.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    res.json({ comment: commentUpdateFromRequest(req, commentId, body) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not update comment.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const commentId = Number(req.params.id);

    if (!Number.isInteger(commentId) || commentId < 1) {
      return res.status(400).json({ error: 'Invalid comment id.' });
    }

    const [result] = await pool.execute(
      'DELETE FROM comments WHERE id = ? AND user_id = ?',
      [commentId, req.session.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    res.json({ message: 'Comment deleted.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not delete comment.' });
  }
});

module.exports = router;
