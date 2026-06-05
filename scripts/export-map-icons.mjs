import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const source = resolve("C:/Users/a/.codex/generated_images/019e8640-fab1-7340-9b52-0848c88056fb/ig_05a00cd3215d6fed016a1fd23ae0e08193a6abf7eb580b3c4b.png");
const outputRoot = resolve("apps/web/public/map-icons");
const parchmentDir = join(outputRoot, "parchment");
const transparentDir = join(outputRoot, "transparent");

const names = [
  "tribal-hearth",
  "major-totem-camp",
  "branch-camp",
  "shaman-stones",
  "trade-market",
  "war-camp",
  "oasis-settlement",
  "desert-hidden-city",
  "mountain-camp",
  "forest-village",
  "marsh-settlement",
  "river-crossing",
  "sacred-tree-grove",
  "totem-pole",
  "obsidian-mine",
  "high-grade-crystal-node",
  "king-beast-territory",
  "beast-lair",
  "dangerous-sea-passage",
  "locked-fire-copper-site"
];

mkdirSync(parchmentDir, { recursive: true });
mkdirSync(transparentDir, { recursive: true });

const image = sharp(source);
const metadata = await image.metadata();
const width = metadata.width ?? 0;
const height = metadata.height ?? 0;
const columns = 5;
const rows = 4;
const cellWidth = Math.floor(width / columns);
const cellHeight = Math.floor(height / rows);
const trimPadding = 18;

const manifest = [];

for (let index = 0; index < names.length; index += 1) {
  const col = index % columns;
  const row = Math.floor(index / columns);
  const left = col * cellWidth;
  const top = row * cellHeight;
  const cropWidth = col === columns - 1 ? width - left : cellWidth;
  const cropHeight = row === rows - 1 ? height - top : cellHeight;
  const name = names[index];

  const raw = await image
    .clone()
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  const tight = await trimParchment(raw);
  const parchmentPath = join(parchmentDir, `${name}.png`);
  const transparentPath = join(transparentDir, `${name}.png`);

  await sharp(tight)
    .extend({
      top: trimPadding,
      bottom: trimPadding,
      left: trimPadding,
      right: trimPadding,
      background: { r: 232, g: 210, b: 169, alpha: 1 }
    })
    .resize(256, 256, { fit: "contain", background: { r: 232, g: 210, b: 169, alpha: 1 } })
    .png()
    .toFile(parchmentPath);

  await makeTransparentIcon(tight, transparentPath);

  manifest.push({
    name,
    parchment: `/map-icons/parchment/${name}.png`,
    transparent: `/map-icons/transparent/${name}.png`
  });
}

writeFileSync(join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(`Exported ${manifest.length} icons to ${outputRoot}`);

async function trimParchment(buffer) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bg = estimateBackground(data, info.width, info.height);
  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 3;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      if (foregroundScore(r, g, b, bg) > 34) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (minX >= maxX || minY >= maxY) return buffer;

  const pad = 20;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const width = Math.min(info.width - left, maxX - minX + pad * 2);
  const height = Math.min(info.height - top, maxY - minY + pad * 2);
  return sharp(buffer).extract({ left, top, width, height }).png().toBuffer();
}

async function makeTransparentIcon(buffer, outputPath) {
  const normalized = await sharp(buffer)
    .resize(256, 256, { fit: "contain", background: { r: 232, g: 210, b: 169, alpha: 1 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = normalized;
  const bg = estimateBackground(data, info.width, info.height);
  const out = Buffer.alloc(info.width * info.height * 4);

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const sourceOffset = (y * info.width + x) * 3;
      const targetOffset = (y * info.width + x) * 4;
      const r = data[sourceOffset];
      const g = data[sourceOffset + 1];
      const b = data[sourceOffset + 2];
      const score = foregroundScore(r, g, b, bg);
      const alpha = Math.max(0, Math.min(255, Math.round((score - 78) * 6.4)));
      out[targetOffset] = r;
      out[targetOffset + 1] = g;
      out[targetOffset + 2] = b;
      out[targetOffset + 3] = alpha;
    }
  }

  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(outputPath);
}

function estimateBackground(data, width, height) {
  const samples = [];
  const margin = 12;
  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
      if (x > margin && y > margin && x < width - margin && y < height - margin) continue;
      const offset = (y * width + x) * 3;
      samples.push([data[offset], data[offset + 1], data[offset + 2]]);
    }
  }
  return [median(samples.map((v) => v[0])), median(samples.map((v) => v[1])), median(samples.map((v) => v[2]))];
}

function foregroundScore(r, g, b, bg) {
  const colorDistance = Math.sqrt((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2);
  const darkness = Math.max(0, (bg[0] + bg[1] + bg[2]) / 3 - (r + g + b) / 3);
  const saturation = Math.max(r, g, b) - Math.min(r, g, b);
  return Math.max(colorDistance, darkness * 1.8, saturation * 0.85);
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
