-- Historial persistente: no se elimina al vaciar la lista de comprados.
CREATE TABLE IF NOT EXISTS product_catalog (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  times_added INTEGER NOT NULL DEFAULT 1,
  last_added_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_catalog_name_key ON product_catalog(name_key);

CREATE TABLE IF NOT EXISTS shopping_items (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL REFERENCES product_catalog(id),
  purchased INTEGER NOT NULL DEFAULT 0 CHECK (purchased IN (0,1)),
  created_at TEXT NOT NULL,
  purchased_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_purchased_created ON shopping_items(purchased, created_at);
