import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { parse } from "node:url";
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
  type EntityName
} from "./db.ts";
import { generateNpcReply } from "./npcDialogue.ts";

const port = Number(process.env.PORT ?? 4000);
const scrypt = promisify(scryptCallback);
const sessionDays = Number(process.env.AUTH_SESSION_DAYS ?? 7);

const server = createServer(async (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const pathname = parse(req.url ?? "/").pathname ?? "/";
    const parts = pathname.split("/").filter(Boolean);

    if (pathname === "/api/health") {
      sendJson(res, { ok: true, service: "tribal-epic-api" });
      return;
    }

    if (pathname === "/api/auth/login" && req.method === "POST") {
      const body = await readBody(req);
      const username = String(body.username ?? "").trim();
      const password = String(body.password ?? "");
      const user = username ? await getUserByUsername(username) : undefined;

      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        sendJson(res, { message: "账号或口令不正确" }, 401);
        return;
      }

      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
      await createSession(user.id, hashToken(token), expiresAt);
      sendJson(res, {
        token,
        expiresAt: expiresAt.toISOString(),
        user: toPublicUser(user)
      });
      return;
    }

    if (pathname === "/api/auth/logout" && req.method === "POST") {
      const token = getBearerToken(req);
      if (token) await deleteSession(hashToken(token));
      sendJson(res, { ok: true });
      return;
    }

    if (pathname === "/api/auth/me" && req.method === "GET") {
      const user = await requireAuth(req, res);
      if (!user) return;
      sendJson(res, { user });
      return;
    }

    if (pathname === "/api/auth/change-password" && req.method === "POST") {
      const user = await requireAuth(req, res);
      if (!user) return;
      const body = await readBody(req);
      const currentPassword = String(body.currentPassword ?? "");
      const nextPassword = String(body.nextPassword ?? "");
      if (!isValidPassword(nextPassword)) {
        sendJson(res, { message: "新密码至少需要 8 个字符" }, 400);
        return;
      }
      const fullUser = await getUserByUsername(user.username);
      if (!fullUser || !(await verifyPassword(currentPassword, fullUser.passwordHash))) {
        sendJson(res, { message: "当前密码不正确" }, 401);
        return;
      }
      await updateUserPassword(user.id, await hashPassword(nextPassword));
      sendJson(res, { ok: true });
      return;
    }

    if (pathname === "/api/npc/dialogue" && req.method === "POST") {
      const user = await requireAuth(req, res);
      if (!user) return;
      const body = await readBody(req);
      const npcName = String(body.npcName ?? "").trim();
      const npcTitle = String(body.npcTitle ?? "").trim();
      if (!npcName) {
        sendJson(res, { message: "缺少 NPC 名称" }, 400);
        return;
      }
      const result = await generateNpcReply({
        npcId: String(body.npcId ?? ""),
        npcName,
        npcTitle,
        persona: String(body.persona ?? ""),
        sceneContext: String(body.sceneContext ?? ""),
        messages: Array.isArray(body.messages) ? (body.messages as Array<{ role: string; content: string }>).map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: String(item.content ?? "")
        })) : []
      });
      sendJson(res, result);
      return;
    }

    const user = await requireAuth(req, res);
    if (!user) return;

    if (parts[0] === "api" && parts[1] === "users") {
      if (!requirePermission(user, res, canManageUsers)) return;
      await handleUsersRoute(req, res, parts, user);
      return;
    }

    if (pathname === "/api/dashboard") {
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
      sendJson(res, {
        counts,
        strongTribes,
        totalPopulation,
        settlementPopulation,
        continentPopulation: toContinentPopulation(tribes, totalPopulation),
        tribePopulations: toTribePopulations(tribes, totalPopulation),
        ageDistribution: toAgeDistribution(totalPopulation),
        timeline: toTimeline(events)
      });
      return;
    }

    if (parts[0] !== "api" || !parts[1]) {
      sendJson(res, { message: "Not found" }, 404);
      return;
    }

    const entity = parts[1];
    assertEntity(entity);
    const id = parts[2] ? Number(parts[2]) : undefined;

    if (req.method === "GET" && !id) {
      if (!requirePermission(user, res, canReadContent)) return;
      sendJson(res, await listRows(entity));
      return;
    }

    if (req.method === "GET" && id) {
      if (!requirePermission(user, res, canReadContent)) return;
      const row = await getRow(entity, id);
      sendJson(res, row ?? { message: "Not found" }, row ? 200 : 404);
      return;
    }

    if (req.method === "POST") {
      if (!requirePermission(user, res, canWriteContent)) return;
      const body = await readBody(req);
      sendJson(res, await createRow(entity, body), 201);
      return;
    }

    if (req.method === "PUT" && id) {
      if (!requirePermission(user, res, canWriteContent)) return;
      const body = await readBody(req);
      sendJson(res, await updateRow(entity, id, body));
      return;
    }

    if (req.method === "DELETE" && id) {
      if (!requirePermission(user, res, canWriteContent)) return;
      await deleteRow(entity, id);
      res.writeHead(204).end();
      return;
    }

    sendJson(res, { message: "Method not allowed" }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendJson(res, { message }, 500);
  }
});

