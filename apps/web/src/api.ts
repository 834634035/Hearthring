import type { CrudEntity } from "@tribal-epic/shared";

const baseUrl = "/api";
const tokenKey = "hearthring.authToken";

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
  createdAt?: string;
}

export interface LoginResult {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

export function getAuthToken() {
  return localStorage.getItem(tokenKey);
}

export function setAuthToken(token: string) {
  localStorage.setItem(tokenKey, token);
}

export function clearAuthToken() {
  localStorage.removeItem(tokenKey);
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { headers: authHeaders() });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiSave<T>(entity: CrudEntity, data: Record<string, unknown>, id?: number): Promise<T> {
  const response = await fetch(`${baseUrl}/${entity}${id ? `/${id}` : ""}`, {
    method: id ? "PUT" : "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiDelete(entity: CrudEntity, id: number): Promise<void> {
  const response = await fetch(`${baseUrl}/${entity}/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!response.ok) throw new Error(await response.text());
}

export async function apiLogin(username: string, password: string) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<LoginResult>;
}

export async function apiLogout() {
  const response = await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: authHeaders()
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function apiMe() {
  const response = await fetch(`${baseUrl}/auth/me`, { headers: authHeaders() });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ user: AuthUser }>;
}

export async function apiChangePassword(currentPassword: string, nextPassword: string) {
  const response = await fetch(`${baseUrl}/auth/change-password`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ currentPassword, nextPassword })
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function apiListUsers() {
  const response = await fetch(`${baseUrl}/users`, { headers: authHeaders() });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<AuthUser[]>;
}

export async function apiCreateUser(data: { username: string; displayName: string; password: string; role: string }) {
  const response = await fetch(`${baseUrl}/users`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<AuthUser>;
}

export async function apiUpdateUser(id: number, data: { displayName?: string; role?: string }) {
  const response = await fetch(`${baseUrl}/users/${id}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<AuthUser>;
}

export async function apiResetUserPassword(id: number, nextPassword: string) {
  const response = await fetch(`${baseUrl}/users/${id}/reset-password`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ nextPassword })
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function apiDeleteUser(id: number) {
  const response = await fetch(`${baseUrl}/users/${id}`, {
    method: "DELETE",
    headers: authHeaders()
  });
  if (!response.ok) throw new Error(await response.text());
}

function authHeaders(extra?: Record<string, string>) {
  const token = getAuthToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra
  };
}
