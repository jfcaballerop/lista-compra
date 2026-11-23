export type Item = {
  id: string;
  name: string;
  purchased: number;
  created_at: string;
  purchased_at: string | null;
};

export type Suggestion = { id: string; name: string };

export class ShoppingError extends Error {
  constructor(
    readonly code: "invalid" | "conflict" | "not-found",
    message: string,
  ) {
    super(message);
  }
}

function normalise(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

export function productName(value: string): { name: string; key: string } {
  const name = value.trim().replace(/\s+/g, " ");
  const key = normalise(name);
  if (name.length < 1 || name.length > 80 || key.length === 0)
    throw new ShoppingError(
      "invalid",
      "El nombre debe tener de 1 a 80 caracteres.",
    );
  return { name, key };
}

export function suggestionPrefix(value: string): string | null {
  const prefix = normalise(value);
  if (prefix.length < 3) return null;
  if (prefix.length > 80)
    throw new ShoppingError("invalid", "Búsqueda demasiado larga.");
  return prefix;
}
