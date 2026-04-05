/**
 * JsonFileStore - File-based implementation of BridgeStore
 *
 * A simple persistent store that saves data to a JSON file.
 * Suitable for single-process deployments and development.
 *
 * Usage:
 * ```typescript
 * import { JsonFileStore } from 'claude-to-im-pro/lib/bridge/stores/json-file-store.js';
 *
 * const store = new JsonFileStore('/path/to/data.json');
 * store.setSetting('telegram_bot_token', 'YOUR_TOKEN');
 * ```
 *
 * For production multi-process deployments, consider using
 * a database-backed store (SQLite, PostgreSQL, etc.).
 */

import fs from 'fs';
import path from 'path';
import type {
  BridgeStore,
  BridgeSession,
  BridgeMessage,
  BridgeApiProvider,
  AuditLogInput,
  PermissionLinkInput,
  PermissionLinkRecord,
  OutboundRefInput,
} from '../host.js';
import type { ChannelBinding, ChannelType } from '../types.js';

interface JsonFileData {
  settings: Record<string, string>;
  sessions: Record<string, BridgeSession>;
  bindings: Record<string, ChannelBinding>;
  messages: Record<string, Array<{ role: string; content: string; usage?: string; timestamp: string }>>;
  locks: Record<string, { lockId: string; owner: string; expiresAt: number }>;
  offsets: Record<string, string>;
  dedup: Record<string, number>;
  permissionLinks: Record<string, PermissionLinkRecord & { toolName: string; suggestions: string }>;
  auditLog: Array<AuditLogInput & { timestamp: string }>;
  outboundRefs: Array<OutboundRefInput & { timestamp: string }>;
  sdkSessions: Record<string, string>;
  sessionModels: Record<string, string>;
  sessionTodos: Record<string, unknown>;
  sessionStatus: Record<string, string>;
}

