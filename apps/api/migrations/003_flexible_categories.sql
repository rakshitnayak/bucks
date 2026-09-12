ALTER TABLE categories
DROP CONSTRAINT categories_kind_check;

ALTER TABLE categories
ADD CONSTRAINT categories_kind_check CHECK (kind IN ('income', 'expense', 'both'));

-- Merge same-named income/expense defaults before making categories neutral.
WITH
  ranked AS (
    SELECT
      id,
      first_value(id) OVER (
        PARTITION BY
          workspace_id,
          lower(name),
          COALESCE(wallet_id::text, '')
        ORDER BY
          created_at,
          id
      ) AS keep_id
    FROM
      categories
  ),
  duplicates AS (
    SELECT
      id,
      keep_id
    FROM
      ranked
    WHERE
      id <> keep_id
  )
UPDATE transactions t
SET
  category_id = d.keep_id
FROM
  duplicates d
WHERE
  t.category_id = d.id;

WITH
  ranked AS (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY
          workspace_id,
          lower(name),
          COALESCE(wallet_id::text, '')
        ORDER BY
          created_at,
          id
      ) AS position
    FROM
      categories
  )
DELETE FROM categories c USING ranked r
WHERE
  c.id = r.id
  AND r.position > 1;

DROP INDEX categories_global_unique;

DROP INDEX categories_book_unique;

UPDATE categories
SET
  kind = 'both',
  updated_at = now();

CREATE UNIQUE INDEX categories_global_unique ON categories (workspace_id, lower(name))
WHERE
  wallet_id IS NULL;

CREATE UNIQUE INDEX categories_book_unique ON categories (wallet_id, lower(name))
WHERE
  wallet_id IS NOT NULL;
