# AgentHub

你的AI智能体配置中心

[English Version](./README.md)

---

## 系统要求

- Windows: Windows 10 及以上
- macOS: macOS 12 (Monterey) 及以上
- Linux: Ubuntu 22.04+ / Debian 11+ / Fedora 34+ 及其他主流发行版

---

## 功能

### 统一 MCP 管理

- 一次配置，部署到 22+ 支持的助手
- 支持本地 Stdio 和远程（SSE 和 StreamableHttp） 连线方式
- 无需删除即可启用或禁用服务器
- 单条命令查看和审计所有助手的服务器

### 技能市场 + 内网 Git

- 导入 `.skill` 包或使用 SKILL.md 前言编写技能
- 浏览并安装 skills.sh 市场中的技能
- 从公司内网 Git 技能仓库搜索并安装技能
- 在 `设置 > 集成` 配置“内部技能仓库地址”

### MCP 市场（官方 + 内网）

- 同时支持官方 MCP Registry 与内网 MCP 目录仓库
- 在 `设置 > 集成` 配置“内部 MCP 目录仓库地址”
- 统一展示公开与内网来源的目录信息

### 集成与凭据

- 选择用于打开文件/目录的首选代码编辑器
- 新增、删除并管理凭据（例如 GitHub 访问令牌）
- 支持 MCP、技能、子代理的全局/项目作用域
