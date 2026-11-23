import type { ShoppingRepository } from "../../application/shopping";
import type { Item, Suggestion } from "../../domain/shopping";

export class D1ShoppingRepository implements ShoppingRepository {
  constructor(private readonly db: D1Database, private readonly userId: string) {}

  async getItems(): Promise<Item[]> {
    const { results } = await this.db
      .prepare(
        `
    SELECT i.id, p.name, i.purchased, i.created_at, i.purchased_at
    FROM user_shopping_items i JOIN user_product_catalog p ON p.id = i.product_id AND p.user_id = i.user_id
    WHERE i.user_id = ?
    ORDER BY i.purchased ASC, i.created_at DESC
    LIMIT 1000
  `,
      )
      .bind(this.userId)
      .all<Item>();
    return results;
  }

  async getSuggestions(prefix: string): Promise<Suggestion[]> {
    const escaped = prefix.replace(/[!%_]/g, "!$&") + "%";
    const { results } = await this.db
      .prepare(
        `
      SELECT id, name FROM user_product_catalog
      WHERE user_id = ? AND name_key LIKE ? ESCAPE '!'
      ORDER BY times_added DESC, last_added_at DESC
      LIMIT 8
    `,
      )
      .bind(this.userId, escaped)
      .all<Suggestion>();
    return results;
  }

  async hasPendingProduct(key: string): Promise<boolean> {
    const duplicate = await this.db
      .prepare(
        `
      SELECT i.id FROM user_shopping_items i
      JOIN user_product_catalog p ON p.id=i.product_id AND p.user_id=i.user_id
      WHERE i.user_id=? AND p.name_key=? AND i.purchased=0 LIMIT 1
    `,
      )
      .bind(this.userId, key)
      .first<{ id: string }>();
    return Boolean(duplicate);
  }

  async upsertProduct(
    name: string,
    key: string,
    timestamp: string,
  ): Promise<string> {
    const product = await this.db
      .prepare(
        `
      INSERT INTO user_product_catalog (id,user_id,name,name_key,times_added,last_added_at)
      VALUES (?,?,?,?,1,?)
      ON CONFLICT(user_id,name_key) DO UPDATE SET
        times_added=times_added+1, last_added_at=excluded.last_added_at
      RETURNING id
    `,
      )
      .bind(crypto.randomUUID(), this.userId, name, key, timestamp)
      .first<{ id: string }>();
    if (!product) throw new Error("No se pudo recuperar el producto.");
    return product.id;
  }

  async addItemReplacingPurchased(
    productId: string,
    timestamp: string,
  ): Promise<void> {
    await this.db.batch([
      this.db
        .prepare("DELETE FROM user_shopping_items WHERE user_id=? AND product_id=? AND purchased=1")
        .bind(this.userId, productId),
      this.db
        .prepare(
          `
      INSERT INTO user_shopping_items(id,user_id,product_id,purchased,created_at,purchased_at)
      VALUES (?,?,?,0,?,NULL)
    `,
        )
        .bind(crypto.randomUUID(), this.userId, productId, timestamp),
    ]);
  }

  async clearPurchased(): Promise<void> {
    await this.db.prepare("DELETE FROM user_shopping_items WHERE user_id=? AND purchased=1")
      .bind(this.userId).run();
  }

  async updatePurchased(
    id: string,
    purchased: boolean,
    timestamp: string | null,
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `
      UPDATE user_shopping_items SET purchased=?, purchased_at=? WHERE id=? AND user_id=?
    `,
      )
      .bind(purchased ? 1 : 0, timestamp, id, this.userId)
      .run();
    return Boolean(result.meta.changes);
  }

  async deleteItem(id: string): Promise<boolean> {
    const result = await this.db
      .prepare("DELETE FROM user_shopping_items WHERE id=? AND user_id=?")
      .bind(id, this.userId)
      .run();
    return Boolean(result.meta.changes);
  }
}
