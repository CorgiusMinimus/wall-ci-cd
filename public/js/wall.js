const state = {
  currentUser: null,
  posts: [],
  editingPostId: null,
  deletingPostId: null,
  editingCommentId: null,
  deletingCommentId: null,
};

const postElements = new Map();
const postsById = new Map();
const commentsById = new Map();
const commentPostIds = new Map();

const logoutButton = document.getElementById('logout-button');
const currentUserAvatar = document.getElementById('current-user-avatar');
const currentUserName = document.getElementById('current-user-name');
const currentUserUsername = document.getElementById('current-user-username');
const postForm = document.getElementById('post-form');
const postBody = document.getElementById('post-body');
const postSubmit = document.getElementById('post-submit');
const postAlert = document.getElementById('post-alert');
const postAlertMessage = document.getElementById('post-alert-message');
const refreshButton = document.getElementById('refresh-button');
const feedState = document.getElementById('feed-state');
const postList = document.getElementById('post-list');

function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '--';
}

function formatRelativeTime(dateValue) {
  const date = new Date(dateValue);
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

function isEdited(post) {
  return new Date(post.updatedAt).getTime() > new Date(post.createdAt).getTime() + 1000;
}

function showPostError(message) {
  postAlertMessage.textContent = message;
  postAlert.classList.remove('hidden');
}

function hidePostError() {
  postAlertMessage.textContent = '';
  postAlert.classList.add('hidden');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Request failed.');
  }

  return data;
}

async function loadCurrentUser() {
  try {
    const data = await fetchJson('/api/auth/me');
    state.currentUser = data.user;
    currentUserAvatar.textContent = initials(data.user.displayName);
    currentUserName.textContent = data.user.displayName;
    currentUserUsername.textContent = `@${data.user.username}`;
  } catch (error) {
    window.location.href = '/';
  }
}

async function loadPosts() {
  feedState.textContent = 'Loading posts...';
  feedState.classList.remove('hidden');

  try {
    const data = await fetchJson('/api/posts');
    state.posts = data.posts;
    rebuildStateIndexes();
    renderPosts();
  } catch (error) {
    feedState.textContent = error.message;
  }
}

function rebuildStateIndexes() {
  postsById.clear();
  commentsById.clear();
  commentPostIds.clear();

  state.posts.forEach((post) => {
    postsById.set(post.id, post);
    post.comments.forEach((comment) => {
      commentsById.set(comment.id, comment);
      commentPostIds.set(comment.id, post.id);
    });
  });
}

function updateFeedState() {
  if (state.posts.length === 0) {
    feedState.textContent = 'No posts yet. Start the conversation.';
    feedState.classList.remove('hidden');
    return;
  }

  feedState.classList.add('hidden');
}

function postSignature(post) {
  const postUiState = {
    editingPost: state.editingPostId === post.id,
    deletingPost: state.deletingPostId === post.id,
    editingComment: commentPostIds.get(state.editingCommentId) === post.id
      ? state.editingCommentId
      : null,
    deletingComment: commentPostIds.get(state.deletingCommentId) === post.id
      ? state.deletingCommentId
      : null,
  };

  return JSON.stringify({ post, postUiState });
}

function renderPosts() {
  updateFeedState();

  if (state.posts.length === 0) {
    for (const { element } of postElements.values()) {
      element.remove();
    }
    postElements.clear();
    return;
  }

  const nextPostIds = new Set();

  state.posts.forEach((post) => {
    nextPostIds.add(post.id);
    const signature = postSignature(post);
    const cached = postElements.get(post.id);

    if (cached?.signature === signature) {
      postList.append(cached.element);
      return;
    }

    const article = renderPostElement(post);
    postElements.set(post.id, { element: article, signature });

    if (cached) {
      cached.element.replaceWith(article);
    } else {
      postList.append(article);
    }
  });

  for (const [postId, cached] of postElements.entries()) {
    if (!nextPostIds.has(postId)) {
      cached.element.remove();
      postElements.delete(postId);
    }
  }
}

function rerenderPost(postId) {
  updateFeedState();
  const post = postsById.get(postId);
  const cached = postElements.get(postId);

  if (!post) {
    if (cached) {
      cached.element.remove();
      postElements.delete(postId);
    }
    return;
  }

  const article = renderPostElement(post);
  postElements.set(postId, { element: article, signature: postSignature(post) });

  if (cached) {
    cached.element.replaceWith(article);
  } else {
    renderPosts();
  }
}

