import { getZaloApi, resetZaloApi } from './zalo/client.js';
import { CloseReason, ThreadType } from 'zca-js';
import { setupZaloHandler } from './zalo/handler.js';
import { tgBot, syncTelegramCommands } from './telegram/bot.js';
import { setupTelegramHandler } from './telegram/handler.js';
import { config } from './config.js';
import { startUpdateChecker } from './updater.js';
import { store } from './store.js';

// ── Global safety net — prevent unhandled rejections from crashing ────────────
process.on('unhandledRejection', (reason) => {
  console.error('[Boot] Unhandled rejection (ignored):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Boot] Uncaught exception (ignored):', err);
});

// ── Module-level refs ─────────────────────────────────────────────────────────
let _setZaloApi: ((api: Awaited<ReturnType<typeof getZaloApi>>) => void) | null = null;
let _reconnectInProgress = false;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _needsReconnect = false;
let _currentListener: Awaited<ReturnType<typeof getZaloApi>>['listener'] | null = null;
let _healthcheckTimer: ReturnType<typeof setInterval> | null = null;

// ── Reconnect scheduler (module-level so healthcheck can use it) ──────────────

async function doReconnect(): Promise<void> {
  if (_reconnectInProgress) {
    _needsReconnect = true;
    return;
  }
  _reconnectInProgress = true;
  _needsReconnect = false;
  try {
    resetZaloApi();
    const newApi = await getZaloApi();
    _setZaloApi?.(newApi);
    await startZalo(newApi, true);
    tgBot.telegram.sendMessage(
      config.telegram.groupId,
      '✅ Zalo đã kết nối lại và đang đồng bộ lại tin gần đây.',
    ).catch(() => undefined);
    console.log('[Boot] Zalo reconnected ✓');
  } catch (err) {
    console.error('[Boot] Zalo reconnect failed:', err);
    tgBot.telegram.sendMessage(
      config.telegram.groupId,
      '⚠️ Kết nối lại Zalo thất bại. Hãy dùng <b>/login</b> để đăng nhập lại.',
      { parse_mode: 'HTML' },
    ).catch(() => undefined);
  } finally {
    _reconnectInProgress = false;
    // If another disconnect happened while we were reconnecting, retry
    if (_needsReconnect) {
      console.warn('[Boot] Reconnect requested while previous attempt was in progress, retrying in 5 s…');
      scheduleReconnect(5_000);
    }
  }
}

function scheduleReconnect(delayMs: number): void {
  if (_reconnectTimer) return;
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    void doReconnect();
  }, delayMs);
}

// ── Healthcheck watchdog ──────────────────────────────────────────────────────

function startHealthcheck(): void {
  if (_healthcheckTimer) return;
  _healthcheckTimer = setInterval(() => {
    if (_reconnectInProgress) return;
    const ws = _currentListener?.ws as { readyState: number } | null | undefined;
    // readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
    const isAlive = ws != null && ws.readyState === 1;
    if (!isAlive && !_reconnectTimer) {
      console.warn('[Healthcheck] Zalo listener WebSocket is not OPEN, scheduling reconnect…');
      _needsReconnect = true;
      scheduleReconnect(5_000);
    }
  }, 60_000);
  console.log('[Boot] Healthcheck watchdog started (60s interval) ✓');
}

function stopHealthcheck(): void {
  if (_healthcheckTimer) {
    clearInterval(_healthcheckTimer);
    _healthcheckTimer = null;
  }
}

// ── Boot Zalo (also used when /login swaps in a fresh API) ───────────────────

async function pruneLeftGroupTopics(api: Awaited<ReturnType<typeof getZaloApi>>): Promise<void> {
  try {
    const groups = await api.getAllGroups() as { gridVerMap?: Record<string, string> } | undefined;
    const activeGroupIds = new Set(Object.keys(groups?.gridVerMap ?? {}));
    const removed: string[] = [];
    for (const entry of store.all()) {
      if (entry.type === 1 && !activeGroupIds.has(entry.zaloId)) {
        store.remove(entry.topicId);
        removed.push(`${entry.name} (${entry.zaloId})`);
      }
    }
    if (removed.length > 0) {
      console.log(`[Boot] Pruned ${removed.length} stale group topic(s): ${removed.join(', ')}`);
    }
  } catch (err) {
    console.warn('[Boot] Could not prune stale group topics:', err);
  }
}

