const {
  safeUser,
  normalizeUsername,
  normalizeEmail,
  isValidEmail,
  isValidUsername,
} = require('../../routes/auth-helpers');

describe('auth helpers', () => {
  describe('safeUser', () => {
    test('maps database user fields to the public API user shape', () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const user = {
        id: 1,
        display_name: 'Ada Lovelace',
        username: 'ada',
        email: 'ada@example.com',
        password_hash: 'hashed-password',
        created_at: createdAt,
        updated_at: new Date('2026-01-02T00:00:00.000Z'),
      };

      expect(safeUser(user)).toEqual({
        id: 1,
        displayName: 'Ada Lovelace',
        username: 'ada',
        email: 'ada@example.com',
        createdAt,
      });
    });

    test('does not expose password or hash fields', () => {
      const result = safeUser({
        id: 1,
        display_name: 'Ada Lovelace',
        username: 'ada',
        email: 'ada@example.com',
        password: 'plaintext',
        password_hash: 'hashed-password',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
      });

      expect(result.password).toBeUndefined();
      expect(result.password_hash).toBeUndefined();
      expect(result.passwordHash).toBeDefined();
    });
  });

  describe('normalization', () => {
    test('normalizeUsername trims whitespace and lowercases input', () => {
      expect(normalizeUsername('  Mixed_Case_User  ')).toBe('mixed_case_user');
    });

    test('normalizeEmail trims whitespace and lowercases input', () => {
      expect(normalizeEmail('  Ada@Example.COM  ')).toBe('ada@example.com');
    });
  });

  describe('isValidEmail', () => {
    test.each(['ada@example.com', 'ada.lovelace@example.co', 'a+b@example.org'])(
      'accepts valid email %s',
      (email) => {
        expect(isValidEmail(email)).toBe(true);
      }
    );

    test.each(['adaexample.com', 'ada@', '@example.com', 'ada@ example.com', 'ada @example.com'])(
      'rejects invalid email %s',
      (email) => {
        expect(isValidEmail(email)).toBe(false);
      }
    );
  });

  describe('isValidUsername', () => {
    test.each(['abc', 'ada_lovelace', 'user123', 'a'.repeat(50)])(
      'accepts valid username %s',
      (username) => {
        expect(isValidUsername(username)).toBe(true);
      }
    );

    test.each(['ab', 'a'.repeat(51), 'Ada', 'bad-user', 'bad user', 'bad!user'])(
      'rejects invalid username %s',
      (username) => {
        expect(isValidUsername(username)).toBe(false);
      }
    );
  });
});
