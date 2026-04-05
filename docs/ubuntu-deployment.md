# Ubuntu Deployment Guide

This guide covers deploying Claude-to-IM Pro on Ubuntu Server (20.04/22.04/24.04).

## Prerequisites

### System Requirements

- Ubuntu Server 20.04+ (LTS recommended)
- Node.js 20+ (required)
- 512MB RAM minimum, 1GB recommended
- systemd for process management

### Install Node.js 20

```bash
# Using NodeSource (recommended)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version
```

### Install Build Tools

Some native dependencies require build tools:

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3
```

## Installation

### Option 1: Install from NPM (Recommended)

```bash
# Create installation directory
sudo mkdir -p /opt/claude-to-im
sudo chown $USER:$USER /opt/claude-to-im
cd /opt/claude-to-im

# Initialize project
npm init -y

# Install claude-to-im-pro and SDK
npm install claude-to-im-pro @anthropic-ai/claude-agent-sdk
```

### Option 2: Clone from GitHub

```bash
# Clone repository
git clone https://github.com/Aixxww/claude-to-im-PRO.git /opt/claude-to-im
cd /opt/claude-to-im

# Install dependencies
npm install

# Build (if needed)
npm run build
```

## Configuration

### Create Configuration Directory

```bash
mkdir -p ~/.claude-to-im
chmod 700 ~/.claude-to-im
```

### Create config.env

```bash
cat > ~/.claude-to-im/config.env << 'EOF'
# Master switch
CTI_REMOTE_BRIDGE_ENABLED=true

# Telegram configuration
CTI_TG_BOT_TOKEN=your_bot_token_here
CTI_TG_ALLOWED_USERS=your_telegram_user_id
CTI_TG_ENABLED=true

# Discord configuration (optional)
# CTI_DISCORD_BOT_TOKEN=your_discord_token
# CTI_DISCORD_ALLOWED_USERS=user_id_1,user_id_2
# CTI_DISCORD_ENABLED=true

# Feishu/Lark configuration (optional)
# CTI_FEISHU_APP_ID=cli_xxx
# CTI_FEISHU_APP_SECRET=your_secret
# CTI_FEISHU_ENABLED=true

# Default settings
CTI_DEFAULT_CWD=/home/youruser/projects
CTI_DEFAULT_MODEL=claude-sonnet-4-20250514

# Proxy configuration (if needed)
# CTI_HTTPS_PROXY=http://127.0.0.1:7890
EOF

chmod 600 ~/.claude-to-im/config.env
```

### Environment Variables

Add to `~/.bashrc` or `~/.profile`:

```bash
export CTI_HOME=~/.claude-to-im
```

## Creating a Host Application

Claude-to-IM Pro is a library. Create a host application to run it:

### Create host entry point

```bash
cat > /opt/claude-to-im/host.js << 'EOF'
import { initBridgeContext, bridgeManager } from 'claude-to-im-pro/lib/bridge/index.js';
import { JsonFileStore } from 'claude-to-im-pro/lib/bridge/stores/json-file-store.js';
import { ClaudeCodeAgent } from '@anthropic-ai/claude-agent-sdk';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CTI_HOME = process.env.CTI_HOME || path.join(os.homedir(), '.claude-to-im');

