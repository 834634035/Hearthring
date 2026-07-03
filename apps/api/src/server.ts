import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import {
  canManageUsers,
  canReadContent,
  canWriteContent,
  crudEntities,
  DEFAULT_USER_ROLE,
  isUserRole
} from "@tribal-epic/shared";
import {
  assertEntity,
  countRows,
  createSession,
  createRow,
  createUser,
  deleteUser,
  deleteSession,
  ensureDefaultUser,
  getUserBySession,
  getUserByUsername,
  deleteRow,
  getRow,
  initSchema,
  listUsers,
  listRows,
  updateUser,
  updateUserPassword,
  updateRow,
  type EntityName,
  type PublicUser
} from "./db.ts";
import { generateNpcReply } from "./npcDialogue.ts";

const port = Number(process.env.PORT ?? 4000);
const scrypt = promisify(scryptCallback);
const sessionDays = Number(process.env.AUTH_SESSION_DAYS ?? 7);

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "tribal-epic-api" });
});

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");
  const user = username ? await getUserByUsername(username) : undefined;

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ message: "账号或口令不正确" });
    return;
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
  await createSession(user.id, hashToken(token), expiresAt);
  res.json({
    token,
    expiresAt: expiresAt.toISOString(),
    user: toPublicUser(user)
  });
}));

app.post("/api/auth/logout", asyncHandler(async (req, res) => {
  const token = getBearerToken(req);
  if (token) await deleteSession(hashToken(token));
  res.json({ ok: true });
}));

app.get("/api/auth/me", asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  res.json({ user });
}));

app.post("/api/auth/change-password", asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const currentPassword = String(req.body?.currentPassword ?? "");
  const nextPassword = String(req.body?.nextPassword ?? "");
  if (!isValidPassword(nextPassword)) {
    res.status(400).json({ message: "新密码至少需要 8 个字符" });
    return;
  }

  const fullUser = await getUserByUsername(user.username);
  if (!fullUser || !(await verifyPassword(currentPassword, fullUser.passwordHash))) {
    res.status(401).json({ message: "当前密码不正确" });
    return;
  }

  await updateUserPassword(user.id, await hashPassword(nextPassword));
  res.json({ ok: true });
}));

app.post("/api/npc/dialogue", asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const npcName = String(req.body?.npcName ?? "").trim();
  const npcTitle = String(req.body?.npcTitle ?? "").trim();
  if (!npcName) {
    res.status(400).json({ message: "缺少 NPC 名称" });
    return;
  }

  const result = await generateNpcReply({
    npcId: String(req.body?.npcId ?? ""),
    npcName,
    npcTitle,
    persona: String(req.body?.persona ?? ""),
    sceneContext: String(req.body?.sceneContext ?? ""),
    fallbackLines: Array.isArray(req.body?.fallbackLines)
      ? req.body.fallbackLines.map((line: unknown) => String(line ?? ""))
      : undefined,
    messages: Array.isArray(req.body?.messages)
      ? (req.body.messages as Array<{ role: string; content: string }>).map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: String(item.content ?? "")
        }))
      : []
  });
  res.json(result);
}));

app.get("/api/users", asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user || !requirePermission(user, res, canManageUsers)) return;
  res.json(await listUsers());
}));

app.post("/api/users", asyncHandler(async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor || !requirePermission(actor, res, canManageUsers)) return;

  const username = String(req.body?.username ?? "").trim();
  const displayName = String(req.body?.displayName ?? username).trim();
  const password = String(req.body?.password ?? "");
  const role = normalizeRole(String(req.body?.role ?? DEFAULT_USER_ROLE));

  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
    res.status(400).json({ message: "账号只能包含字母、数字、下划线或连字符，长度 3-32" });
    return;
  }
  if (!displayName) {
    res.status(400).json({ message: "显示名不能为空" });
    return;
  }
  if (!isValidPassword(password)) {
    res.status(400).json({ message: "密码至少需要 8 个字符" });
    return;
  }

  res.status(201).json(await createUser({ username, displayName, passwordHash: await hashPassword(password), role }));
}));

