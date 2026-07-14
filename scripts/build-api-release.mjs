import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const apiDir = path.join(root, "apps", "api");
const distDir = path.join(apiDir, "dist");
const releaseDir = path.join(apiDir, "release");
const apiPackagePath = path.join(apiDir, "package.json");

const apiPackage = JSON.parse(await readFile(apiPackagePath, "utf8"));
const runtimeDependencies = Object.fromEntries(
  Object.entries(apiPackage.dependencies).filter(([name]) => name !== "@tribal-epic/shared")
);

await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });
await cp(distDir, path.join(releaseDir, "dist"), { recursive: true });

await writeFile(
  path.join(releaseDir, "package.json"),
  `${JSON.stringify(
    {
      name: "tribal-epic-api-release",
      version: apiPackage.version,
      private: true,
      type: "module",
      main: "dist/server.js",
      scripts: {
        start: "node --env-file=.env dist/server.js",
        "db:seed": "node --env-file=.env dist/seed.js"
      },
      dependencies: runtimeDependencies
    },
    null,
    2
  )}\n`
);

await writeFile(
  path.join(releaseDir, "README.md"),
  `# API Release\n\n上传这个目录到服务器后执行：\n\n\`\`\`bash\nnpm install --omit=dev\nnpm run start\n\`\`\`\n\n如果用 PM2：\n\n\`\`\`bash\npm2 start dist/server.js --name tribal-epic-api --node-args="--env-file=.env"\n\`\`\`\n\n需要你自己把生产环境的 .env 放到本目录。\n`
);

console.log(`API release package created at ${path.relative(root, releaseDir)}`);
