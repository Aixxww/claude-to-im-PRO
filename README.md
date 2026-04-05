# Claude-to-IM Pro / Claude-to-IM Pro 增强版

[![npm version](https://badge.fury.io/js/claude-to-im-pro.svg)](https://www.npmjs.org/package/claude-to-im-pro)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node version](https://img.shields.io/node/%3E%3D20-brightgreen.svg)](https://nodejs.org)

> **通过 Telegram/Discord/飞书 远程使用 Claude Code**
>
> Connect Claude Code SDK to IM platforms with enhanced Telegram features

## 这是什么？/ What is this?

**中文：**

Claude-to-IM Pro 让你可以通过手机上的 Telegram、Discord、飞书等 IM 应用与 Claude Code 进行对话。

- 📱 **远程访问**：不在电脑前也能让 Claude 帮你写代码、分析文件
- 🔐 **权限审批**：Claude 执行敏感操作时，手机上实时收到审批请求
- ⚡ **流式预览**：实时看到 Claude 的响应进度
- 🌐 **代理支持**：完整的代理支持，国内用户无障碍使用

**English:**

Claude-to-IM Pro enables you to interact with Claude Code through mobile messaging apps like Telegram, Discord, and Feishu/Lark.

- 📱 **Remote Access**: Let Claude write code and analyze files even when away from your computer
- 🔐 **Permission Approval**: Receive real-time approval requests on your phone when Claude needs to execute sensitive operations
- ⚡ **Streaming Preview**: See Claude's response progress in real-time
- 🌐 **Proxy Support**: Full proxy support for users in China

## 快速理解 / Quick Understanding

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   手机 App   │ ◄─────► │ Claude-to-IM │ ◄─────► │  Claude Code │
│ (Telegram等) │         │     Pro      │         │     SDK      │
└──────────────┘         └──────────────┘         └──────────────┘
       │                        │                        │
       │                        │                        │
       ▼                        ▼                        ▼
  发送消息                 转换格式                   执行任务
  接收结果                 路由分发                   生成响应
  审批权限                 权限代理                   流式输出
```

**工作流程 / How it works:**

1. 你在 Telegram 发送: "帮我看看 package.json 的依赖" (Send message via Telegram)
2. Claude-to-IM 转发给 Claude Code (Forward to Claude Code SDK)
3. Claude 执行: 读取文件、分析依赖 (Claude executes: read file, analyze dependencies)
4. 如需权限: 手机弹窗让你审批 (If permission needed: approval popup on phone)
5. 结果返回: Telegram 显示分析结果 (Result: shown in Telegram)

详细原理请参阅 [**工作原理详解**](docs/HOW_IT_WORKS.md)。

## ✨ Features / 特性

### Core Features / 核心功能
- 🤖 **Multi-platform Support**: Telegram, Discord, Feishu/Lark, QQ
- 🔌 **Host-agnostic**: Works with any Claude SDK host, not just Claude Code CLI
- 💬 **Session Management**: Bind/unbind IM chats to Claude sessions
- 🔐 **Access Control**: Whitelist-based user authorization
- 📊 **Audit Logging**: Track all inbound/outbound messages

**核心功能:**
- 🤖 **多平台支持**: Telegram, Discord, Feishu/Lark, QQ
- 🔌 **主机无关**: 适用于任何 Claude SDK 主机, 不仅仅限于 Claude Code CLI
- 💬 **会话管理**: 绑定/解绑 IM 聊天与 Claude 会话
- 🔐 **访问控制**: 基于白名单的用户授权
- 📊 **审计日志**: 记录所有入站/出站消息

### 🚀 Enhanced Telegram Features / 增强的 Telegram 功能

Based on the official `claude-plugins-official/telegram` plugin, we've integrated:

基于官方 `claude-plugins-official/telegram` 插件，我们集成了：

#### Message Editing / 消息编辑
Edit previously sent messages for real-time progress updates ("working..." → result)

编辑已发送的消息用于实时进度更新 ("处理中..." → 结果)

```typescript
adapter.editMessage(chatId, messageId, "Updated content", "HTML");
```

#### Progress Updates / 进度更新
Send temporary status messages and update them upon completion

发送临时状态消息并在完成后更新

```typescript
// Send working status
const result = await adapter.sendProgressUpdate(chatId, "Processing...");

// ... do work ...

// Update to final result
await adapter.editMessage(chatId, result.messageId, "Done!");
```

#### Emoji Reactions / 表情反应
Add emoji reactions to messages (Telegram whitelist only)

添加表情反应到消息（仅限 Telegram 白名单表情）

```typescript
await adapter.addReaction(chatId, messageId, "👍");
await adapter.addReaction(chatId, messageId, "🔥");
```

#### Local Photo Storage / 本地照片存储
Automatically save received photos to local disk for persistence

自动保存收到的照片到本地磁盘以持久化

```bash
# Default save path: ~/.claude-to-im/inbox/
# Configure custom path:
CTI_TELEGRAM_IMAGE_SAVE_DIR=/path/to/photos
```

### Proxy Support / 代理支持
⚡ Full proxy support for China access via HTTP/HTTPS proxy

- Automatic proxy configuration via environment variables
- Compatible with popular proxy tools (Clash, V2Ray, etc.)
- Seamless integration with existing proxy setups

**代理支持:**
⚡ 通过 HTTP/HTTPS 代理完全支持国内访问
- 通过环境变量自动配置代理
- 兼容主流代理工具 (Clash, V2Ray 等)
- 与现有代理设置无缝集成

## 📦 Installation / 安装

```bash
npm install claude-to-im-pro
```

## 🚀 Quick Start / 快速开始

### Basic Integration / 基本集成

```typescript
import { initBridgeContext, bridgeManager } from 'claude-to-im-pro/lib/bridge/index.js';
import { JsonFileStore } from 'claude-to-im-pro/lib/bridge/host.js';
import { SDKLLMProvider } from '@anthropic-ai/claude-agent-sdk';

// Initialize bridge context
// 初始化桥接上下文
const store = new JsonFileStore('./data');
const llm = new SDKLLMProvider();

initBridgeContext({
  store,
  llm,
  permissions: {
    resolvePendingPermission: async (id, resolution) => {
      // Handle permission requests
      // 处理权限请求
    }
  }
});

// Start bridge
await bridgeManager.start();
```

### Telegram Bot Configuration / Telegram 机器人配置

```typescript
import { TelegramAdapter } from 'claude-to-im-pro/lib/bridge/adapters/telegram-adapter.js';

// Configure bot token
store.setSetting('telegram_bot_token', 'YOUR_BOT_TOKEN');
store.setSetting('bridge_telegram_enabled', 'true');
store.setSetting('telegram_bridge_allowed_users', 'USER_ID_1,USER_ID_2');

// Use enhanced features / 使用增强功能
const adapter = new TelegramAdapter();
await adapter.start();

// Message editing
await adapter.editMessage(chatId, messageId, "New text");

// Progress update
const result = await adapter.sendProgressUpdate(chatId, "Processing...");
await adapter.editMessage(chatId, result.messageId, "Complete!");

// Emoji reaction
await adapter.addReaction(chatId, messageId, "👍");

await adapter.stop();
```

## 📚 API Reference / API 参考

### TelegramAdapter

#### `editMessage(chatId, messageId, text, parseMode?)`
Edit a previously sent message

编辑已发送的消息

```typescript
await adapter.editMessage(
  '123456789',
  '456',
  'Updated content',
  'HTML' // or 'Markdown'
);
```

#### `sendProgressUpdate(chatId, workingText)`
Send a temporary status message for progress tracking

发送临时状态消息用于进度跟踪

```typescript
const result = await adapter.sendProgressUpdate(
  '123456789',
  '⏳ Processing...'
);
```

#### `addReaction(chatId, messageId, emoji)`
Add an emoji reaction to a message

添加表情反应到消息

```typescript
await adapter.addReaction('123456789', '456', '👍');
// Supported emojis: 👍 👎 ❤ 🔥 👀 🎉 ✅ ❌
```

## 🏗️ Architecture / 架构

```
┌─────────────────┐
│   Claude SDK    │
│  (LLM Provider) │
└────────┬────────┘
         │
┌────────▼────────┐
│ Bridge Manager  │
│  (Orchestration)│
└────────┬────────┘
         │
┌────────▼──────────────────────────────┐
│         Channel Adapters               │
├─────────┬──────────┬────────┬─────────┤
│Telegram │ Discord  │ Feishu │    QQ   │
│+ Edit   │          │        │         │
│+ React  │          │        │         │
│+ Photo │          │        │         │
└─────────┴──────────┴────────┴─────────┘
         │
┌────────▼────────┐
│   IM Platform   │
└─────────────────┘
```

## 🆚 Comparison with Official Plugin / 与官方插件对比

| Feature / 功能 | Official Plugin / 官方插件 | Claude-to-IM Pro |
|----------------|---------------------------|------------------|
| Message Editing / 消息编辑 | ✅ | ✅ |
| Emoji Reactions / 表情反应 | ✅ | ✅ |
| Photo Storage / 照片存储 | ✅ | ✅ |
| Proxy Support / 代理支持 | ❌ | ✅ |
| Multi-platform / 多平台 | ❌ (Telegram only) | ✅ |
| System Daemon / 系统守护 | ❌ | ✅ |
| Access Control / 访问控制 | Pairing only | ✅ (Whitelist) |

## 🔧 Configuration / 配置

### Environment Variables / 环境变量

```bash
# Bot Configuration / 机器人配置
CTI_TG_BOT_TOKEN=your_bot_token_here
CTI_TG_ALLOWED_USERS=user_id_1,user_id_2

# Proxy Configuration / 代理配置
CTI_HTTPS_PROXY=http://127.0.0.1:7897

# Photo Storage Configuration / 照片存储配置
CTI_TELEGRAM_IMAGE_SAVE_DIR=/path/to/photos

# Runtime Configuration / 运行配置
CTI_ENABLED_CHANNELS=telegram,discord
CTI_DEFAULT_WORKDIR=/Users/username
```

## 📝 License / 许可证

MIT License - see [LICENSE](LICENSE) file for details

MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 🤝 Contributing / 贡献

This project is an enhanced fork based on [op7418/claude-to-im](https://github.com/op7418/claude-to-im) with official Telegram plugin features integrated.

本项目是基于 [op7418/claude-to-im](https://github.com/op7418/claude-to-im) 的增强分支，集成了官方 Telegram 插件功能。

Contributions are welcome! Please feel free to submit a Pull Request.

欢迎贡献！请随时提交 Pull Request。

## 📄 Acknowledgments / 致谢

- [op7418/claude-to-im](https://github.com/op7418/claude-to-im) - Original bridge implementation
- [anthropics/claude-plugins](https://github.com/anthropics/claude-plugins-official) - Official Telegram plugin reference

## 📖 Documentation / 文档

| 文档 | 说明 |
|------|------|
| [工作原理详解](docs/HOW_IT_WORKS.md) | 项目目标、架构、消息流转详解 |
| [开发指南](docs/development.md) | 集成接口、SSE 格式、适配器开发 |
| [Ubuntu 部署](docs/ubuntu-deployment.md) | 生产环境部署、systemd 配置 |
| [架构详解](src/lib/bridge/ARCHITECTURE.md) | 模块依赖、设计决策 |

## 🔗 Links / 链接

- [GitHub Repository](https://github.com/Aixxww/claude-to-im-PRO)
- [NPM Package](https://www.npmjs.org/package/claude-to-im-pro)
- [Issues](https://github.com/Aixxww/claude-to-im-PRO/issues)

---

**Made with ❤️ by [Aixxww](https://github.com/Aixxww)**

**由 [Aixxww](https://github.com/Aixxww) ❤️ 制作**
