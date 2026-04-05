# Claude-to-IM Pro: 工作原理

## 项目目标

**Claude-to-IM Pro** 实现了一个双向桥接，让你可以通过 Telegram、Discord、飞书等 IM 平台与 Claude Code 进行对话。

### 解决的问题

```
┌─────────────────────────────────────────────────────────┐
│  传统方式：必须在终端前使用 Claude Code                    │
│                                                         │
│  用户 ──► 终端 ──► Claude Code ──► 终端 ──► 用户          │
│                                                         │
│  限制：                                                  │
│  • 必须在电脑前                                          │
│  • 无法远程监控/干预                                      │
│  • 没有移动端支持                                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Claude-to-IM 方式：随时随地与 Claude Code 交互           │
│                                                         │
│  手机/平板 ──► Telegram ──► Claude Code                  │
│                    │                                    │
│                    ▼                                    │
│               Claude 执行任务                             │
│                    │                                    │
│                    ▼                                    │
│  手机/平板 ◄── Telegram ◄── 执行结果/进度                 │
│                                                         │
│  优势：                                                  │
│  • 随时随地通过手机沟通                                   │
│  • 实时监控 Claude 执行进度                               │
│  • 远程审批权限请求                                      │
│  • 支持多平台 (Telegram/Discord/飞书/QQ)                  │
└─────────────────────────────────────────────────────────┘
```

## 工作原理

### 整体架构

```
                            Claude-to-IM Pro
                         ┌─────────────────────┐
                         │   Bridge Manager    │ ◄─── 核心调度器
                         │   (orchestrator)    │
                         └──────────┬──────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ Telegram Adapter│      │ Discord Adapter │      │ Feishu Adapter  │
│                 │      │                 │      │                 │
│ • Poll API      │      │ • WebSocket     │      │ • Webhook       │
│ • 发送消息       │      │ • 发送消息       │      │ • 发送卡片       │
│ • 下载图片       │      │ • 编辑消息       │      │ • 更新卡片       │
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
         │                        │                        │
         └────────────────────────┴────────────────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Conversation Engine │ ◄─── LLM 对话处理
                         │                     │
                         │ • 流式响应处理       │
                         │ • 权限请求转发       │
                         │ • 上下文管理         │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Claude Code SDK     │ ◄─── AI 能力
                         │                     │
                         │ • 多轮对话          │
                         │ • 工具调用          │
                         │ • 代码执行          │
                         └─────────────────────┘
```

### 消息流转详解

#### 1. 用户发送消息 (手机 → Claude)

```
用户在 Telegram 发送: "帮我分析一下项目的 package.json"

                    ┌─────────────┐
                    │  手机 App   │
                    └──────┬──────┘
                           │ 发送消息
                           ▼
                    ┌─────────────┐
                    │ Telegram    │
                    │ 服务器      │
                    └──────┬──────┘
                           │ Webhook / Poll
                           ▼
                    ┌─────────────────────┐
                    │ Telegram Adapter    │
                    │ • 获取消息内容       │
                    │ • 检查用户权限       │
                    │ • 下载附件(如有)     │
                    └──────┬──────────────┘
                           │ InboundMessage
                           ▼
                    ┌─────────────────────┐
                    │ Bridge Manager      │
                    │ • 路由到对应会话     │
                    │ • 获取锁防止并发冲突 │
                    └──────┬──────────────┘
                           │
                           ▼
                    ┌─────────────────────┐
                    │ Conversation Engine │
                    │ • 加载历史上下文     │
                    │ • 调用 LLM          │
                    └─────────────────────┘
```

#### 2. Claude 处理并响应

```
Claude Code 开始处理请求:

                    ┌─────────────────────┐
                    │ Claude Code SDK     │
                    │ • 分析用户意图       │
                    │ • 决定使用工具       │
                    └──────┬──────────────┘
                           │ SSE Stream
                           ▼
              ┌────────────────────────────┐
              │ Conversation Engine        │
              │ 消费 SSE 事件流:           │
              │                            │
              │ • text → 累积响应文本      │
              │ • tool_use → 记录日志      │
              │ • permission_request →     │
              │   暂停流，等待用户审批      │
              │ • result → 提取 token 用量 │
              └────────────────────────────┘
```

#### 3. 权限审批流程

当 Claude 需要执行敏感操作（如运行 bash 命令）时：

```
Claude 请求执行: "ls -la"

                    ┌─────────────────────┐
                    │ Claude Code SDK     │
                    │ 发出 permission_    │
                    │ request 事件        │
                    └──────┬──────────────┘
                           │ 流暂停
                           ▼
                    ┌─────────────────────┐
                    │ Permission Broker   │
                    │ • 格式化审批请求     │
                    │ • 生成带按钮的消息   │
                    └──────┬──────────────┘
                           │
                           ▼
                    ┌─────────────────────┐
                    │ Telegram            │
                    │                     │
                    │  ┌───────────────┐  │
                    │  │ Claude 请求:  │  │
                    │  │ 执行命令      │  │
                    │  │ ls -la        │  │
                    │  │               │  │
                    │  │ [✓ 允许] [✗ 拒绝]│  │
                    │  └───────────────┘  │
                    └──────┬──────────────┘
                           │ 用户点击按钮
                           ▼
                    ┌─────────────────────┐
                    │ Permission Broker   │
                    │ • 验证请求有效性     │
                    │ • 解锁 SSE 流       │
                    └──────┬──────────────┘
                           │ 流继续
                           ▼
                    ┌─────────────────────┐
                    │ Claude Code SDK     │
                    │ 执行命令            │
                    │ 返回结果            │
                    └─────────────────────┘
```

