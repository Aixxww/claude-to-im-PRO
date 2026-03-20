/**
 * Test script for enhanced Telegram features
 * 测试增强 Telegram 功能的脚本
 */

import { TelegramAdapter } from './dist/lib/bridge/adapters/telegram-adapter.js';
import { initBridgeContext } from './dist/lib/bridge/context.js';

// Mock store implementation
class MockStore {
  private data = new Map<string, string>();

  getSetting(key: string): string | undefined {
    return this.data.get('store:setting:' + key);
  }

  setSetting(key: string, value: string): void {
    this.data.set('store:setting:' + key, value);
  }

  getChannelOffset(key: string): string {
    return this.data.get('store:offset:' + key) || '0';
  }

  setChannelOffset(key: string, value: string): void {
    this.data.set('store:offset:' + key, value);
  }
}

async function testEnhancements() {
  try {
    // Initialize context
    initBridgeContext({
      store: new MockStore(),
      llm: {} as any,
      permissions: { resolvePendingPermission: async () => {} },
    });

    // Configure bot
    const store = initBridgeContext().store;
    store.setSetting('telegram_bot_token', process.env.CTI_TG_BOT_TOKEN || 'YOUR_BOT_TOKEN');
    store.setSetting('bridge_telegram_enabled', 'true');
    store.setSetting('telegram_bridge_allowed_users', '5210777244');

    // Create adapter
    const adapter = new TelegramAdapter();

    console.log('✅ TelegramAdapter created successfully');
    console.log('📝 Available methods:');
    console.log('  - editMessage()');
    console.log('  - sendProgressUpdate()');
    console.log('  - addReaction()');
    console.log('');

    console.log('📚 Usage examples:');
    console.log('');
    console.log('// Message editing:');
    console.log('await adapter.editMessage(chatId, messageId, "Updated text", "HTML");');
    console.log('');
    console.log('// Progress update:');
    console.log('const result = await adapter.sendProgressUpdate(chatId, "Processing...");');
    console.log('await adapter.editMessage(chatId, result.messageId, "Done!");');
    console.log('');
    console.log('// Emoji reaction:');
    console.log('await adapter.addReaction(chatId, messageId, "👍");');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testEnhancements();
