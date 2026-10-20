# 考公

中文公考学习平台：系统知识库、带出处的 AI 学习导师、用户额度与管理员工作台。

线上地址：[kaogong.guygubaby.top](https://kaogong.guygubaby.top)

## 功能

- 首页直接进入学习空间，未登录时前往明亮的中文登录／注册页；支持个人学习对话与在线资料阅读。
- Agent 每轮加载 `bryce-kaogong-doc`，调用检索、原文阅读、真题疑点和备用源码工具。
- 管理员配置 OpenAI Chat / Responses、Anthropic 兼容 API，拉取 `/models`、勾选开放模型、测试和保存默认模型。
- 密钥使用 AES-256-GCM 加密，浏览器只收到脱敏摘要；每段对话保持稳定的 `x-opencode-session`。
- 默认每人每日 50,000,000 tokens、每分钟 30 次业务接口请求。图片资源单独鉴权，不占用业务请求次数。
- Durable Objects 原子预留及结算额度，覆盖每个 Agent 步骤；正常按实际 usage 结算，缺失 usage 的中断保守入账。
- 管理员查看用户与请求记录，调整日额度、调用频率、今日消耗，停用账号；操作留审计记录。

## 技术栈

React 19、TanStack Start / Router、Vite 8、TypeScript、Tailwind CSS v4、shadcn 风格源代码组件、Motion、TanStack Query、AI SDK 7、Better Auth Cookie Session、Prisma、Cloudflare Workers / D1 / Durable Objects / R2。

数据层使用 D1 + Durable Objects，按本项目确认的方案替代 PostgreSQL + Redis。使用 Cloudflare CLI `cf` 和 `cloudflare.config.ts`。

界面采用薄荷绿与暖白底色，并用浅绿、杏色、淡粉区分学科入口。

## 本地开发

```bash
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
# 在 .dev.vars 填写随机密钥；ENCRYPTION_KEY 必须为 base64 编码的 32 字节。
pnpm exec prisma generate
pnpm dev
```

默认开发地址 `http://localhost:3007`，避免占用已有学习项目的 3000 端口。开发 runtime 目前最高支持 2026-10-19，生产 compatibility date 为 2026-10-20。

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm deploy
```

`pnpm deploy` 默认构建并部署；已构建时可执行 `pnpm exec cf deploy --prebuilt`。首次部署通过 `--secrets-file` 上传运行时密钥，后续部署沿用已有密钥。不要将 `.dev.vars`、`.env`、`.local/` 或知识库原始目录提交到 Git。

## 数据与管理员初始化

本实例 D1 数据库 ID：`76c6092c-748a-40e8-aeb6-ed05c680b16b`。资源名称在 `cloudflare.config.ts` 中配置。

```bash
pnpm exec cf d1 migrations apply 76c6092c-748a-40e8-aeb6-ed05c680b16b --dir prisma/migrations --pattern 'prisma/migrations/*/migration.sql'
```

首次初始化使用 `scripts/bootstrap-admin.ts`，它从本地 `.local/bootstrap.json` 读取管理员邮箱、随机密码和一次性初始化凭据；已有管理员时会拒绝再次初始化。初始管理员地址为 `admin@kaogong.guygubaby.top`，密码仅保存在部署者本机，不是通用默认密码。

## 知识库同步

公开 Git 仓库只包含应用代码。原始讲义、真题、图片与 Skill 索引经本地导出后进入私有 D1 / R2，在线读取需要登录。

```bash
pnpm knowledge:export
pnpm exec cf r2 objects put content.pack --bucket-name kaogong-knowledge --file .data/content.pack --content-type application/octet-stream
pnpm knowledge:sync
```

可通过 `KNOWLEDGE_SOURCE` 和 `KAOGONG_SKILL` 指定新的本地目录。SQL 导入只替换 `KnowledgeDocument`、`KnowledgeAsset` 和全文索引，保留用户、对话、额度与配置。当前同步是整体替换，应在维护窗口更新知识库，避免图片包与索引切换期间短暂不一致。

首批导出：22,640 份文档，包含 244 页讲义、11,282 道真题、考点/材料、Skill 和导航索引。原库的 2 张缺失公式图会在阅读时提示。未逐条校订知识内容；所谓官方解析与自动标注需结合题干核查。

## 模型接入

参考 [Open WebUI 的连接管理](https://docs.openwebui.com/getting-started/quick-start/connect-a-provider/starting-with-openai-compatible/)与 [LibreChat 自定义端点](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/custom_endpoint)的管理流程，采用 AI SDK 的官方 Provider 实现。

- 支持公开 HTTP / HTTPS 网关及公网 IPv4 地址；拒绝本机、内网、链路本地和不受支持的协议。HTTP 链路上的密钥与问题内容未加密。
- 基础地址应包含所需网关前缀，例如 `https://api.example.com/v1`。填写域名根路径时会补 `/v1`。
- Workers 不支持 `redirect: "error"`，请求统一使用 `manual`，只跟随同源且保留方法的 307/308（GET 可跟随同源跳转）；密钥不会跟随重定向到其他源。
- 默认最大输出 128,000 tokens。实际可用上限取决于所选模型；不支持时请在管理员配置中降低。
- 按 [OpenCode Go 文档](https://opencode.ai/v2/docs/console/go/#where-can-i-use-it)发送应用自身 User-Agent 和稳定会话头。其官方定位为编程 Agent 流量，教育聊天服务应使用允许此用途的 Provider；兼容请求头不能保证订阅适用或绕过服务限制。
- 未配置 Provider 时，知识库仍可阅读，对话页会明确提示管理员配置，不返回伪造 AI 回答。

## 发布

`main` 是生产分支。Cloudflare Workers Builds 已连接此仓库的 `main` 分支，自动构建并发布，运行时密钥和知识库存储独立于代码部署保留。

原资料的许可及出处以资料库原始说明为准。此仓库不重新授权第三方题干、解析和图片。