#### 4. 响应发送回用户

```
                    ┌─────────────────────┐
                    │ Conversation Engine │
                    │ 完成处理，返回响应   │
                    └──────┬──────────────┘
                           │
                           ▼
                    ┌─────────────────────┐
                    │ Delivery Layer      │
                    │ • 分块(适配平台限制) │
                    │ • 格式转换(HTML/MD)  │
                    │ • 去重检查          │
                    └──────┬──────────────┘
                           │
                           ▼
                    ┌─────────────────────┐
                    │ Telegram Adapter    │
                    │ • 发送消息          │
                    │ • 支持流式预览       │
                    └──────┬──────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  手机 App   │
                    │  显示响应   │
                    └─────────────┘
```

### 核心组件说明

#### Bridge Manager (调度器)

```typescript
// 生命周期管理
await bridgeManager.start();   // 启动所有适配器
await bridgeManager.stop();    // 停止所有适配器
bridgeManager.getStatus();     // 获取运行状态

// 内部循环
while (running) {
  for (const adapter of adapters) {
    const message = await adapter.consumeOne();  // 获取消息
    if (message) {
      await handleMessage(message);  // 处理消息
    }
  }
}
```

#### Adapter (平台适配器)

每个平台一个适配器，实现统一接口：

```typescript
interface BaseChannelAdapter {
  channelType: string;           // 'telegram' | 'discord' | 'feishu' | 'qq'
  start(): Promise<void>;        // 启动监听
  stop(): Promise<void>;         // 停止监听
  isRunning(): boolean;          // 运行状态
  consumeOne(): Promise<InboundMessage | null>;  // 获取一条消息
  send(message: OutboundMessage): Promise<SendResult>;  // 发送消息
  validateConfig(): string | null;  // 配置验证
  isAuthorized(userId: string, chatId: string): boolean;  // 权限检查
}
```

#### Conversation Engine (对话引擎)

处理与 LLM 的交互：

```typescript
async function processMessage(sessionId, prompt) {
  // 1. 加载会话上下文
  const history = store.getMessages(sessionId);

  // 2. 获取流式响应
  const stream = llm.streamChat({
    prompt,
    sessionId,
    conversationHistory: history,
  });

  // 3. 消费 SSE 流
  for await (const event of parseSSE(stream)) {
    switch (event.type) {
      case 'text':
        response += event.data;
        // 可选：发送流式预览
        break;
      case 'permission_request':
        // 暂停流，发送审批请求
        await handlePermission(event.data);
        break;
      case 'result':
        // 提取 token 使用量等
        break;
    }
  }

  return response;
}
```

#### Delivery Layer (交付层)

确保消息可靠送达：

```typescript
async function deliver(chatId, text) {
  // 1. 分块
  const chunks = splitByPlatformLimit(text);

  for (const chunk of chunks) {
    // 2. 去重检查
    const dedupKey = hash(chatId, chunk);
    if (store.checkDedup(dedupKey)) continue;

    // 3. 发送（带重试）
    const result = await retryWithBackoff(() =>
      adapter.send({ chatId, text: chunk })
    );

    // 4. 记录
    store.insertDedup(dedupKey);
    store.insertAuditLog({ chatId, direction: 'outbound' });
  }
}
```

## 流式预览功能

支持实时显示 Claude 的响应进度：

```
用户视角：

[10:00:01] Claude 正在思考...
[10:00:03] Claude: 让我来看看...
[10:00:05] Claude: 让我来看看项目的 package.json 文件...
[10:00:08] Claude: 让我来看看项目的 package.json 文件，我发现了以下依赖：
           • react: 18.2.0
           • typescript: 5.0.0
           ...

最终消息更新为完整响应，整个过程用户可以看到实时进度。
```

## 安全机制

### 1. 用户白名单

```typescript
// 只有白名单中的用户可以使用
isAuthorized(userId: string): boolean {
  const allowed = store.getSetting('allowed_users');
  return allowed.split(',').includes(userId);
}
```

### 2. 速率限制

```typescript
// 每个聊天每分钟最多 20 条消息
const rateLimiter = new TokenBucket({
  capacity: 20,
  refillRate: 1,  // 每秒补充 1 个
});
```

### 3. 输入验证

```typescript
// 防止注入攻击
validateInput(input: string): string {
  // 移除危险字符
  // 限制长度
  // 检查格式
}
```

### 4. 权限审批

所有敏感操作都需要用户明确批准：

- Bash 命令执行
- 文件写入
- 网络请求
- 系统配置修改

## 为什么选择这个架构？

### 依赖注入 (DI)

```
所有模块通过 getBridgeContext() 获取依赖，
而非直接导入 host 实现。

好处：
• 可以轻松切换底层实现
• 方便单元测试（注入 mock）
• 解耦各模块
```

### 单例模式

```
Bridge Manager 状态保存在 globalThis，
在 Next.js HMR 时也能保持状态。

好处：
• 热更新不丢失连接
• 开发体验更好
```

### 事件驱动

```
通过 SSE 流处理 LLM 响应，
天然支持流式预览和暂停。

好处：
• 实时反馈
• 权限请求无阻塞感
• 内存效率高
```

---

了解更多：
- [开发指南](development.md)
- [Ubuntu 部署](ubuntu-deployment.md)
- [架构详解](../src/lib/bridge/ARCHITECTURE.md)
