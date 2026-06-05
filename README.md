# Tribal Epic Game Monorepo

基于 `story-outline.md` 设定集创建的全栈游戏原型与内容管理系统。

## 结构

- `apps/web`：React + TypeScript 管理台、Three 场景、OpenLayers 地图。
- `apps/api`：Node 原生 HTTP + TypeScript API，使用 `mysql2` 连接 MySQL。
- `packages/shared`：前后端共享类型与常量。
- `apps/api/.env`：本地 MySQL 连接配置。

## 启动

```bash
npm --prefix apps/api install
npm run db:seed
npm run dev:api
npm run dev:web
```

前端默认运行在 `http://localhost:5174`，后端默认运行在 `http://localhost:4000`。

## MySQL 配置

先修改 `apps/api/.env`：

```bash
DATABASE_URL=mysql://root:你的密码@127.0.0.1:3306/tribal_epic_game
PORT=4000
```

然后运行：

```bash
npm run db:seed
```

`db:seed` 会自动创建 `tribal_epic_game` 数据库、创建管理系统需要的表，并写入一批来自设定集的初始数据。

## SQLite 与 MySQL 的区别

之前临时使用的是 SQLite：它是一个单文件数据库，不需要启动数据库服务，适合快速原型、离线工具和小型本地测试。缺点是并发、权限、长期运维和多服务协作能力较弱。

现在切换为 MySQL：它是服务型关系数据库，需要账号密码和运行中的 MySQL 服务，更适合正式后台、长期内容管理、多连接访问、权限控制和后续游戏数据扩展。

## 管理模块

- 部落：图腾、火塘、强度、喜好、禁忌、能力、地图坐标。
- 人物：巫、首领、巫徒、主角、秘密等级与认知边界。
- 地理区域：东大陆中部、西部沙漠、北部密林山地、西大陆东岸、断鳞海路。
- 聚落：灰芽火塘地、环城、云箕雨台等。
- 资源：曜石、王级曜石、沙铜、压火铜。
- 动植物与王兽：黑脊地龙王、梦蛾、青息芽等。
- 势力：铜影会、铜日诸部、火环盟等。
- 事件：听潮灭族、灰芽寻芽礼、清缴环城等剧情节点。