async function startZalo(
  api: Awaited<ReturnType<typeof getZaloApi>>,
  isReconnect = false,
): Promise<void> {
  if (!isReconnect) void pruneLeftGroupTopics(api);
  await setupZaloHandler(api);
  if (isReconnect) {
    api.listener.once('connected', () => {
      try {
        api.listener.requestOldMessages(ThreadType.User);
        api.listener.requestOldMessages(ThreadType.Group);
        api.listener.requestOldReactions(ThreadType.User);
        api.listener.requestOldReactions(ThreadType.Group);
        console.log('[Boot] Requested catch-up sync after reconnect');
      } catch (err) {
        console.warn('[Boot] Failed to request catch-up sync:', err);
      }
    });
  }
  api.listener.start();
  _currentListener = api.listener;
  console.log(`[Boot] Zalo listener ${isReconnect ? 're' : ''}started ✓`);

  // Auto-reconnect on disconnect. Using `once` is safe because each reconnect
  // creates a fresh listener with its own fresh `once` handler.
  api.listener.once('disconnected', (code: CloseReason, reason: string) => {
    if (code === CloseReason.ManualClosure) return;
    if (code === CloseReason.DuplicateConnection) {
      console.warn(`[Boot] Zalo disconnected: duplicate connection (code=${code}, reason=${reason})`);
      tgBot.telegram.sendMessage(
        config.telegram.groupId,
        '⚠️ Zalo bị ngắt do đăng nhập trùng phiên (duplicate connection). Đóng phiên Zalo Web/PC khác rồi dùng <b>/login</b> nếu cần.',
        { parse_mode: 'HTML' },
      ).catch(() => undefined);
      return;
    }
    if (code === CloseReason.KickConnection) {
      console.warn(`[Boot] Zalo disconnected: kicked connection (code=${code}, reason=${reason})`);
      tgBot.telegram.sendMessage(
        config.telegram.groupId,
        '⚠️ Zalo đã ngắt phiên bridge (kick connection). Vui lòng đăng nhập lại bằng <b>/login</b>.',
        { parse_mode: 'HTML' },
      ).catch(() => undefined);
      return;
    }
    console.warn(`[Boot] Zalo disconnected (code=${code}, reason=${reason}), reconnecting in 5 s…`);
    tgBot.telegram.sendMessage(
      config.telegram.groupId,
      '⚠️ Zalo bị ngắt kết nối, đang thử kết nối lại…',
    ).catch(() => undefined);
    _needsReconnect = true;
    scheduleReconnect(5_000);
  });
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   Zalo ↔ Telegram Bridge  v1.0.0    ║');
  console.log('╚══════════════════════════════════════╝');

  startUpdateChecker(tgBot);

  const setZaloApi = setupTelegramHandler(null, async (newApi) => {
    await startZalo(newApi, true);
  });
  _setZaloApi = setZaloApi;

  tgBot.launch({ allowedUpdates: ['message', 'callback_query', 'message_reaction', 'poll_answer', 'poll'] }, () => {
    console.log('[Boot] Telegram bot started ✓');

    syncTelegramCommands()
      .then(() => console.log('[Boot] Telegram command menu synced ✓'))
      .catch((err: unknown) => console.warn('[Boot] Failed to sync Telegram commands:', err));

    getZaloApi()
      .then(async (api) => {
        setZaloApi(api);
        await startZalo(api);
        startHealthcheck();
      })
      .catch((err: unknown) => {
        console.warn('[Boot] Zalo auto-login failed:', err);
        tgBot.telegram
          .sendMessage(
            config.telegram.groupId,
            '⚠️ Chưa đăng nhập Zalo. Gửi <b>/login</b> để đăng nhập.',
            { parse_mode: 'HTML' },
          )
          .catch(() => undefined);
        // Start healthcheck anyway so it can detect when login succeeds later
        startHealthcheck();
      });
  });

  console.log('[Boot] Bridge is running 🚀  (Ctrl+C to stop)');

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n[Boot] Received ${signal}, shutting down...`);
    stopHealthcheck();
    try { const api = await getZaloApi(); api.listener.stop(); } catch { /* ignore */ }
    await tgBot.stop(signal);
    await new Promise(r => setTimeout(r, 2500));
    process.exit(0);
  };

  process.once('SIGINT',  () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error('[Boot] Fatal error:', err);
  process.exit(1);
});
