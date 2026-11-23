export type User = {
  id: string;
  username: string;
  password_salt: string;
  password_hash: string;
};

export class D1UserRepository {
  constructor(private readonly db: D1Database) {}

  findByUsername(key: string): Promise<User | null> {
    return this.db.prepare(
      "SELECT id, username, password_salt, password_hash FROM users WHERE username_key=?",
    ).bind(key).first<User>();
  }

  findById(id: string): Promise<User | null> {
    return this.db.prepare(
      "SELECT id, username, password_salt, password_hash FROM users WHERE id=?",
    ).bind(id).first<User>();
  }

  async create(user: User, key: string): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare(
        `INSERT INTO users (id, username, username_key, password_salt, password_hash)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT(username_key) DO NOTHING`,
      ).bind(user.id, user.username, key, user.password_salt, user.password_hash),
      this.db.prepare(
        `INSERT OR IGNORE INTO legacy_list_claim (id, user_id)
         SELECT 1, ? WHERE EXISTS (SELECT 1 FROM users WHERE id=?)`,
      ).bind(user.id, user.id),
      this.db.prepare(
        `INSERT INTO user_product_catalog (id, user_id, name, name_key, times_added, last_added_at)
         SELECT id, ?, name, name_key, times_added, last_added_at FROM product_catalog
         WHERE EXISTS (SELECT 1 FROM legacy_list_claim WHERE user_id=?)`,
      ).bind(user.id, user.id),
      this.db.prepare(
        `INSERT INTO user_shopping_items (id, user_id, product_id, purchased, created_at, purchased_at)
         SELECT id, ?, product_id, purchased, created_at, purchased_at FROM shopping_items
         WHERE EXISTS (SELECT 1 FROM legacy_list_claim WHERE user_id=?)`,
      ).bind(user.id, user.id),
    ]);
    return results[0].meta.changes > 0;
  }
}