app.put("/api/users/:id", asyncHandler(async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor || !requirePermission(actor, res, canManageUsers)) return;

  const id = parseId(paramValue(req.params.id), res);
  if (id === undefined) return;

  const displayName = "displayName" in req.body ? String(req.body.displayName ?? "").trim() : undefined;
  const role = "role" in req.body ? normalizeRole(String(req.body.role ?? "")) : undefined;
  if (displayName !== undefined && !displayName) {
    res.status(400).json({ message: "显示名不能为空" });
    return;
  }
  if (role && !(await canChangeRole(id, role))) {
    res.status(400).json({ message: "不能移除最后一个管理员" });
    return;
  }

  res.json(await updateUser(id, { displayName, role }));
}));

app.post("/api/users/:id/reset-password", asyncHandler(async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor || !requirePermission(actor, res, canManageUsers)) return;

  const id = parseId(paramValue(req.params.id), res);
  if (id === undefined) return;

  const nextPassword = String(req.body?.nextPassword ?? "");
  if (!isValidPassword(nextPassword)) {
    res.status(400).json({ message: "新密码至少需要 8 个字符" });
    return;
  }

  await updateUserPassword(id, await hashPassword(nextPassword));
  res.json({ ok: true });
}));

app.delete("/api/users/:id", asyncHandler(async (req, res) => {
  const actor = await requireAuth(req, res);
  if (!actor || !requirePermission(actor, res, canManageUsers)) return;

  const id = parseId(paramValue(req.params.id), res);
  if (id === undefined) return;

  if (id === actor.id) {
    res.status(400).json({ message: "不能删除当前登录用户" });
    return;
  }
  if (!(await canDeleteUser(id))) {
    res.status(400).json({ message: "不能删除最后一个管理员" });
    return;
  }

  await deleteUser(id);
  res.status(204).end();
}));

app.get("/api/dashboard", asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const counts: Record<string, number> = { kingBeasts: 0 };
  for (const entity of crudEntities) {
    counts[entity] = (await countRows(entity)).count;
  }
  const creatures = (await listRows("creatures")) as Array<{ isKingBeast: boolean | number }>;
  counts.kingBeasts = creatures.filter((creature) => Boolean(creature.isKingBeast)).length;
  const tribes = (await listRows("tribes")) as Array<Record<string, unknown>>;
  const settlements = (await listRows("settlements")) as Array<Record<string, unknown>>;
  const events = (await listRows("events")) as Array<Record<string, unknown>>;
  const totalPopulation = sumNumbers(tribes, "population");
  const settlementPopulation = sumNumbers(settlements, "population");
  const strongTribes = tribes
    .filter((tribe) => Number(tribe.strengthLevel) >= 4)
    .sort((a, b) => Number(b.strengthLevel) - Number(a.strengthLevel))
    .slice(0, 5);

  res.json({
    counts,
    strongTribes,
    totalPopulation,
    settlementPopulation,
    continentPopulation: toContinentPopulation(tribes, totalPopulation),
    tribePopulations: toTribePopulations(tribes, totalPopulation),
    ageDistribution: toAgeDistribution(totalPopulation),
    timeline: toTimeline(events)
  });
}));

app.get("/api/:entity", asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user || !requirePermission(user, res, canReadContent)) return;

  const entity = requireEntity(paramValue(req.params.entity));
  res.json(await listRows(entity));
}));

app.get("/api/:entity/:id", asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user || !requirePermission(user, res, canReadContent)) return;

  const entity = requireEntity(paramValue(req.params.entity));
  const id = parseId(paramValue(req.params.id), res);
  if (id === undefined) return;

  const row = await getRow(entity, id);
  res.status(row ? 200 : 404).json(row ?? { message: "Not found" });
}));

app.post("/api/:entity", asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user || !requirePermission(user, res, canWriteContent)) return;

  const entity = requireEntity(paramValue(req.params.entity));
  res.status(201).json(await createRow(entity, req.body ?? {}));
}));

app.put("/api/:entity/:id", asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user || !requirePermission(user, res, canWriteContent)) return;

  const entity = requireEntity(paramValue(req.params.entity));
  const id = parseId(paramValue(req.params.id), res);
  if (id === undefined) return;

  res.json(await updateRow(entity, id, req.body ?? {}));
}));

