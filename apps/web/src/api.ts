import type { CrudEntity } from "@tribal-epic/shared";

const baseUrl = "/api";

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiSave<T>(entity: CrudEntity, data: Record<string, unknown>, id?: number): Promise<T> {
  const response = await fetch(`${baseUrl}/${entity}${id ? `/${id}` : ""}`, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiDelete(entity: CrudEntity, id: number): Promise<void> {
  const response = await fetch(`${baseUrl}/${entity}/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await response.text());
}
