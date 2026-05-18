import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Telegraf } from 'telegraf';

import { config } from './config.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let _notifiedCommit: string | null = null;
let _isUpdating = false;

function gitExec(cmd: string): string {
  return execSync(cmd, { cwd: PROJECT_ROOT, stdio: 'pipe' }).toString().trim();
}

function getNewCommit(): string | null {
  try {
    gitExec('git fetch origin main --quiet');
    const behind = gitExec('git log HEAD..origin/main --oneline');
    if (!behind) return null;
    return gitExec('git rev-parse --short origin/main');
  } catch {
    return null;
  }
}

function getChangelog(): string {
  try {
    return gitExec('git log HEAD..origin/main --oneline --no-merges');
  } catch {
    return '';
  }
}

export function startUpdateChecker(bot: Telegraf): void {

  // ── Inline button handlers (must be registered before catch-all callback_query) ─
  bot.action('upd:skip', async (ctx) => {
    await ctx.answerCbQuery('⏰ Đã huỷ').catch(() => undefined);
    await ctx.deleteMessage().catch(() => undefined);
  });

  bot.action('upd:confirm', async (ctx) => {
    if (_isUpdating) {
      await ctx.answerCbQuery('⏳ Đang cập nhật...').catch(() => undefined);
      return;
    }
    _isUpdating = true;

    try {
      await ctx.answerCbQuery('⏳ Đang cập nhật...').catch(() => undefined);

      await ctx.editMessageText(
        '⏳ <b>Đang cập nhật...</b>\n\ngit pull origin main...',
        { parse_mode: 'HTML' },
      ).catch(() => undefined);

      // 1. git pull
      execSync('git pull origin main', { cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 120_000 });

      await ctx.editMessageText(
        '⏳ <b>Đang cập nhật...</b>\n\n✅ git pull\nnpm install...',
        { parse_mode: 'HTML' },
      ).catch(() => undefined);

      // 2. npm install
      execSync('npm install', { cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 180_000 });

      await ctx.editMessageText(
        '⏳ <b>Đang cập nhật...</b>\n\n✅ git pull\n✅ npm install\nnpm run build...',
        { parse_mode: 'HTML' },
      ).catch(() => undefined);

      // 3. build
      execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 120_000 });

      await ctx.editMessageText(
        '✅ <b>Cập nhật thành công!</b>\nĐang khởi động lại...',
        { parse_mode: 'HTML' },
      ).catch(() => undefined);

      console.log('[Updater] Update complete — restarting via exit code 42');
      setTimeout(() => process.exit(42), 500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Updater] Update failed:', msg);
      await ctx.editMessageText(
        `❌ <b>Cập nhật thất bại</b>\n<code>${msg}</code>`,
        { parse_mode: 'HTML' },
      ).catch(() => undefined);
      _isUpdating = false;
    }
  });

  // ── Periodic check ──────────────────────────────────────────────────────
  const check = async () => {
    const commit = getNewCommit();
    if (!commit) return;
    if (_notifiedCommit === commit) return;

    _notifiedCommit = commit;
    const changelog = getChangelog();

    try {
      await bot.telegram.sendMessage(
        config.telegram.groupId,
        `🔔 <b>Có bản cập nhật mới!</b> (<code>${commit}</code>)\n\n${
          changelog
            ? changelog.split('\n').slice(0, 10).map(l => `• ${l}`).join('\n')
            : ''
        }`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔄 Cập nhật ngay', callback_data: 'upd:confirm' },
                { text: '⏰ Để sau',         callback_data: 'upd:skip' },
              ],
            ],
          },
        },
      );
    } catch (err) {
      console.error('[Updater] Failed to send notification:', err);
      _notifiedCommit = null;
    }
  };

  setTimeout(check, 60_000);
  setInterval(check, 10 * 60_000);
}
