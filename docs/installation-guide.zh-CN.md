# Collab Handoff 安装与使用手册

本文面向使用 Codex 进行前后端协作的团队，说明如何部署共享 Hub、为每位成员安装插件，以及如何使用“接口交接”和“前端求助”两条协作流程。

> 本文示例中的域名、邮箱、仓库和 Token 都是占位符。不要把真实 Token、数据库密码或 GitHub Token 写入 Git、Handoff 内容或聊天记录。

## 1. 组件与职责

Collab Handoff 由以下部分组成：

| 组件 | 部署位置 | 职责 |
| --- | --- | --- |
| Hub + PostgreSQL | 团队可访问的服务器 | 保存项目成员、Handoff、前端协助请求及其不可变事件记录 |
| GitHub 契约仓库 | 已登记的 GitHub 仓库 | 保存 OpenAPI、TypeScript、protobuf 等权威契约及其 commit |
| Codex 插件 | 每位协作者本机 | 通过 MCP 调用共享 Hub |

Hub 事件不是 DTO 的副本。接口变更的权威来源始终是已提交到 GitHub 的契约文件。

## 2. 部署前准备

服务端需要：

- Docker Desktop 或可用的 Docker Compose；
- 一个前端和后端成员都能访问的 HTTPS 域名或私网地址；
- 用于读取契约仓库的 GitHub Token：公共仓库可留空，私有仓库需要只读 Token；
- 本仓库的一个检出目录。

每位 Codex 协作者需要：

- 已安装 Codex；
- Node.js 20+，用于插件的 stdio MCP 桥；
- 本仓库的本地检出目录，以安装团队 Marketplace 中的插件；
- Hub 地址和仅属于自己的个人 Token。

## 3. 部署 Hub 服务

在服务端检出仓库后，创建 `.env`：

```powershell
git clone <你的仓库地址> collab-handoff
Set-Location collab-handoff
Copy-Item .env.example .env
node .\scripts\create-token.mjs # 用于 POSTGRES_PASSWORD
node .\scripts\create-token.mjs # 用于 HUB_BOOTSTRAP_TOKEN
```

将生成的两个值填写到 `.env`。私有 GitHub 仓库还要设置 `GITHUB_TOKEN`：

```dotenv
POSTGRES_PASSWORD=<随机数据库密码>
HUB_BOOTSTRAP_TOKEN=<随机初始化密钥>
GITHUB_TOKEN=<仅能读取契约仓库的 GitHub Token>
```

启动并检查服务：

```powershell
docker compose up -d --build
docker compose ps
Invoke-RestMethod http://127.0.0.1:8787/health
```

预期健康检查返回：

```json
{ "ok": true }
```

Docker 启动时会自动执行数据库迁移；升级到包含新迁移的版本前，应先按团队规范备份 PostgreSQL 卷。生产环境请用 HTTPS 和身份感知反向代理对外提供 Hub，不要把 `8787` 端口直接暴露到公网。

## 4. 初始化管理员与项目

`/v1/bootstrap` 只能成功一次。以下命令在服务端或能访问 Hub 的受控终端执行：

```powershell
$hubUrl = 'https://handoff.example.internal'
$bootstrapToken = '<.env 中的 HUB_BOOTSTRAP_TOKEN>'
$bootstrapBody = @{ email = 'admin@example.com'; displayName = 'Admin' } | ConvertTo-Json
$admin = Invoke-RestMethod "$hubUrl/v1/bootstrap" -Method Post -Headers @{ 'X-Bootstrap-Token' = $bootstrapToken } -ContentType 'application/json' -Body $bootstrapBody
$headers = @{ Authorization = "Bearer $($admin.token)" }
```

`$admin.token` 只会在该响应中返回一次。立即保存到密码管理器，不要粘贴到 Handoff、Issue 或普通聊天中。

创建项目并登记存放权威契约的 GitHub 仓库：

```powershell
Invoke-RestMethod "$hubUrl/v1/projects" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{
  projectKey = 'orders'
  name = 'Orders'
} | ConvertTo-Json)

Invoke-RestMethod "$hubUrl/v1/projects/orders/repositories" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{
  owner = 'your-github-org'
  repository = 'orders-api'
} | ConvertTo-Json)
```

`projectKey` 只能使用小写字母、数字和连字符，例如 `orders-api`。

## 5. 邀请前端和后端成员

管理员为每位成员登记角色。首次创建用户时，响应会包含仅返回一次的个人 Token：

```powershell
$frontend = Invoke-RestMethod "$hubUrl/v1/projects/orders/members" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{
  email = 'frontend@example.com'
  displayName = 'Frontend'
  role = 'frontend'
} | ConvertTo-Json)

$backend = Invoke-RestMethod "$hubUrl/v1/projects/orders/members" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{
  email = 'backend@example.com'
  displayName = 'Backend'
  role = 'backend'
} | ConvertTo-Json)
```

通过密码管理器或其他获批的秘密传递渠道，将 `frontend.token` 和 `backend.token` 分别交给对应成员。角色边界如下：

