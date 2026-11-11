# DeepSeek Harness 的 MCP 目录

MCP 目录会找出本机已经配置的 MCP 服务器，把它们导入 DeepSeek Harness，并把一份精选清单中的服务器作为当前会话的可用工具挂载。它还会读取你指定的安装页面或仓库，展示其中能提取出的服务器定义。

这是一个 DSH 插件包：主机端持有服务器列表，并为每个服务器挂载 `@deepseek-ai/dsh-mcp-client`；浏览器端渲染一个带侧边栏入口的完整页面。

- [English](README.md)
- [Español](README.es.md)

## 功能

| 区域 | 行为 |
| --- | --- |
| 已安装 | 列出本插件管理的每个服务器、连接状态以及它发布的工具（`mcp__<名称>__*`）。可连接、编辑、停用、重连、删除。 |
| 目录 | 34 个精选服务器，覆盖开发、数据库、浏览器与测试、云与 DevOps、效率工具、搜索。可按名称、软件包、标签或分类搜索。 |
| 导入 | 读取 Claude Code、Claude Desktop、Cursor、VS Code、Codex、Gemini CLI、OpenCode（以及各项目的等价文件）中的 MCP 定义，也读取当前 DSH 配置已经加载的行。不会修改那些文件。 |
| 页面读取 | 抓取公开的 `https` 页面或 GitHub README，提取 `mcpServers` JSON 块和 `npx` / `uvx` / `pnpm` 安装命令，作为候选项供你审核。 |

所有安装路径最终都落到同一个表单：你检查命令或 URL、填写占位符、保存。不会静默挂载任何东西。

## 要求

- 支持插件的 DeepSeek Harness（`>=0.2.2-rc.1`，声明在 `dsh.engines.dsh`）。
- 本地 MCP 服务器需要 Node.js 22 或更高版本；插件本身运行在 DSH 内。
- 只有打开目录的页面读取或连接远程服务器时才需要网络；已安装列表和目录可离线使用。

## 安装

### 从本地目录安装（开发）

```bash
# 在本仓库中
dsh plugin --profile desktop add file:/dsh-mcp-catalog/的/绝对路径
```

或在应用中：设置 → 插件 → 安装 bundle → 选择该目录。替换已安装的副本后需要重启 DSH。

### 从已发布的市场索引安装

仓库自带市场索引 `docs/market/index.json`。把它添加为自定义来源：

1. 打开**插件**，在**实验性插件**旁选择**更多**，启用 **Custom plugin markets**。
2. 打开 **Discover** 标签页，添加来源 `https://canopus44.github.io/dsh-mcp-catalog/market/index.json`。
3. 从那里安装 **MCP Catalog**。

## 使用

在侧边栏打开 **MCP 目录**。页面默认停在 **已安装**，因为这才是关键状态：挂了什么、什么失败了、现在有哪些工具。

- **添加服务器** 打开的表单与目录、导入使用的一致。选择本地命令或远程 URL，按每行一个 `键=值` 粘贴环境变量，保存。
- **目录 → 使用** 会用精选条目预填表单。`{{FOLDER}}`、`{{DATABASE_PATH}}` 之类的占位符必须换成真实值，或换成同名的环境变量。
- **导入** 从其他客户端复制定义；指向页面时会从 README 提取候选项。两条路径都会进入审核表单。
- **删除** 需要第二次点击，随后卸载并删除定义。

状态为 `失败` 的服务器会在原处显示传输错误。进程已启动但尚未发布工具的服务器保持 `启动中`，直到 MCP 握手完成。

### 机密与占位符

键名看起来像机密的变量（`TOKEN`、`KEY`、`SECRET`、`PASSWORD`、`CREDENTIAL`、`AUTH`）在界面和工具输出中显示为 `••••••`。把带有该标记的表单原样保存会保留已存储的值。

参数、URL 或请求头中的 `{{名称}}` 会从该服务器自己的环境变量表填充。这样令牌只存一处：

```
URL:     https://mcp.example.com/sse
请求头:  Authorization: Bearer {{EXAMPLE_API_KEY}}
环境:    EXAMPLE_API_KEY=...
```

存在未解析占位符的定义会在保存前被拒绝，因此错误出现在表单里，而不是连接时。

## 配置

bundle 行接受以下选项：

| 选项 | 默认值 | 含义 |
| --- | --- | --- |
| `autoStart` | `true` | 插件启用时挂载已启用的服务器。 |
| `stateFile` | `""` | 覆盖状态文件路径。空值表示 `$DSH_HOME/mcp-market/servers.json`。 |
| `extraSources` | `[]` | 在导入标签页额外扫描的 MCP 配置文件。 |

在设置 → 插件 → MCP 目录中编辑。插件不会改写配置文件的 `cordis.patch.yml`；服务器列表保存在自己的状态文件中。

## 模型工具

主机端注册七个工具，代理无需面板即可管理服务器：

| 工具 | 用途 |
| --- | --- |
| `mcp_catalog_search` | 搜索精选目录。 |
| `mcp_catalog_status` | 列出已安装服务器、阶段和已发布工具。 |
| `mcp_catalog_install` | 校验并挂载定义。 |
| `mcp_catalog_remove` | 卸载并删除服务器。 |
| `mcp_catalog_toggle` | 启用或停用，不删除。 |
| `mcp_catalog_discover` | 扫描本地客户端配置和 DSH 行。 |
| `mcp_catalog_inspect` | 读取页面或仓库并提取候选项。 |

工具返回 JSON。定义编辑保留在面板中，避免模型在审核后悄悄改动命令。

## 安全说明

- HTTP 接口是 `/api/dsh-mcp-catalog` 下的七个路由。DSH 只为主人身份转发；写操作还要求 `x-dsh-mcp-catalog` 请求头和同源 `Origin`。
- 环境变量以明文保存在 `$DSH_HOME/mcp-market/servers.json`，文件权限为 `0600`。DSH 的 stdio 传输只在这份显式映射之上合并经过清理的父环境，因此 MCP 服务器不会继承无关的环境凭据。
- 页面读取只接受公开 `https` URL，解析 DNS 并拒绝私有与链路本地地址，响应上限 2 MiB，最多跟随三次重定向。
- 导入只读取其他客户端的配置文件，从不写入。
- 需要 OAuth 的远程 MCP 服务器会带说明列出。DSH 的 MCP 客户端使用带请求头的 streamable HTTP，而不是 OAuth 流程；请使用令牌请求头，或在服务器只支持 OAuth 时通过 `mcp-remote` 中转。

## 开发

```bash
npm test        # 单元测试（node:test）
npm run check   # 清单、导出、语言包、图标、目录、索引、语法
```

结构：

```
index.js              主机入口：配置、路由、工具、生命周期
lib/                  状态、服务器、目录、发现、市场、路由、工具、页面检查
client/client.js      面板界面（module loader bundle，React 来自模块表）
data/catalog.json     三语精选服务器
docs/market/          已发布的市场索引与图标
scripts/check.mjs     发布前检查
test/                 单元测试
```

面板只使用主机主题 token，不复制界面基础组件。服务器状态通过单一队列串行化，因此两次安装不会争用同一个状态文件。

## 许可证

MIT。
