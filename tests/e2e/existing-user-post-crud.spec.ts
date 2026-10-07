import { test, expect } from '@playwright/test';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env.test') });

const password = 'password123';
let connection: mysql.Connection;
let userId: number;
let username: string;
let email: string;
let displayName: string;

async function ensureTestSchema() {
  const database = process.env.DB_NAME || 'feedline_wall_e2e';
  const bootstrapConnection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });

  await bootstrapConnection.execute(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  await bootstrapConnection.end();

  connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database,
  });

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      display_name VARCHAR(100) NOT NULL,
      username VARCHAR(50) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_posts_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      post_id INT NOT NULL,
      user_id INT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_comments_post
        FOREIGN KEY (post_id) REFERENCES posts(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_comments_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);
}

async function seedExistingUser() {
  const suffix = `${Date.now()}-${test.info().workerIndex}`.replace(/[^A-Za-z0-9_]/g, '_');
  username = `existing_${suffix}`;
  email = `existing.${suffix}@example.com`;
  displayName = 'Existing Playwright User';

  const passwordHash = await bcrypt.hash(password, 10);
  const [result] = await connection.execute<mysql.ResultSetHeader>(
    'INSERT INTO users (display_name, username, email, password_hash) VALUES (?, ?, ?, ?)',
    [displayName, username, email, passwordHash]
  );

  userId = result.insertId;
}

async function cleanupSeededUser() {
  if (connection && userId) {
    await connection.execute('DELETE FROM users WHERE id = ?', [userId]);
  }
}

test.describe('Existing user post management', () => {
  test.beforeAll(async () => {
    await ensureTestSchema();
  });

  test.beforeEach(async () => {
    await seedExistingUser();
  });

  test.afterEach(async () => {
    await cleanupSeededUser();
  });

  test.afterAll(async () => {
    await connection?.end();
  });

  test('should allow an existing user to create, edit, and delete their own post', async ({ page }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const originalBody = `E2E post created by existing user ${suffix}`;
    const updatedBody = `E2E post edited by existing user ${suffix}`;

    await page.goto('/');
    await page.locator('#identifier').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('#submit-button').click();

    await expect(page).toHaveURL(/\/wall\.html$/);
    await expect(page.locator('#current-user-name')).toHaveText(displayName);
    await expect(page.locator('#current-user-username')).toHaveText(`@${username}`);

    await page.locator('#post-body').fill(originalBody);
    await page.locator('#post-submit').click();

    const createdPost = page.locator('.post-card').filter({ hasText: originalBody }).first();
    await expect(createdPost).toBeVisible();
    await expect(createdPost.getByText('Your post')).toBeVisible();
    await expect(createdPost.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(createdPost.getByRole('button', { name: 'Delete' })).toBeVisible();

    await createdPost.getByRole('button', { name: 'Edit' }).click();
    const editForm = page.locator('.inline-edit-form').filter({ has: page.locator('textarea') });
    await editForm.locator('textarea').fill(updatedBody);
    await editForm.getByRole('button', { name: 'Save' }).click();

    const updatedPost = page.locator('.post-card').filter({ hasText: updatedBody }).first();
    await expect(updatedPost).toBeVisible();
    await expect(page.getByText(originalBody)).toHaveCount(0);

    await updatedPost.getByRole('button', { name: 'Delete' }).click();
    await expect(updatedPost.getByText('Delete this post?')).toBeVisible();
    await updatedPost.locator('.delete-confirmation').getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText(updatedBody)).toHaveCount(0);
  });
});
