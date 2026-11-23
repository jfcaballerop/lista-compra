import type { ShoppingRepository } from "../../application/shopping";
import type { Item, Suggestion } from "../../domain/shopping";

export class D1ShoppingRepository implements ShoppingRepository {
  constructor(private readonly db: D1Database) {}

  async getItems(): Promise<Item[]> {
    const { results } = await this.db
      .prepare(
        `
    SELECT i.id, p.name, i.purchased, i.created_at, i.purchased_at
    FROM shopping_items i JOIN product_catalog p ON p.id = i.product_id
    ORDER BY i.purchased ASC, i.created_at DESC
    LIMIT 1000
  `,
      )
      .all<Item>();
    return results;
  }

  async getSuggestions(prefix: string): Promise<Suggestion[]> {
    const escaped = prefix.replace(/[!%_]/g, "!$&") + "%";
    const { results } = await this.db
      .prepare(
        `
      SELECT id, name FROM product_catalog
      WHERE name_key LIKE ? ESCAPE '!'
      ORDER BY times_added DESC, last_added_at DESC
      LIMIT 8
    `,
      )
      .bind(escaped)
      .all<Suggestion>();
    return results;
  }

  async hasPendingProduct(key: string): Promise<boolean> {
    const duplicate = await this.db
      .prepare(
        `
      SELECT i.id FROM shopping_items i
      JOIN product_catalog p ON p.id=i.product_id
      WHERE p.name_key=? AND i.purchased=0 LIMIT 1
    `,
      )
      .bind(key)
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
      INSERT INTO product_catalog (id,name,name_key,times_added,last_added_at)
      VALUES (?,?,?,1,?)
      ON CONFLICT(name_key) DO UPDATE SET
        times_added=times_added+1, last_added_at=excluded.last_added_at
      RETURNING id
    `,
      )
      .bind(crypto.randomUUID(), name, key, timestamp)
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
        .prepare("DELETE FROM shopping_items WHERE product_id=? AND purchased=1")
        .bind(productId),
      this.db
        .prepare(
          `
      INSERT INTO shopping_items(id,product_id,purchased,created_at,purchased_at)
      VALUES (?,?,0,?,NULL)
    `,
        )
        .bind(crypto.randomUUID(), productId, timestamp),
    ]);
  }

  async clearPurchased(): Promise<void> {
    await this.db.prepare("DELETE FROM shopping_items WHERE purchased=1").run();
  }

  async updatePurchased(
    id: string,
    purchased: boolean,
    timestamp: string | null,
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `
      UPDATE shopping_items SET purchased=?, purchased_at=? WHERE id=?
    `,
      )
      .bind(purchased ? 1 : 0, timestamp, id)
      .run();
    return Boolean(result.meta.changes);
  }

  async deleteItem(id: string): Promise<boolean> {
    const result = await this.db
      .prepare("DELETE FROM shopping_items WHERE id=?")
      .bind(id)
      .run();
    return Boolean(result.meta.changes);
  }
}
