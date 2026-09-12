ALTER TABLE wallets
ADD COLUMN description TEXT CHECK (
  description IS NULL
  OR char_length(description) <= 240
),
ADD COLUMN icon TEXT NOT NULL DEFAULT '📒',
ADD COLUMN color TEXT NOT NULL DEFAULT '#5f6f52',
ADD COLUMN archived_at TIMESTAMPTZ,
ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE transactions
ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'cash' CHECK (
  payment_mode IN (
    'cash',
    'upi',
    'debit_card',
    'credit_card',
    'bank_transfer',
    'cheque',
    'other'
  )
),
ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE categories
ADD COLUMN icon TEXT NOT NULL DEFAULT '•',
ADD COLUMN wallet_id UUID REFERENCES wallets (id) ON DELETE CASCADE,
ADD COLUMN archived_at TIMESTAMPTZ,
ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE categories
DROP CONSTRAINT categories_workspace_id_name_kind_key;

CREATE UNIQUE INDEX categories_global_unique ON categories (workspace_id, lower(name), kind)
WHERE
  wallet_id IS NULL;

CREATE UNIQUE INDEX categories_book_unique ON categories (wallet_id, lower(name), kind)
WHERE
  wallet_id IS NOT NULL;

CREATE INDEX wallets_workspace_active_idx ON wallets (workspace_id, created_at)
WHERE
  archived_at IS NULL;

CREATE INDEX transactions_wallet_occurred_idx ON transactions (wallet_id, occurred_at DESC)
WHERE
  deleted_at IS NULL;

CREATE INDEX transactions_category_occurred_idx ON transactions (category_id, occurred_at DESC)
WHERE
  deleted_at IS NULL;

CREATE TABLE entry_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL UNIQUE REFERENCES transactions (id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL CHECK (char_length(original_name) BETWEEN 1 AND 255),
  content_type TEXT NOT NULL CHECK (
    content_type IN ('image/jpeg', 'image/png', 'image/webp')
  ),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX entry_attachments_transaction_idx ON entry_attachments (transaction_id);

INSERT INTO
  categories (workspace_id, name, kind, color, icon)
SELECT
  w.id,
  seed.name,
  seed.kind,
  seed.color,
  seed.icon
FROM
  workspaces w
  CROSS JOIN (
    VALUES
      ('Bills', 'expense', '#8f6f62', '🧾'),
      ('Rent', 'expense', '#735b69', '🏠'),
      ('Health', 'expense', '#bd6d68', '♥'),
      ('Education', 'expense', '#6680a1', '🎓'),
      ('Fees', 'expense', '#86755d', '◇'),
      ('Salary', 'income', '#428368', '↓'),
      ('Business', 'income', '#39766a', '◈'),
      ('Interest', 'income', '#567f59', '+'),
      ('Refund', 'income', '#638a73', '↩'),
      ('Gift', 'income', '#8a6a9e', '✦')
  ) AS seed (name, kind, color, icon)
ON CONFLICT DO NOTHING;
