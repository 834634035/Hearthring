import mysql, { type PoolOptions, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

export type EntityName =
  | "tribes"
  | "characters"
  | "regions"
  | "settlements"
  | "resources"
  | "creatures"
  | "factions"
  | "events";

export const entityNames: EntityName[] = [
  "tribes",
  "characters",
  "regions",
  "settlements",
  "resources",
  "creatures",
  "factions",
  "events"
];

export const tableNames: Record<EntityName, string> = {
  tribes: "tribes",
  characters: "characters",
  regions: "regions",
  settlements: "settlements",
  resources: "resources",
  creatures: "creatures",
  factions: "factions",
  events: "story_events"
};

export const fields: Record<EntityName, string[]> = {
  tribes: [
    "name",
    "continent",
    "region",
    "factionType",
    "totem",
    "totemOrigin",
    "hearthName",
    "hearthState",
    "strengthLevel",
    "population",
    "specialties",
    "preferences",
    "taboos",
    "abilities",
    "weakness",
    "stance",
    "coordinatesX",
    "coordinatesY",
    "description"
  ],
  characters: ["name", "role", "tribeName", "status", "secretLevel", "ability", "knowledge", "motivation", "description"],
  regions: ["name", "continent", "climate", "terrain", "dangerLevel", "mapX", "mapY", "mapZoom", "description"],
  settlements: ["name", "region", "owner", "settlementType", "population", "fireStatus", "tradeGoods", "mapX", "mapY", "description"],
  resources: ["name", "category", "grade", "region", "rarity", "useCase", "risk", "description"],
  creatures: ["name", "creatureType", "region", "isKingBeast", "dangerLevel", "ability", "materialUse", "behavior", "description"],
  factions: ["name", "factionType", "origin", "publicFace", "hiddenGoal", "resources", "weakness", "description"],
  events: ["title", "act", "region", "eventType", "visibleTo", "hiddenTruth", "consequences", "description"]
};

const databaseUrl = process.env.DATABASE_URL ?? "mysql://root:password@127.0.0.1:3306/tribal_epic_game";
const parsedUrl = new URL(databaseUrl);
const databaseName = parsedUrl.pathname.replace("/", "") || "tribal_epic_game";

const poolConfig: PoolOptions = {
  uri: databaseUrl,
  connectionLimit: 10,
  charset: "utf8mb4",
  timezone: "Z",
  multipleStatements: true,
  namedPlaceholders: false
};

export const pool = mysql.createPool(poolConfig);

export async function initSchema() {
  await ensureDatabase();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tribes (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      continent VARCHAR(80) NOT NULL,
      region VARCHAR(120) NOT NULL,
      factionType VARCHAR(80) NOT NULL DEFAULT '部落',
      totem VARCHAR(120) NOT NULL,
      totemOrigin VARCHAR(120) NOT NULL,
      hearthName VARCHAR(120) NOT NULL,
      hearthState VARCHAR(80) NOT NULL,
      strengthLevel INT NOT NULL DEFAULT 3,
      population INT NOT NULL DEFAULT 300,
      specialties TEXT NOT NULL,
      preferences TEXT NOT NULL,
      taboos TEXT NOT NULL,
      abilities TEXT NOT NULL,
      weakness TEXT NOT NULL,
      stance TEXT NOT NULL,
      coordinatesX DOUBLE NOT NULL,
      coordinatesY DOUBLE NOT NULL,
      description TEXT NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS characters (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      role VARCHAR(160) NOT NULL,
      tribeName VARCHAR(160) NOT NULL,
      status VARCHAR(120) NOT NULL,
      secretLevel INT NOT NULL DEFAULT 1,
      ability TEXT NOT NULL,
      knowledge TEXT NOT NULL,
      motivation TEXT NOT NULL,
      description TEXT NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS regions (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      continent VARCHAR(80) NOT NULL,
      climate TEXT NOT NULL,
      terrain TEXT NOT NULL,
      dangerLevel INT NOT NULL DEFAULT 3,
      mapX DOUBLE NOT NULL,
      mapY DOUBLE NOT NULL,
      mapZoom DOUBLE NOT NULL DEFAULT 1,
      description TEXT NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS settlements (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      region VARCHAR(120) NOT NULL,
      owner VARCHAR(120) NOT NULL,
      settlementType VARCHAR(120) NOT NULL,
      population INT NOT NULL DEFAULT 120,
      fireStatus VARCHAR(80) NOT NULL,
      tradeGoods TEXT NOT NULL,
      mapX DOUBLE NOT NULL,
      mapY DOUBLE NOT NULL,
      description TEXT NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS resources (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      category VARCHAR(120) NOT NULL,
      grade VARCHAR(120) NOT NULL,
      region VARCHAR(180) NOT NULL,
      rarity INT NOT NULL DEFAULT 3,
      useCase TEXT NOT NULL,
      risk TEXT NOT NULL,
      description TEXT NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS creatures (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      creatureType VARCHAR(120) NOT NULL,
      region VARCHAR(180) NOT NULL,
      isKingBeast BOOLEAN NOT NULL DEFAULT FALSE,
      dangerLevel INT NOT NULL DEFAULT 3,
      ability TEXT NOT NULL,
      materialUse TEXT NOT NULL,
      behavior TEXT NOT NULL,
      description TEXT NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS factions (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      factionType VARCHAR(120) NOT NULL,
      origin TEXT NOT NULL,
      publicFace TEXT NOT NULL,
      hiddenGoal TEXT NOT NULL,
      resources TEXT NOT NULL,
      weakness TEXT NOT NULL,
      description TEXT NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS story_events (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(160) NOT NULL UNIQUE,
      act VARCHAR(120) NOT NULL,
      region VARCHAR(160) NOT NULL,
      eventType VARCHAR(120) NOT NULL,
      visibleTo TEXT NOT NULL,
      hiddenTruth TEXT NOT NULL,
      consequences TEXT NOT NULL,
      description TEXT NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);
}

export function assertEntity(entity: string): asserts entity is EntityName {
  if (!entityNames.includes(entity as EntityName)) {
    throw new Error(`Unknown entity: ${entity}`);
  }
}

export async function listRows(entity: EntityName) {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM ${tableNames[entity]} ORDER BY updatedAt DESC`);
  return normalizeRows(rows);
}

export async function getRow(entity: EntityName, id: number) {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM ${tableNames[entity]} WHERE id = ?`, [id]);
  return normalizeRows(rows)[0];
}

export async function createRow(entity: EntityName, data: Record<string, unknown>) {
  const allowed = fields[entity].filter((field) => field in data);
  const placeholders = allowed.map(() => "?").join(", ");
  const sql = `INSERT INTO ${tableNames[entity]} (${allowed.join(", ")}) VALUES (${placeholders})`;
  const [result] = await pool.query<ResultSetHeader>(sql, allowed.map((field) => normalizeValue(data[field])));
  return getRow(entity, result.insertId);
}

export async function updateRow(entity: EntityName, id: number, data: Record<string, unknown>) {
  const allowed = fields[entity].filter((field) => field in data);
  if (allowed.length > 0) {
    const assignments = allowed.map((field) => `${field} = ?`).join(", ");
    const sql = `UPDATE ${tableNames[entity]} SET ${assignments} WHERE id = ?`;
    await pool.query(sql, [...allowed.map((field) => normalizeValue(data[field])), id]);
  }
  return getRow(entity, id);
}

export async function deleteRow(entity: EntityName, id: number) {
  await pool.query(`DELETE FROM ${tableNames[entity]} WHERE id = ?`, [id]);
}

export async function countRows(entity: EntityName) {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) as count FROM ${tableNames[entity]}`);
  return { count: Number(rows[0]?.count ?? 0) };
}

export async function truncateTables() {
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of ["story_events", "factions", "creatures", "resources", "settlements", "regions", "characters", "tribes"]) {
    await pool.query(`TRUNCATE TABLE ${table}`);
  }
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");
}

async function ensureDatabase() {
  const bootstrapUrl = new URL(databaseUrl);
  bootstrapUrl.pathname = "/";
  const connection = await mysql.createConnection({
    uri: bootstrapUrl.toString(),
    charset: "utf8mb4",
    multipleStatements: true
  });
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.end();
}

function normalizeRows(rows: RowDataPacket[]) {
  return rows.map((row) => {
    const next: Record<string, unknown> = { ...row };
    if ("isKingBeast" in next) next.isKingBeast = Boolean(next.isKingBeast);
    return next;
  });
}

function normalizeValue(value: unknown) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === undefined || value === null) return "";
  return value as string | number;
}
