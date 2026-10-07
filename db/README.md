# Database Setup

1. Create a local `.env` file from `.env.example`.
2. Update the `DB_*` values for your MySQL server.
3. Run the schema:

```bash
mysql -u root -p < db/schema.sql
```

If your `.env` uses a different database name, update the first two lines of `db/schema.sql` before running it.