| 操作 | owner | backend | frontend | viewer |
| --- | --- | --- | --- | --- |
| 发布接口 Handoff | 可以 | 可以 | 不可以 | 不可以 |
| 创建前端协助请求 | 可以 | 不可以 | 可以 | 不可以 |
| 查看项目记录 | 可以 | 可以 | 可以 | 可以 |
| 回复协助请求 | 可以 | 可以 | 可以 | 不可以 |
| 关闭协助请求 | 可以 | 可以 | 可以 | 不可以 |

## 6. 每位成员安装 Codex 插件

每位成员都需要在自己的电脑获取本仓库，并在仓库根目录执行：

```powershell
Set-Location <本机 collab-handoff 检出目录>
codex plugin marketplace add .
codex plugin add collab-handoff@collab-handoff-community
```

设置自己的环境变量，替换为团队 Hub 地址和个人 Token：

```powershell
[Environment]::SetEnvironmentVariable('COLLAB_HANDOFF_HUB_URL', 'https://handoff.example.internal', 'User')
[Environment]::SetEnvironmentVariable('COLLAB_HANDOFF_HUB_TOKEN', 'ch_个人Token', 'User')
```

完全退出并重新启动 Codex，使 MCP 子进程读取新的环境变量。不要在前端和后端机器之间共用同一个个人 Token。

## 7. 日常协作：后端接口交接

适用场景：后端新增或修改了 API、DTO、错误码、分页、枚举等前端依赖的契约。

1. 后端将权威契约提交到已登记的 GitHub 仓库。
2. 后端在 Codex 中使用 `backend-handoff`，调用 `handoff_publish`，提交仓库、commit SHA、仓库相对路径和兼容性说明。
3. 前端使用 `handoff_list`、`handoff_get` 和 `contract_get` 读取同一份不可变契约快照。
4. 前端通过 `handoff_reply` 给出 `accepted`、`changes-required`、`decision-needed` 或 `cannot-verify` 回执。
5. 后端根据回执修订契约后重新发布；事项结束时由 owner 或 backend 调用 `handoff_resolve`。

发布 Handoff 时必须使用已提交的 Git SHA 和仓库相对路径，不能使用本机绝对路径或未提交的内容。

## 8. 日常协作：前端请求后端协助

适用场景：前端缺少接口、遇到联调阻塞、需要后端排查运行行为，且问题不属于某个已有 Handoff 的契约回执。

前端在 Codex 中调用 `assistance_request_create`，至少提供：

```json
{
  "projectKey": "orders",
  "subject": "orders.payment",
  "summary": "支付回调已收到，但前端没有可查询的终态。",
  "requestedHelp": ["确认查询接口和终态枚举。"],
  "idempotencyKey": "orders.payment:frontend-main:<当前集成版本>"
}
```

后端调用 `assistance_request_list` 查看待办、使用 `assistance_request_get` 阅读完整事件链，再调用 `assistance_request_reply` 回复：

- `acknowledged`：已接手排查或实现；
- `answered`：已给出可执行答案或已提交的变更依据；
- `decision-needed`：需要产品或业务方明确规则。

任一 owner、backend 或 frontend 都可调用 `assistance_request_resolve` 记录关闭结论。若答案导致接口契约变化，仍必须走第 7 节的正常 Handoff 流程，不能只在协助请求中描述 DTO。

当前 Hub 是共享记录与查询中心，不会主动唤醒另一位成员的 Codex 会话。后端需要在工作开始或约定的轮询点调用 `assistance_request_list` 查看新请求。

## 9. 常见问题

### Codex 看不到 MCP 工具

确认本机已执行插件安装命令、环境变量已经写入当前用户，并完全重启 Codex。插件的 MCP 桥需要 Node.js 20+。

### 返回 401 或没有项目访问权限

确认使用的是自己的 `ch_…` Token，Token 未被截断；再由项目 owner 检查该邮箱是否已加入对应 `projectKey`。客户端不能通过请求参数伪造角色。

### `bootstrap has already completed`

这是正常保护。初始化只能执行一次；请使用已保存的管理员个人 Token，而不是重复调用 Bootstrap。

### 发布 Handoff 时提示契约文件或 revision 不存在

确认仓库已登记、`revision` 是已经推送到 GitHub 的 commit SHA、`path` 是仓库相对路径。私有仓库还需检查 Hub 服务器上的 `GITHUB_TOKEN` 是否具备只读权限。

### 前端协助请求没有立即被后端看到

当前版本没有跨 Codex 会话的推送唤醒。后端需调用 `assistance_request_list`，或团队在已有通知工具中约定提醒方式；不要为此把协助请求内容复制成无版本的 DTO 聊天记录。

## 10. 安全与运维检查表

- [ ] Hub 通过 HTTPS 和受控反向代理访问。
- [ ] PostgreSQL 已纳入备份与恢复演练。
- [ ] `HUB_BOOTSTRAP_TOKEN` 在初始化后已轮换或妥善保管。
- [ ] `GITHUB_TOKEN` 仅具备必要仓库的只读权限，并只保存在 Hub 服务器。
- [ ] 每人持有独立个人 Token，离职或权限变更时按运维流程处理。
- [ ] 契约、Handoff 与协助请求中没有真实密码、Token、客户数据或机器绝对路径。

接口字段与完整 HTTP 路由请以 [PROTOCOL.md](../PROTOCOL.md) 为准；服务端部署细节见 [deploy.md](deploy.md)。