await initSchema();
await ensureDefaultUser(await hashPassword(process.env.ADMIN_PASSWORD ?? "hearthring"));

server.listen(port, () => {
  console.log(`Tribal Epic API listening on http://localhost:${port}`);
});

function sendJson(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function requireAuth(req: IncomingMessage, res: ServerResponse) {
  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, { message: "Unauthorized" }, 401);
    return undefined;
  }

  const user = await getUserBySession(hashToken(token));
  if (!user) {
    sendJson(res, { message: "Session expired" }, 401);
    return undefined;
  }

  return user;
}

function getBearerToken(req: IncomingMessage) {
  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice("Bearer ".length).trim();
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

async function handleUsersRoute(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  actor: { id: number; role: string }
) {
  const id = parts[2] ? Number(parts[2]) : undefined;
  const action = parts[3];

  if (req.method === "GET" && !id) {
    sendJson(res, await listUsers());
    return;
  }

  if (req.method === "POST" && !id) {
    const body = await readBody(req);
    const username = String(body.username ?? "").trim();
    const displayName = String(body.displayName ?? username).trim();
    const password = String(body.password ?? "");
    const role = normalizeRole(String(body.role ?? DEFAULT_USER_ROLE));

    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
      sendJson(res, { message: "账号只能包含字母、数字、下划线或连字符，长度 3-32" }, 400);
      return;
    }
    if (!displayName) {
      sendJson(res, { message: "显示名不能为空" }, 400);
      return;
    }
    if (!isValidPassword(password)) {
      sendJson(res, { message: "密码至少需要 8 个字符" }, 400);
      return;
    }

    sendJson(res, await createUser({ username, displayName, passwordHash: await hashPassword(password), role }), 201);
    return;
  }

  if (req.method === "PUT" && id && !action) {
    const body = await readBody(req);
    const displayName = "displayName" in body ? String(body.displayName ?? "").trim() : undefined;
    const role = "role" in body ? normalizeRole(String(body.role ?? "")) : undefined;
    if (displayName !== undefined && !displayName) {
      sendJson(res, { message: "显示名不能为空" }, 400);
      return;
    }
    if (role && !(await canChangeRole(id, role))) {
      sendJson(res, { message: "不能移除最后一个管理员" }, 400);
      return;
    }
    sendJson(res, await updateUser(id, { displayName, role }));
    return;
  }

  if (req.method === "POST" && id && action === "reset-password") {
    const body = await readBody(req);
    const nextPassword = String(body.nextPassword ?? "");
    if (!isValidPassword(nextPassword)) {
      sendJson(res, { message: "新密码至少需要 8 个字符" }, 400);
      return;
    }
    await updateUserPassword(id, await hashPassword(nextPassword));
    sendJson(res, { ok: true });
    return;
  }

  if (req.method === "DELETE" && id) {
    if (id === actor.id) {
      sendJson(res, { message: "不能删除当前登录用户" }, 400);
      return;
    }
    if (!(await canDeleteUser(id))) {
      sendJson(res, { message: "不能删除最后一个管理员" }, 400);
      return;
    }
    await deleteUser(id);
    res.writeHead(204).end();
    return;
  }

  sendJson(res, { message: "Method not allowed" }, 405);
}

function requirePermission(user: { role: string }, res: ServerResponse, allowed: (role: string) => boolean) {
  if (allowed(user.role)) return true;
  sendJson(res, { message: "Forbidden" }, 403);
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
