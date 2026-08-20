# Collab Handoff for Codex

**简体中文** | [English](README.md)

Collab Handoff 是一个开源、自托管的 AI 联调协作服务。它让后端与前端在各自独立的 Codex 会话中，围绕同一份接口契约协作，而不是反复复制 DTO、Markdown 或聊天记录。

它由三部分组成：

- Git 中可审查的权威契约源；
- 可查询、可追溯的 Handoff Hub，用于记录变更、回执、阻塞项与关闭结果；
- Codex MCP 桥接器，让每位协作者的 Codex 直接访问同一个 Hub。

契约格式不受限制：可以是 TypeScript、OpenAPI、protobuf、JSON Schema、生成代码，或 API 平台上的不可变版本。

## 为什么需要它

聊天记录不是接口事实来源：上下文容易丢失，内容可能滞后于真实 DTO，也难以做审查和追踪。

Collab Handoff 以 Git 中指定 commit 的契约文件为权威来源。后端发布接口变更后，Hub 校验 GitHub 上的文件与 SHA 并保存不可变快照；前端 Codex 直接读取同一快照并提交回执。人只处理真正需要决策的问题。

## 项目包含什么

- `plugins/collab-handoff`：包含 `backend-handoff` 与 `frontend-query` Skill 的 Codex 插件；
- `.agents/plugins/marketplace.json`：仓库级插件 Marketplace；
- `packages/hub`：基于 PostgreSQL 的自托管 Hub、GitHub 契约连接器、数据库迁移和测试；
- `PROTOCOL.md`：v1 协议与 HTTP API；
- `contracts/`：共享契约示例；
- `examples/`：可复制的 API 请求示例。

## 自托管快速开始

推荐通过 Docker Compose 部署。完整操作见[部署文档](docs/deploy.md)。

1. 创建 `.env`，生成数据库密码和初始化密钥，然后启动服务：

   ```powershell
   Copy-Item .env.example .env
   node .\scripts\create-token.mjs # 执行两次，分别用于数据库密码和初始化密钥
   # 将两个值写入 .env 后执行：
   docker compose up -d --build
   ```

   数据存储在 PostgreSQL 中。团队应部署一个所有协作者都可访问的 Hub。

2. 将权威接口契约保存在 Git 中。Hub 事件不是契约本身。
3. 配置仓库 Marketplace：

   ```powershell
   codex plugin marketplace add .
   codex plugin add collab-handoff@collab-handoff-community
   ```

4. 仅首次：初始化管理员、创建项目、登记 GitHub 仓库并邀请后端/前端成员。初始化接口只返回一次管理员个人 `ch_…` Token，请保存在密码管理器中。

5. 每位协作者在自己的电脑设置 Hub 地址和自己的个人 Token，然后重启 Codex：

   ```powershell
   $env:COLLAB_HANDOFF_HUB_URL = "https://handoff.example.internal"
   $env:COLLAB_HANDOFF_HUB_TOKEN = "ch_personal_token_returned_by_the_hub"
   ```

6. 新开一个 Codex 会话。后端调用 `handoff_publish`；前端调用 `handoff_list`、`handoff_get`、`contract_get` 与 `handoff_reply`。

Hub 会校验指定 Git SHA 的 GitHub 文件，并存储不可变内容快照。身份与权限由个人 Token 和项目成员关系决定，不能由客户端传入的角色或名称决定。

## 工作流

```text
后端修改 contracts/… ──> handoff_publish ──> Handoff Hub
        │                                      │
        └────────── 权威契约源 ────────────────┤
                                               │
前端读取相同的 contracts/… <── contract_get ───┘
        │
        └──────────────────── handoff_reply ──> Handoff Hub
                                                   │
后端或产品关闭事项 <────── handoff_resolve ───────┘
```

Handoff 必须引用已登记仓库中的 Git commit SHA 和仓库相对路径。Hub 不接受绝对本地路径。

## 契约目录建议

将稳定发布的契约与临时内容分离，例如：

```text
contracts/
  orders/
    order-api.openapi.yaml
  generated/
    order-api.ts
```

不要把凭证、生产数据或机器绝对路径写入契约或 Handoff。

## 部署与安全边界

v1 使用项目成员关系和每用户个人 Token。生产部署仍应配置 HTTPS 与身份感知反向代理。GitHub 访问凭证只保存在 Hub 服务器，绝不能放入 MCP 请求、Handoff 内容或提交到 Git 的 `.env` 文件。

协议边界保持稳定：后续可以替换 Hub 的内部实现，Codex MCP 桥接器和调用方式保持不变。

## 贡献

参阅[贡献指南](CONTRIBUTING.md)。协议修改应保持向后兼容；如有破坏性变更，需要在发布说明中提供迁移路径。

## 许可证

[MIT](LICENSE)