function removePostNode(postId) {
  const cached = postElements.get(postId);
  if (cached) {
    cached.element.remove();
    postElements.delete(postId);
  }
  updateFeedState();
}

function findPostByCommentId(commentId) {
  return postsById.get(commentPostIds.get(commentId));
}

function renderPostElement(post) {
    const isOwner = post.userId === state.currentUser.id;
    const isEditing = state.editingPostId === post.id;
    const isDeleting = state.deletingPostId === post.id;
    const article = document.createElement('article');
    article.className = 'post-card';

    const header = document.createElement('header');
    header.className = 'post-header';

    const authorGroup = document.createElement('div');
    authorGroup.className = 'user-row';

    const avatar = document.createElement('div');
    avatar.className = 'avatar avatar-small';
    avatar.textContent = initials(post.author.displayName);

    const authorText = document.createElement('div');
    const nameLine = document.createElement('div');
    nameLine.className = 'name-line';

    const displayName = document.createElement('strong');
    displayName.textContent = post.author.displayName;

    const username = document.createElement('span');
    username.textContent = `@${post.author.username}`;

    nameLine.append(displayName, username);

    const meta = document.createElement('p');
    meta.className = 'post-meta';
    meta.textContent = `${formatRelativeTime(post.createdAt)}${isEdited(post) ? ' (edited)' : ''}`;

    authorText.append(nameLine, meta);
    authorGroup.append(avatar, authorText);
    header.append(authorGroup);

    if (isOwner) {
      const actions = document.createElement('div');
      actions.className = 'post-actions';

      const editButton = document.createElement('button');
      editButton.className = 'text-button';
      editButton.type = 'button';
      editButton.textContent = isEditing ? 'Editing...' : 'Edit';
      editButton.disabled = isEditing;
      editButton.addEventListener('click', () => startEditingPost(post.id));

      const separator = document.createElement('span');
      separator.className = 'action-separator';
      separator.textContent = '•';

      const deleteButton = document.createElement('button');
      deleteButton.className = isDeleting ? 'text-button danger active' : 'text-button danger';
      deleteButton.type = 'button';
      deleteButton.textContent = 'Delete';
      deleteButton.disabled = isEditing;
      deleteButton.addEventListener('click', () => startDeletingPost(post.id));

      actions.append(editButton, separator, deleteButton);
      header.append(actions);
    }

    const content = isEditing ? renderPostEditForm(post) : renderPostBody(post);

    const footer = document.createElement('footer');
    footer.className = 'post-footer';
    footer.textContent = post.userId === state.currentUser.id ? 'Your post' : 'Feedline Core';

    article.append(header);

    if (isDeleting) {
      article.append(renderPostDeleteConfirmation(post));
    }

    article.append(content, renderCommentsSection(post), footer);
    return article;
}

function renderPostBody(post) {
  const body = document.createElement('p');
  body.className = 'post-body';
  body.textContent = post.body;
  return body;
}

function renderPostEditForm(post) {
  const form = document.createElement('form');
  form.className = 'inline-edit-form';

  const label = document.createElement('label');
  label.textContent = 'Editing post content';

  const textarea = document.createElement('textarea');
  textarea.value = post.body;
  textarea.rows = 3;
  textarea.maxLength = 2000;
  textarea.required = true;

  const error = document.createElement('p');
  error.className = 'inline-error hidden';

  const actions = document.createElement('div');
  actions.className = 'inline-edit-actions';

  const cancelButton = document.createElement('button');
  cancelButton.className = 'secondary-button';
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => cancelEditingPost());

  const saveButton = document.createElement('button');
  saveButton.className = 'primary-button';
  saveButton.type = 'submit';
  saveButton.textContent = 'Save';

  actions.append(cancelButton, saveButton);
  form.append(label, textarea, error, actions);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await savePostEdit(post.id, textarea.value, saveButton, error);
  });

  setTimeout(() => textarea.focus(), 0);
  return form;
}