app.delete("/api/:entity/:id", asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user || !requirePermission(user, res, canWriteContent)) return;

  const entity = requireEntity(paramValue(req.params.entity));
  const id = parseId(paramValue(req.params.id), res);
  if (id === undefined) return;

  await deleteRow(entity, id);
  res.status(204).end();
}));

app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  res.status(500).json({ message });
});

await initSchema();
await ensureDefaultUser(await hashPassword(process.env.ADMIN_PASSWORD ?? "hearthring"));

app.listen(port, () => {
  console.log(`Tribal Epic API listening on http://localhost:${port}`);
});

function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

async function requireAuth(req: Request, res: Response) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return undefined;
  }

  const user = await getUserBySession(hashToken(token));
  if (!user) {
    res.status(401).json({ message: "Session expired" });
    return undefined;
  }

  return user;
}

function getBearerToken(req: Request) {
  const auth = req.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice("Bearer ".length).trim();
}

function requireEntity(entity: string | undefined) {
  const name = String(entity ?? "");
  assertEntity(name);
  return name;
}

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseId(value: string | undefined, res: Response) {
  const id = Number(value);
  if (Number.isInteger(id) && id > 0) return id;
  res.status(400).json({ message: "Invalid id" });
  return undefined;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, hash] = storedHash.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function toPublicUser(user: { id: number; username: string; displayName: string; role: string }) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role
  };
}

function sumNumbers(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
}

function toPercent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function toContinentPopulation(rows: Array<Record<string, unknown>>, total: number) {
  const groups = new Map<string, number>();
  rows.forEach((row) => {
    const continent = String(row.continent ?? "未知大陆");
    groups.set(continent, (groups.get(continent) ?? 0) + Number(row.population ?? 0));
  });
  return [...groups.entries()]
    .map(([continent, population]) => ({
      continent,
      population,
      percent: toPercent(population, total)
    }))
    .sort((a, b) => b.population - a.population);
}

function toTribePopulations(rows: Array<Record<string, unknown>>, total: number) {
  return rows
    .map((row) => ({
      name: String(row.name ?? "未命名部落"),
      region: String(row.region ?? ""),
      population: Number(row.population ?? 0),
      strengthLevel: Number(row.strengthLevel ?? 0),
      percent: toPercent(Number(row.population ?? 0), total)
    }))
    .sort((a, b) => b.population - a.population)
    .slice(0, 8);
}

function toAgeDistribution(total: number) {
  const ratios = [
    ["幼年", 0.34],
    ["青年", 0.22],
    ["成年", 0.31],
    ["长者", 0.13]
  ] as const;
  return ratios.map(([label, ratio]) => ({
    label,
    value: Math.round(total * ratio),
    percent: Math.round(ratio * 1000) / 10
  }));
}

function toTimeline(rows: Array<Record<string, unknown>>) {
  return rows.slice(0, 6).map((row) => ({
    title: String(row.title ?? "未命名事件"),
    act: String(row.act ?? ""),
    region: String(row.region ?? ""),
    eventType: String(row.eventType ?? ""),
    description: String(row.description ?? "")
  }));
}

function requirePermission(user: Pick<PublicUser, "role">, res: Response, allowed: (role: string) => boolean) {
  if (allowed(user.role)) return true;
  res.status(403).json({ message: "Forbidden" });
  return false;
}

function normalizeRole(role: string) {
  if (isUserRole(role)) return role;
  throw new Error(`Unknown role: ${role}`);
}

function isValidPassword(password: string) {
  return password.length >= 8;
}

async function canChangeRole(id: number, nextRole: string) {
  if (nextRole === "admin") return true;
  const users = await listUsers();
  const target = users.find((user) => user.id === id);
  if (target?.role !== "admin") return true;
  return users.filter((user) => user.role === "admin").length > 1;
}

async function canDeleteUser(id: number) {
  const users = await listUsers();
  const target = users.find((user) => user.id === id);
  if (target?.role !== "admin") return true;
  return users.filter((user) => user.role === "admin").length > 1;
}
