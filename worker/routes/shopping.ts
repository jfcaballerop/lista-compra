import type { ShoppingService } from "../application/shopping";
import { error, json, readJson } from "./http";

export async function listItems(shopping: ShoppingService): Promise<Response> {
  return json({ items: await shopping.getItems() });
}

export async function suggestions(
  url: URL,
  shopping: ShoppingService,
): Promise<Response> {
  const query = url.searchParams.get("q") || "";
  return json({ suggestions: await shopping.getSuggestions(query) });
}

export async function addItem(
  req: Request,
  shopping: ShoppingService,
): Promise<Response> {
  const body = await readJson(req);
  if (typeof body.name !== "string")
    return error("Introduce el nombre del producto.");
  return json({ items: await shopping.addItem(body.name) }, 201);
}

export async function clearPurchased(
  shopping: ShoppingService,
): Promise<Response> {
  return json({ items: await shopping.clearPurchased() });
}

export async function updatePurchased(
  req: Request,
  id: string,
  shopping: ShoppingService,
): Promise<Response> {
  const body = await readJson(req);
  if (typeof body.purchased !== "boolean")
    return error("Debes indicar purchased: true o false.");
  return json({ items: await shopping.updatePurchased(id, body.purchased) });
}

export async function deleteItem(
  id: string,
  shopping: ShoppingService,
): Promise<Response> {
  return json({ items: await shopping.deleteItem(id) });
}
