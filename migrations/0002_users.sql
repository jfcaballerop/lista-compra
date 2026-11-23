CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE legacy_list_claim (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  user_id TEXT NOT NULL REFERENCES users(id)
);

CREATE TABLE user_product_catalog (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  times_added INTEGER NOT NULL DEFAULT 1,
  last_added_at TEXT NOT NULL,
  UNIQUE (user_id, name_key),
  UNIQUE (user_id, id)
);
CREATE INDEX idx_user_catalog_name ON user_product_catalog(user_id, name_key);

CREATE TABLE user_shopping_items (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  purchased INTEGER NOT NULL DEFAULT 0 CHECK (purchased IN (0,1)),
  created_at TEXT NOT NULL,
  purchased_at TEXT,
  FOREIGN KEY (user_id, product_id) REFERENCES user_product_catalog(user_id, id)
);
CREATE INDEX idx_user_items_purchased ON user_shopping_items(user_id, purchased, created_at);