function startEditingPost(postId) {
  const previousPostId = state.editingPostId || state.deletingPostId;
  state.editingPostId = postId;
  state.deletingPostId = null;
  if (previousPostId && previousPostId !== postId) rerenderPost(previousPostId);
  rerenderPost(postId);
}

function cancelEditingPost() {
  const postId = state.editingPostId;
  state.editingPostId = null;
  if (postId) rerenderPost(postId);
}

function renderPostDeleteConfirmation(post) {
  const container = document.createElement('div');
  container.className = 'delete-confirmation';

  const copy = document.createElement('div');

  const title = document.createElement('strong');
  title.textContent = 'Delete this post?';

  const message = document.createElement('p');
  message.textContent = 'This will permanently remove the post and any comments attached to it.';

  const error = document.createElement('p');
  error.className = 'inline-error hidden';

  copy.append(title, message, error);

  const actions = document.createElement('div');
  actions.className = 'inline-edit-actions';

  const cancelButton = document.createElement('button');
  cancelButton.className = 'secondary-button';
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', cancelDeletingPost);

  const deleteButton = document.createElement('button');
  deleteButton.className = 'danger-button';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', () => deletePost(post.id, deleteButton, error));

  actions.append(cancelButton, deleteButton);
  container.append(copy, actions);

  return container;
}

function startDeletingPost(postId) {
  const previousPostId = state.editingPostId || state.deletingPostId;
  state.deletingPostId = postId;
  state.editingPostId = null;
  if (previousPostId && previousPostId !== postId) rerenderPost(previousPostId);
  rerenderPost(postId);
}

function cancelDeletingPost() {
  const postId = state.deletingPostId;
  state.deletingPostId = null;
  if (postId) rerenderPost(postId);
}

async function deletePost(postId, deleteButton, errorElement) {
  deleteButton.disabled = true;
  deleteButton.textContent = 'Deleting...';
  errorElement.classList.add('hidden');

  try {
    await fetchJson(`/api/posts/${postId}`, { method: 'DELETE' });
    const post = postsById.get(postId);
    state.posts = state.posts.filter((post) => post.id !== postId);
    post?.comments.forEach((comment) => {
      commentsById.delete(comment.id);
      commentPostIds.delete(comment.id);
    });
    postsById.delete(postId);
    state.deletingPostId = null;
    removePostNode(postId);
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.classList.remove('hidden');
  } finally {
    deleteButton.disabled = false;
    deleteButton.textContent = 'Delete';
  }
}

