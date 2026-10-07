function safeUser(user) {
  return {
    id: user.id,
    displayName: user.display_name,
    username: user.username,
    email: user.email,
    createdAt: user.created_at,
  };
}

function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUsername(username) {
  return /^[a-z0-9_]{3,50}$/.test(username);
}

module.exports = {
  safeUser,
  normalizeUsername,
  normalizeEmail,
  isValidEmail,
  isValidUsername,
};
