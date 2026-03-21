/**
 * Telegram utility functions — shared between the notification bot
 * (telegram-bot.ts) and the bridge adapter (telegram-adapter.ts).
 *
 * Extracted from telegram-bot.ts to avoid duplication.
 */

import https from 'https';
import http from 'http';
import { setGlobalDispatcher, ProxyAgent } from 'undici';

const TELEGRAM_API = 'https://api.telegram.org';

export function setupGlobalProxy() {
  const proxyUrl = process.env.CTI_HTTPS_PROXY || process.env.CTI_HTTP_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    try {
      console.log(`[setupGlobalProxy] Setting global proxy: ${proxyUrl}`);
      const agent = new ProxyAgent(proxyUrl);
      setGlobalDispatcher(agent);
      console.log('[setupGlobalProxy] Global proxy configured successfully');
      return true;
    } catch (err) {
      console.error('[setupGlobalProxy] Failed to set global proxy:', err);
      return false;
    }
  }
  return false;
}

async function fetchWithCurl(urlString: string, data?: string, headers?: Record<string, string>): Promise<Response> {
  const proxyUrl = process.env.CTI_HTTPS_PROXY || process.env.CTI_HTTP_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const method = data ? 'POST' : 'GET';

  console.log(`[fetchWithCurl] Using curl for ${urlString}, proxy=${proxyUrl || 'none'}, method=${method}`);

  let curlCmd = 'curl -s -w "\\n%{http_code}" -o - --compressed';

  if (proxyUrl) {
    curlCmd += ` -x "${proxyUrl}"`;
  }

  if (data) {
    curlCmd += ` -X POST -H "Content-Type: application/json" -d '${data.replace(/'/g, "'\''")}'`;
  }

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      if (key !== 'Content-Type') {
        curlCmd += ` -H "${key}: ${value}"`;
      }
    }
  }

  curlCmd += ` "${urlString}"`;

  return new Promise((resolve, reject) => {
    import('child_process').then(({ exec }) => {
      exec(curlCmd, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      }, (error, stdout, stderr) => {
        if (error) {
          console.error('[fetchWithCurl] Error:', error.message);
          reject(error);
          return;
        }

        try {
          const lastNewline = stdout.lastIndexOf('\n');
          if (lastNewline === -1) {
            throw new Error('Invalid curl response format');
          }

          const body = stdout.slice(0, lastNewline);
          const statusCodeStr = stdout.slice(lastNewline + 1).trim();
          const status = parseInt(statusCodeStr) || 200;

          resolve(new Response(body, {
            status,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
          }));
        } catch (parseErr) {
          console.error('[fetchWithCurl] Parse error:', parseErr);
          reject(parseErr);
        }
      });
    });
  });
}

async function fetchWithProxy(urlString: string, init: RequestInit = {}): Promise<Response> {
  const proxyUrl = process.env.CTI_HTTPS_PROXY || process.env.CTI_HTTP_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

  if (!proxyUrl) {
    return fetch(urlString, init);
  }

  const data = init.body?.toString();
  const headers = init.headers as Record<string, string>;
  return fetchWithCurl(urlString, data, headers);
}

export interface TelegramSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  httpStatus?: number;
  retryAfter?: number;
}

export interface TelegramApiResponse {
  ok: boolean;
  result?: {
    message_id?: number;
    [key: string]: unknown;
  };
  description?: string;
  parameters?: {
    retry_after?: number;
    [key: string]: unknown;
  };
}

export async function callTelegramApi(
  botToken: string,
  method: string,
  params: Record<string, unknown>,
): Promise<TelegramSendResult> {
  try {
    const url = `${TELEGRAM_API}/bot${botToken}/${method}`;
    const res = await fetchWithProxy(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const httpStatus = res.status;
    const data = await res.json() as TelegramApiResponse;
    if (!data.ok) {
      return {
        ok: false,
        error: data.description || 'Unknown Telegram API error',
        httpStatus,
        retryAfter: data.parameters?.retry_after,
      };
    }
    return {
      ok: true,
      messageId: data.result?.message_id != null ? String(data.result.message_id) : undefined,
      httpStatus,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function sendMessageDraft(
  botToken: string,
  chatId: string,
  text: string,
  draftId: number,
): Promise<TelegramSendResult> {
  const truncated = text.length > 4096 ? text.slice(0, 4096) : text;
  return callTelegramApi(botToken, 'sendMessageDraft', {
    chat_id: chatId,
    text: truncated,
    draft_id: draftId,
  });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIdx = remaining.lastIndexOf('\n', maxLength);
    if (splitIdx <= 0 || splitIdx < maxLength * 0.5) {
      splitIdx = maxLength;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).replace(/^\n/, '');
  }

  return chunks;
}

export function formatSessionHeader(opts?: {
  sessionId?: string;
  sessionTitle?: string;
  workingDirectory?: string;
}): string {
  const parts: string[] = [];
  if (opts?.sessionTitle) {
    parts.push(`<b>${escapeHtml(opts.sessionTitle)}</b>`);
  }
  if (opts?.workingDirectory) {
    parts.push(`<code>${escapeHtml(opts.workingDirectory)}</code>`);
  }
  return parts.join('\n');
}

export { fetchWithProxy };