async function savePostEdit(postId, bodyValue, saveButton, errorElement) {
  const body = bodyValue.trim();

  if (!body) {
    errorElement.textContent = 'Post body is required.';
    errorElement.classList.remove('hidden');
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = 'Saving...';
  errorElement.classList.add('hidden');

  try {
    const data = await fetchJson(`/api/posts/${postId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });

    const post = postsById.get(postId);
    if (post) {
      Object.assign(post, data.post, { comments: post.comments });
    }
    state.editingPostId = null;
    rerenderPost(postId);
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.classList.remove('hidden');
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save';
  }
}

function renderCommentsSection(post) {
  const section = document.createElement('section');
  section.className = 'comments-section';
  section.setAttribute('aria-label', `Comments for post ${post.id}`);

  const header = document.createElement('div');
  header.className = 'comments-header';

  const count = document.createElement('span');
  const commentCount = post.comments.length;
  count.textContent = `${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`;

  header.append(count);
  section.append(header);

  const list = document.createElement('div');
  list.className = 'comment-list';

  post.comments.forEach((comment) => {
    list.append(renderComment(comment));
  });

  section.append(list, renderCommentForm(post.id));
  return section;
}

function renderComment(comment) {
  const isOwner = comment.userId === state.currentUser.id;
  const isEditing = state.editingCommentId === comment.id;
  const isDeleting = state.deletingCommentId === comment.id;
  const container = document.createElement('article');
  container.className = 'comment-card';

  const header = document.createElement('header');
  header.className = 'comment-header';

  const authorLine = document.createElement('div');
  authorLine.className = 'name-line';

  const displayName = document.createElement('strong');
  displayName.textContent = comment.author.displayName;

  const username = document.createElement('span');
  username.textContent = `@${comment.author.username}`;

  if (comment.userId === state.currentUser.id) {
    const ownerBadge = document.createElement('span');
    ownerBadge.className = 'owner-badge';
    ownerBadge.textContent = 'You';
    authorLine.append(displayName, username, ownerBadge);
  } else {
    authorLine.append(displayName, username);
  }

  const headerRight = document.createElement('div');
  headerRight.className = 'comment-actions';

  if (isOwner) {
    const editButton = document.createElement('button');
    editButton.className = 'text-button';
    editButton.type = 'button';
    editButton.textContent = isEditing ? 'Editing...' : 'Edit';
    editButton.disabled = isEditing;
    editButton.addEventListener('click', () => startEditingComment(comment.id));

    const separator = document.createElement('span');
    separator.className = 'action-separator';
    separator.textContent = '•';

    const deleteButton = document.createElement('button');
    deleteButton.className = isDeleting ? 'text-button danger active' : 'text-button danger';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.disabled = isEditing;
    deleteButton.addEventListener('click', () => startDeletingComment(comment.id));

    headerRight.append(editButton, separator, deleteButton);
  }

  const time = document.createElement('span');
  time.className = 'comment-time';
  time.textContent = `${formatRelativeTime(comment.createdAt)}${isEdited(comment) ? ' (edited)' : ''}`;
  headerRight.append(time);

  header.append(authorLine, headerRight);

  const body = isEditing ? renderCommentEditForm(comment) : renderCommentBody(comment);

  container.append(header, body);

  if (isDeleting) {
    container.append(renderCommentDeleteConfirmation(comment));
  }

  return container;
}

function renderCommentBody(comment) {
  const body = document.createElement('p');
  body.className = 'comment-body';
  body.textContent = comment.body;
  return body;
}

function renderCommentEditForm(comment) {
  const form = document.createElement('form');
  form.className = 'comment-edit-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = comment.body;
  input.maxLength = 1000;
  input.required = true;
  input.setAttribute('aria-label', 'Edit comment');

  const saveButton = document.createElement('button');
  saveButton.className = 'primary-button';
  saveButton.type = 'submit';
  saveButton.textContent = 'Save';

  const cancelButton = document.createElement('button');
  cancelButton.className = 'secondary-button';
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', cancelEditingComment);

  const error = document.createElement('p');
  error.className = 'inline-error hidden comment-error';

  form.append(input, saveButton, cancelButton, error);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveCommentEdit(comment.id, input.value, saveButton, error);
  });

  setTimeout(() => input.focus(), 0);
  return form;
}

function startEditingComment(commentId) {
  const previousPost = state.editingCommentId
    ? findPostByCommentId(state.editingCommentId)
    : state.deletingCommentId
      ? findPostByCommentId(state.deletingCommentId)
      : state.editingPostId || state.deletingPostId
        ? postsById.get(state.editingPostId || state.deletingPostId)
      : null;
  state.editingCommentId = commentId;
  state.deletingCommentId = null;
  state.editingPostId = null;
  state.deletingPostId = null;
  const nextPost = findPostByCommentId(commentId);
  if (previousPost && previousPost.id !== nextPost?.id) rerenderPost(previousPost.id);
  if (nextPost) rerenderPost(nextPost.id);
}

function cancelEditingComment() {
  const post = findPostByCommentId(state.editingCommentId);
  state.editingCommentId = null;
  if (post) rerenderPost(post.id);
}

function renderCommentDeleteConfirmation(comment) {
  const container = document.createElement('div');
  container.className = 'comment-delete-confirmation';

  const message = document.createElement('p');
  message.textContent = 'Delete this comment?';

  const error = document.createElement('p');
  error.className = 'inline-error hidden comment-error';

  const actions = document.createElement('div');
  actions.className = 'comment-delete-actions';

  const cancelButton = document.createElement('button');
  cancelButton.className = 'secondary-button';
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', cancelDeletingComment);

  const deleteButton = document.createElement('button');
  deleteButton.className = 'danger-button';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', () => deleteComment(comment.id, deleteButton, error));

  actions.append(cancelButton, deleteButton);
  container.append(message, actions, error);
  return container;
}

function startDeletingComment(commentId) {
  const previousPost = state.editingCommentId
    ? findPostByCommentId(state.editingCommentId)
    : state.deletingCommentId
      ? findPostByCommentId(state.deletingCommentId)
      : state.editingPostId || state.deletingPostId
        ? postsById.get(state.editingPostId || state.deletingPostId)
      : null;
  state.deletingCommentId = commentId;
  state.editingCommentId = null;
  state.editingPostId = null;
  state.deletingPostId = null;
  const nextPost = findPostByCommentId(commentId);
  if (previousPost && previousPost.id !== nextPost?.id) rerenderPost(previousPost.id);
  if (nextPost) rerenderPost(nextPost.id);
}

function cancelDeletingComment() {
  const post = findPostByCommentId(state.deletingCommentId);
  state.deletingCommentId = null;
  if (post) rerenderPost(post.id);
}

async function deleteComment(commentId, deleteButton, errorElement) {
  deleteButton.disabled = true;
  deleteButton.textContent = 'Deleting...';
  errorElement.classList.add('hidden');

  try {
    await fetchJson(`/api/comments/${commentId}`, { method: 'DELETE' });

    const post = findPostByCommentId(commentId);
    if (post) {
      const commentIndex = post.comments.findIndex((comment) => comment.id === commentId);
      if (commentIndex !== -1) {
        post.comments.splice(commentIndex, 1);
      }
    }
    commentsById.delete(commentId);
    commentPostIds.delete(commentId);

    state.deletingCommentId = null;
    if (post) rerenderPost(post.id);
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.classList.remove('hidden');
  } finally {
    deleteButton.disabled = false;
    deleteButton.textContent = 'Delete';
  }
}

async function saveCommentEdit(commentId, bodyValue, saveButton, errorElement) {
  const body = bodyValue.trim();

  if (!body) {
    errorElement.textContent = 'Comment body is required.';
    errorElement.classList.remove('hidden');
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = 'Saving...';
  errorElement.classList.add('hidden');

  try {
    const data = await fetchJson(`/api/comments/${commentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });

    const post = findPostByCommentId(commentId);
    if (post) {
      const comment = commentsById.get(commentId);
      if (comment) {
        Object.assign(comment, data.comment, {
          postId: comment.postId,
          createdAt: comment.createdAt,
        });
      }
    }

    state.editingCommentId = null;
    if (post) rerenderPost(post.id);
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.classList.remove('hidden');
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save';
  }
}

function renderCommentForm(postId) {
  const form = document.createElement('form');
  form.className = 'comment-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'body';
  input.maxLength = 1000;
  input.placeholder = 'Write a comment...';
  input.setAttribute('aria-label', 'Write a comment');

  const button = document.createElement('button');
  button.className = 'secondary-button';
  button.type = 'submit';
  button.textContent = 'Comment';

  const error = document.createElement('p');
  error.className = 'inline-error hidden comment-error';

  form.append(input, button, error);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await createComment(postId, input, button, error);
  });

  return form;
}

