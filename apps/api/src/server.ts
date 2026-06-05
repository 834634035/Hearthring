import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parse } from "node:url";
import {
  assertEntity,
  countRows,
  createRow,
  deleteRow,
  getRow,
  initSchema,
  listRows,
  updateRow,
  type EntityName
} from "./db.ts";

const port = Number(process.env.PORT ?? 4000);

const server = createServer(async (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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

    if (pathname === "/api/dashboard") {
      const counts = {
        tribes: (await countRows("tribes")).count,
        creatures: (await countRows("creatures")).count,
        factions: (await countRows("factions")).count,
        events: (await countRows("events")).count,
        resources: (await countRows("resources")).count,
        settlements: (await countRows("settlements")).count,
        kingBeasts: 0
      };
      const creatures = (await listRows("creatures")) as Array<{ isKingBeast: boolean | number }>;
      counts.kingBeasts = creatures.filter((creature) => Boolean(creature.isKingBeast)).length;
      const strongTribes = ((await listRows("tribes")) as Array<Record<string, unknown>>)
        .filter((tribe) => Number(tribe.strengthLevel) >= 4)
        .sort((a, b) => Number(b.strengthLevel) - Number(a.strengthLevel))
        .slice(0, 5);
      sendJson(res, { counts, strongTribes });
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
      sendJson(res, await listRows(entity));
      return;
    }

    if (req.method === "GET" && id) {
      const row = await getRow(entity, id);
      sendJson(res, row ?? { message: "Not found" }, row ? 200 : 404);
      return;
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      sendJson(res, await createRow(entity, body), 201);
      return;
    }

    if (req.method === "PUT" && id) {
      const body = await readBody(req);
      sendJson(res, await updateRow(entity, id, body));
      return;
    }

    if (req.method === "DELETE" && id) {
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
