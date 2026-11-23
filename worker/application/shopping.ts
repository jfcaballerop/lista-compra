import { productName, ShoppingError, suggestionPrefix } from "../domain/shopping";
import type { Item, Suggestion } from "../domain/shopping";

export interface ShoppingRepository {
  getItems(): Promise<Item[]>;
  getSuggestions(prefix: string): Promise<Suggestion[]>;
  hasPendingProduct(key: string): Promise<boolean>;
  upsertProduct(name: string, key: string, timestamp: string): Promise<string>;
  addItemReplacingPurchased(productId: string, timestamp: string): Promise<void>;
  clearPurchased(): Promise<void>;
  updatePurchased(
    id: string,
    purchased: boolean,
    timestamp: string | null,
  ): Promise<boolean>;
  deleteItem(id: string): Promise<boolean>;
}

export class ShoppingService {
  constructor(private readonly repository: ShoppingRepository) {}

  getItems(): Promise<Item[]> {
    return this.repository.getItems();
  }

  async getSuggestions(query: string): Promise<Suggestion[]> {
    const prefix = suggestionPrefix(query);
    if (prefix === null) return [];
    return this.repository.getSuggestions(prefix);
  }

  async addItem(value: string): Promise<Item[]> {
    const { name, key } = productName(value);
    if (await this.repository.hasPendingProduct(key))
      throw new ShoppingError("conflict", "Ese producto ya está en pendientes.");

    const timestamp = new Date().toISOString();
    const productId = await this.repository.upsertProduct(name, key, timestamp);
    await this.repository.addItemReplacingPurchased(productId, timestamp);
    return this.repository.getItems();
  }

  async clearPurchased(): Promise<Item[]> {
    await this.repository.clearPurchased();
    return this.repository.getItems();
  }

  async updatePurchased(id: string, purchased: boolean): Promise<Item[]> {
    const timestamp = purchased ? new Date().toISOString() : null;
    if (!(await this.repository.updatePurchased(id, purchased, timestamp)))
      throw new ShoppingError("not-found", "Producto no encontrado.");
    return this.repository.getItems();
  }

  async deleteItem(id: string): Promise<Item[]> {
    if (!(await this.repository.deleteItem(id)))
      throw new ShoppingError("not-found", "Producto no encontrado.");
    return this.repository.getItems();
  }
}