async function createComment(postId, input, button, errorElement) {
  const body = input.value.trim();

  if (!body) {
    errorElement.textContent = 'Comment body is required.';
    errorElement.classList.remove('hidden');
    return;
  }

  button.disabled = true;
  button.textContent = 'Posting...';
  errorElement.classList.add('hidden');

  try {
    const data = await fetchJson(`/api/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });

    const post = postsById.get(postId);
    if (post) {
      post.comments.push(data.comment);
      commentsById.set(data.comment.id, data.comment);
      commentPostIds.set(data.comment.id, postId);
    }

    if (post) rerenderPost(postId);
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.classList.remove('hidden');
  } finally {
    button.disabled = false;
    button.textContent = 'Comment';
  }
}

async function createPost(event) {
  event.preventDefault();
  hidePostError();

  const body = postBody.value.trim();
  if (!body) {
    showPostError('Post body is required.');
    return;
  }

  postSubmit.disabled = true;
  postSubmit.textContent = 'Posting...';

  try {
    const data = await fetchJson('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });

    state.posts.unshift(data.post);
    postsById.set(data.post.id, data.post);
    postBody.value = '';
    renderPosts();
  } catch (error) {
    showPostError(error.message);
  } finally {
    postSubmit.disabled = false;
    postSubmit.textContent = 'Post';
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

logoutButton.addEventListener('click', logout);
refreshButton.addEventListener('click', loadPosts);
postForm.addEventListener('submit', createPost);

async function init() {
  await loadCurrentUser();
  await loadPosts();
}

init();