// Load config.env before any imports
const configPath = path.join(CTI_HOME, 'config.env');
try {
  const configContent = fs.readFileSync(configPath, 'utf-8');
  const proxyMatch = configContent.match(/^CTI_HTTPS_PROXY=(.+)$/m);
  if (proxyMatch) {
    const proxyUrl = proxyMatch[1].trim().replace(/['"]/g, '');
    process.env.HTTP_PROXY = proxyUrl;
    process.env.HTTPS_PROXY = proxyUrl;
  }
} catch (err) {
  console.log('[host] No config.env found, using defaults');
}

// Simple JSON file store
class SimpleStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.settings = {};
    this.sessions = new Map();
    this.bindings = new Map();
    this.messages = new Map();
    this.locks = new Map();
    this.offsets = new Map();
    this.dedup = new Map();
    this.permissionLinks = new Map();
    this.auditLog = [];
    this.load();
  }

  load() {
    try {
      const data = fs.readFileSync(path.join(this.dataDir, 'store.json'), 'utf-8');
      const parsed = JSON.parse(data);
      this.settings = parsed.settings || {};
      this.sessions = new Map(Object.entries(parsed.sessions || {}));
      this.bindings = new Map(Object.entries(parsed.bindings || {}));
    } catch (err) {
      // First run, no data
    }
  }

  save() {
    const data = {
      settings: this.settings,
      sessions: Object.fromEntries(this.sessions),
      bindings: Object.fromEntries(this.bindings),
    };
    fs.writeFileSync(path.join(this.dataDir, 'store.json'), JSON.stringify(data, null, 2));
  }

  getSetting(key) { return this.settings[key] || null; }
  setSetting(key, value) { this.settings[key] = value; this.save(); }

  getChannelBinding(type, chatId) {
    return this.bindings.get(`${type}:${chatId}`) || null;
  }
  upsertChannelBinding(data) {
    const key = `${data.channelType}:${data.chatId}`;
    const binding = { id: key, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.bindings.set(key, binding);
    this.save();
    return binding;
  }
  updateChannelBinding(id, updates) {
    const binding = this.bindings.get(id);
    if (binding) {
      Object.assign(binding, updates, { updatedAt: new Date().toISOString() });
      this.bindings.set(id, binding);
      this.save();
    }
  }
  listChannelBindings(type) {
    return Array.from(this.bindings.values()).filter(b => !type || b.channelType === type);
  }

  getSession(id) { return this.sessions.get(id) || null; }
  createSession(name, model, sys, cwd) {
    const id = `session_${Date.now()}`;
    const session = { id, name, model, working_directory: cwd || process.cwd() };
    this.sessions.set(id, session);
    this.save();
    return session;
  }
  updateSessionProviderId(sessionId, providerId) {
    const session = this.sessions.get(sessionId);
    if (session) { session.provider_id = providerId; this.save(); }
  }

  addMessage(sessionId, role, content, usage) {
    const msgs = this.messages.get(sessionId) || [];
    msgs.push({ role, content, usage, timestamp: new Date().toISOString() });
    this.messages.set(sessionId, msgs);
  }
  getMessages(sessionId, opts) {
    const msgs = this.messages.get(sessionId) || [];
    return { messages: opts?.limit ? msgs.slice(-opts.limit) : msgs };
  }

  acquireSessionLock(sessionId, lockId, owner, ttlSecs) {
    const existing = this.locks.get(sessionId);
    if (existing && new Date() < new Date(existing.expiresAt)) return false;
    this.locks.set(sessionId, { lockId, owner, expiresAt: new Date(Date.now() + ttlSecs * 1000).toISOString() });
    return true;
  }
  renewSessionLock(sessionId, lockId, ttlSecs) {
    const lock = this.locks.get(sessionId);
    if (lock?.lockId === lockId) {
      lock.expiresAt = new Date(Date.now() + ttlSecs * 1000).toISOString();
    }
  }
  releaseSessionLock(sessionId, lockId) {
    const lock = this.locks.get(sessionId);
    if (lock?.lockId === lockId) this.locks.delete(sessionId);
  }
  setSessionRuntimeStatus(sessionId, status) {}

  getChannelOffset(key) { return this.offsets.get(key) || ''; }
  setChannelOffset(key, offset) { this.offsets.set(key, offset); }

  checkDedup(key) { return this.dedup.has(key); }
  insertDedup(key) { this.dedup.set(key, Date.now()); }
  cleanupExpiredDedup() {
    const expiry = Date.now() - 86400000; // 24 hours
    for (const [k, v] of this.dedup) {
      if (v < expiry) this.dedup.delete(k);
    }
  }

  insertAuditLog(entry) { this.auditLog.push({ ...entry, timestamp: new Date().toISOString() }); }

  insertPermissionLink(link) {
    this.permissionLinks.set(link.permissionRequestId, { ...link, resolved: false });
  }
  getPermissionLink(id) { return this.permissionLinks.get(id) || null; }
  markPermissionLinkResolved(id) {
    const link = this.permissionLinks.get(id);
    if (link && !link.resolved) { link.resolved = true; return true; }
    return false;
  }

  insertOutboundRef(ref) {}
  updateSdkSessionId(sessionId, sdkId) {}
  updateSessionModel(sessionId, model) {}
  syncSdkTasks(sessionId, todos) {}
  getProvider(id) { return undefined; }
  getDefaultProviderId() { return null; }

  getSetting(key) {
    // Map CTI_* env vars to bridge settings
    const envMap = {
      'CTI_REMOTE_BRIDGE_ENABLED': 'remote_bridge_enabled',
      'CTI_TG_BOT_TOKEN': 'telegram_bot_token',
      'CTI_TG_ALLOWED_USERS': 'telegram_bridge_allowed_users',
      'CTI_TG_ENABLED': 'bridge_telegram_enabled',
      'CTI_DISCORD_BOT_TOKEN': 'bridge_discord_bot_token',
      'CTI_DISCORD_ALLOWED_USERS': 'bridge_discord_allowed_users',
      'CTI_DISCORD_ENABLED': 'bridge_discord_enabled',
      'CTI_FEISHU_APP_ID': 'bridge_feishu_app_id',
      'CTI_FEISHU_APP_SECRET': 'bridge_feishu_app_secret',
      'CTI_FEISHU_ENABLED': 'bridge_feishu_enabled',
      'CTI_DEFAULT_CWD': 'bridge_default_cwd',
      'CTI_DEFAULT_MODEL': 'bridge_model',
    };

    // Check env first
    for (const [env, setting] of Object.entries(envMap)) {
      if (setting === key && process.env[env]) {
        return process.env[env];
      }
    }

    return this.settings[key] || null;
  }
}

// LLM Provider using Claude Agent SDK
class SDKLLMProvider {
  streamChat(params) {
    return new ReadableStream({
      async start(controller) {
        try {
          const agent = new ClaudeCodeAgent({
            model: params.model || 'claude-sonnet-4-20250514',
            workingDirectory: params.workingDirectory || process.cwd(),
          });

          for await (const event of agent.stream(params.prompt)) {
            const sseEvent = { type: event.type, data: JSON.stringify(event) };
            controller.enqueue(`data: ${JSON.stringify(sseEvent)}\n`);
          }
          controller.close();
        } catch (err) {
          controller.enqueue(`data: ${JSON.stringify({ type: 'error', data: err.message })}\n`);
          controller.close();
        }
      }
    });
  }
}

// Permission Gateway
class SimplePermissionGateway {
  constructor() {
    this.pending = new Map();
  }

  resolvePendingPermission(id, resolution) {
    const resolve = this.pending.get(id);
    if (!resolve) return false;
    resolve(resolution);
    this.pending.delete(id);
    return true;
  }

  register(id, resolve) {
    this.pending.set(id, resolve);
  }
}

// Initialize
fs.mkdirSync(CTI_HOME, { recursive: true });
const store = new SimpleStore(CTI_HOME);
const llm = new SDKLLMProvider();
const permissions = new SimplePermissionGateway();

initBridgeContext({
  store,
  llm,
  permissions,
  lifecycle: {
    onBridgeStart: () => console.log('[bridge] Started'),
    onBridgeStop: () => console.log('[bridge] Stopped'),
  },
});

// Start
bridgeManager.start().then(() => {
  console.log('[host] Bridge manager started');
  console.log('[host] Status:', bridgeManager.getStatus());
}).catch(err => {
  console.error('[host] Failed to start:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[host] Shutting down...');
  await bridgeManager.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[host] Received SIGTERM...');
  await bridgeManager.stop();
  process.exit(0);
});
EOF
```

## systemd Service

### Create Service File

```bash
sudo cat > /etc/systemd/system/claude-to-im.service << 'EOF'
[Unit]
Description=Claude-to-IM Bridge Service
Documentation=https://github.com/Aixxww/claude-to-im-PRO
After=network.target

[Service]
Type=simple
User=youruser
Group=youruser
WorkingDirectory=/opt/claude-to-im
Environment="CTI_HOME=/home/youruser/.claude-to_im"
Environment="NODE_ENV=production"
# Uncomment if using proxy
# Environment="CTI_HTTPS_PROXY=http://127.0.0.1:7890"
ExecStart=/usr/bin/node /opt/claude-to-im/host.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=claude-to-im

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
```

**Important:** Replace `youruser` with your actual username.

### Enable and Start

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable on boot
sudo systemctl enable claude-to-im

# Start service
sudo systemctl start claude-to-im

# Check status
sudo systemctl status claude-to-im
```

### View Logs

```bash
# Follow logs
sudo journalctl -u claude-to-im -f

# Recent logs
sudo journalctl -u claude-to-im -n 100
```

## Firewall Configuration

If using UFW:

```bash
# Allow outbound HTTPS (for Telegram/Discord APIs)
sudo ufw allow out 443/tcp

# No inbound ports needed (bridge only makes outbound connections)
```

## Proxy Configuration

### For China Users

If you need to use a proxy to access Telegram/Discord APIs:

1. **Environment variable method:**

```bash
# Add to config.env
echo "CTI_HTTPS_PROXY=http://127.0.0.1:7890" >> ~/.claude-to-im/config.env

# Or in systemd service file
sudo systemctl edit claude-to-im
# Add:
[Service]
Environment="CTI_HTTPS_PROXY=http://127.0.0.1:7890"
```

2. **Using a local proxy (Clash/V2Ray):**

```bash
# Install your proxy client
# Configure it to listen on 127.0.0.1:7890

# Test connection
curl -x http://127.0.0.1:7890 https://api.telegram.org/bot<TOKEN>/getMe
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs
sudo journalctl -u claude-to-im -n 50 --no-pager

# Common issues:
# 1. Node.js version too old: node --version (needs 20+)
# 2. Missing config: cat ~/.claude-to-im/config.env
# 3. Permission denied: chmod 600 ~/.claude-to-im/config.env
```

### No Messages Received

1. Check bot token is correct
2. Verify user ID in allowed_users
3. Test bot directly from Telegram app
4. Check logs for API errors

### High Memory Usage

```bash
# Check memory
ps aux | grep node

# Limit memory if needed
sudo systemctl edit claude-to-im
# Add:
[Service]
MemoryMax=512M
```

### Connection Timeout

```bash
# Test API connectivity
curl -v https://api.telegram.org/bot<TOKEN>/getMe

# If timeout, check proxy settings
echo $HTTPS_PROXY
```

## Updates

### Update Library

```bash
cd /opt/claude-to-im
npm update claude-to-im-pro
sudo systemctl restart claude-to-im
```

### Update from Git

```bash
cd /opt/claude-to-im
git pull
npm install
npm run build
sudo systemctl restart claude-to-im
```

## Uninstall

```bash
# Stop and disable service
sudo systemctl stop claude-to-im
sudo systemctl disable claude-to-im
sudo rm /etc/systemd/system/claude-to-im.service
sudo systemctl daemon-reload

# Remove files (optional)
rm -rf /opt/claude-to-im
rm -rf ~/.claude-to-im
```