export class JsonFileStore implements BridgeStore {
  private filePath: string;
  private data: JsonFileData;
  private savePending = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dataPath: string) {
    // Ensure directory exists
    const dir = path.dirname(dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.filePath = dataPath;
    this.data = this.load();
  }

  private load(): JsonFileData {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (err) {
      console.warn('[JsonFileStore] Failed to load, starting fresh:', err);
    }

    return {
      settings: {},
      sessions: {},
      bindings: {},
      messages: {},
      locks: {},
      offsets: {},
      dedup: {},
      permissionLinks: {},
      auditLog: [],
      outboundRefs: [],
      sdkSessions: {},
      sessionModels: {},
      sessionTodos: {},
      sessionStatus: {},
    };
  }

  private save() {
    // Debounce saves to avoid excessive disk writes
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.savePending = true;
    this.saveTimer = setTimeout(() => {
      this.flush();
    }, 100);
  }

  private flush() {
    if (!this.savePending) return;
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
      this.savePending = false;
    } catch (err) {
      console.error('[JsonFileStore] Failed to save:', err);
    }
  }

  // Sync flush for graceful shutdown
  sync() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.flush();
  }

  // ── Settings ────────────────────────────────────────────────

  getSetting(key: string): string | null {
    return this.data.settings[key] ?? null;
  }

  setSetting(key: string, value: string): void {
    this.data.settings[key] = value;
    this.save();
  }

  // ── Channel Bindings ─────────────────────────────────────────

  getChannelBinding(channelType: string, chatId: string): ChannelBinding | null {
    return this.data.bindings[`${channelType}:${chatId}`] ?? null;
  }

  upsertChannelBinding(data: {
    channelType: string;
    chatId: string;
    codepilotSessionId: string;
    sdkSessionId?: string;
    workingDirectory: string;
    model: string;
    mode?: string;
  }): ChannelBinding {
    const key = `${data.channelType}:${data.chatId}`;
    const existing = this.data.bindings[key];
    const now = new Date().toISOString();

    const binding: ChannelBinding = {
      id: existing?.id || `binding_${Date.now()}`,
      channelType: data.channelType,
      chatId: data.chatId,
      codepilotSessionId: data.codepilotSessionId,
      sdkSessionId: data.sdkSessionId ?? existing?.sdkSessionId ?? '',
      workingDirectory: data.workingDirectory ?? existing?.workingDirectory ?? '',
      model: data.model ?? existing?.model ?? '',
      mode: (data.mode as ChannelBinding['mode']) ?? existing?.mode ?? 'code',
      active: existing?.active ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.data.bindings[key] = binding;
    this.save();
    return binding;
  }

  updateChannelBinding(id: string, updates: Partial<ChannelBinding>): void {
    for (const key of Object.keys(this.data.bindings)) {
      if (this.data.bindings[key].id === id) {
        this.data.bindings[key] = {
          ...this.data.bindings[key],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        this.save();
        break;
      }
    }
  }

  listChannelBindings(channelType?: ChannelType): ChannelBinding[] {
    const bindings = Object.values(this.data.bindings);
    if (!channelType) return bindings;
    return bindings.filter(b => b.channelType === channelType);
  }

  // ── Sessions ─────────────────────────────────────────────────

  getSession(id: string): BridgeSession | null {
    return this.data.sessions[id] ?? null;
  }

  createSession(
    name: string,
    model: string,
    systemPrompt?: string,
    cwd?: string,
    mode?: string,
  ): BridgeSession {
    const session: BridgeSession = {
      id: `session_${Date.now()}`,
      working_directory: cwd ?? process.cwd(),
      model,
      system_prompt: systemPrompt,
    };
    this.data.sessions[session.id] = session;
    this.save();
    return session;
  }

  updateSessionProviderId(sessionId: string, providerId: string): void {
    const session = this.data.sessions[sessionId];
    if (session) {
      session.provider_id = providerId;
      this.save();
    }
  }

  // ── Messages ────────────────────────────────────────────────

  addMessage(sessionId: string, role: string, content: string, usage?: string | null): void {
    if (!this.data.messages[sessionId]) {
      this.data.messages[sessionId] = [];
    }
    this.data.messages[sessionId].push({
      role,
      content,
      usage: usage ?? undefined,
      timestamp: new Date().toISOString(),
    });
    this.save();
  }

  getMessages(sessionId: string, opts?: { limit?: number }): { messages: BridgeMessage[] } {
    const msgs = this.data.messages[sessionId] ?? [];
    const messages = msgs.map(m => ({ role: m.role, content: m.content }));
    if (opts?.limit) {
      return { messages: messages.slice(-opts.limit) };
    }
    return { messages };
  }

  // ── Session Locking ─────────────────────────────────────────

  acquireSessionLock(sessionId: string, lockId: string, owner: string, ttlSecs: number): boolean {
    const existing = this.data.locks[sessionId];
    const now = Date.now();

    if (existing && existing.expiresAt > now) {
      return false; // Lock is held by another process
    }

    this.data.locks[sessionId] = {
      lockId,
      owner,
      expiresAt: now + ttlSecs * 1000,
    };
    this.save();
    return true;
  }

  renewSessionLock(sessionId: string, lockId: string, ttlSecs: number): void {
    const lock = this.data.locks[sessionId];
    if (lock?.lockId === lockId) {
      lock.expiresAt = Date.now() + ttlSecs * 1000;
      this.save();
    }
  }

  releaseSessionLock(sessionId: string, lockId: string): void {
    const lock = this.data.locks[sessionId];
    if (lock?.lockId === lockId) {
      delete this.data.locks[sessionId];
      this.save();
    }
  }

  setSessionRuntimeStatus(sessionId: string, status: string): void {
    this.data.sessionStatus[sessionId] = status;
    this.save();
  }

  // ── SDK Session ────────────────────────────────────────────

  updateSdkSessionId(sessionId: string, sdkSessionId: string): void {
    this.data.sdkSessions[sessionId] = sdkSessionId;
    this.save();
  }

  updateSessionModel(sessionId: string, model: string): void {
    this.data.sessionModels[sessionId] = model;
    this.save();
  }

  syncSdkTasks(sessionId: string, todos: unknown): void {
    this.data.sessionTodos[sessionId] = todos;
    this.save();
  }

  // ── Provider ───────────────────────────────────────────────

  getProvider(_id: string): BridgeApiProvider | undefined {
    return undefined; // Single provider mode
  }

  getDefaultProviderId(): string | null {
    return null;
  }

  // ── Audit & Dedup ──────────────────────────────────────────

  insertAuditLog(entry: AuditLogInput): void {
    this.data.auditLog.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    // Keep only last 1000 entries
    if (this.data.auditLog.length > 1000) {
      this.data.auditLog = this.data.auditLog.slice(-1000);
    }
    this.save();
  }

  checkDedup(key: string): boolean {
    return key in this.data.dedup;
  }

  insertDedup(key: string): void {
    this.data.dedup[key] = Date.now();
    this.save();
  }

  cleanupExpiredDedup(): void {
    const expiry = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    for (const key of Object.keys(this.data.dedup)) {
      if (this.data.dedup[key] < expiry) {
        delete this.data.dedup[key];
      }
    }
    this.save();
  }

  insertOutboundRef(ref: OutboundRefInput): void {
    this.data.outboundRefs.push({
      ...ref,
      timestamp: new Date().toISOString(),
    });
    this.save();
  }

  // ── Permission Links ───────────────────────────────────────

  insertPermissionLink(link: PermissionLinkInput): void {
    this.data.permissionLinks[link.permissionRequestId] = {
      permissionRequestId: link.permissionRequestId,
      chatId: link.chatId,
      messageId: link.messageId,
      resolved: false,
      toolName: link.toolName,
      suggestions: link.suggestions,
    };
    this.save();
  }

  getPermissionLink(permissionRequestId: string): PermissionLinkRecord | null {
    const link = this.data.permissionLinks[permissionRequestId];
    if (!link) return null;
    return {
      permissionRequestId: link.permissionRequestId,
      chatId: link.chatId,
      messageId: link.messageId,
      resolved: link.resolved,
      suggestions: link.suggestions,
    };
  }

  markPermissionLinkResolved(permissionRequestId: string): boolean {
    const link = this.data.permissionLinks[permissionRequestId];
    if (!link || link.resolved) {
      return false;
    }
    link.resolved = true;
    this.save();
    return true;
  }

  listPendingPermissionLinksByChat(chatId: string): PermissionLinkRecord[] {
    return Object.values(this.data.permissionLinks)
      .filter(l => l.chatId === chatId && !l.resolved)
      .map(l => ({
        permissionRequestId: l.permissionRequestId,
        chatId: l.chatId,
        messageId: l.messageId,
        resolved: l.resolved,
        suggestions: l.suggestions,
      }));
  }

  // ── Channel Offsets ────────────────────────────────────────

  getChannelOffset(key: string): string {
    return this.data.offsets[key] ?? '';
  }

  setChannelOffset(key: string, offset: string): void {
    this.data.offsets[key] = offset;
    this.save();
  }
}

export default JsonFileStore;
