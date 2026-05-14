import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { config } from './config.js';

export interface UnreadStateEntry {
  zaloId: string;
  type: 0 | 1;
  count: number;
  updatedAt: number;
  lastMsgIds?: string[];
}

interface UnreadStateFile {
  version: number;
  entries: Record<string, UnreadStateEntry>;
}

interface RememberUnreadOptions {
  lastMsgIds?: string[];
}

const filePath = path.resolve(config.dataDir, 'unread-state.json');
const UNREAD_STATE_VERSION = 2;
const PROCESS_BOOT_TS = Date.now();
const USER_PERSIST_SURVIVAL_GRACE_MS = 2 * 60 * 1000;
const GROUP_PERSIST_SURVIVAL_GRACE_MS = 12 * 60 * 60 * 1000;

function getCarryoverGraceMs(type: 0 | 1): number {
  return type === 1 ? GROUP_PERSIST_SURVIVAL_GRACE_MS : USER_PERSIST_SURVIVAL_GRACE_MS;
}

function makeKey(zaloId: string, type: 0 | 1): string {
  return `${type}:${zaloId}`;
}

function normalizeMsgIds(ids?: string[]): string[] {
  const unique = new Set<string>();
  for (const value of ids ?? []) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (!normalized || normalized === '0') continue;
    unique.add(normalized);
  }
  return [...unique];
}

function persistNow(data: UnreadStateFile): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function emptyState(): UnreadStateFile {
  return { version: UNREAD_STATE_VERSION, entries: {} };
}

function load(): UnreadStateFile {
  if (!existsSync(filePath)) return emptyState();
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<UnreadStateFile> & { entries?: Record<string, Partial<UnreadStateEntry>> };
    const entries: Record<string, UnreadStateEntry> = {};
    let droppedLegacy = 0;
    let droppedInvalid = 0;
    let droppedCarryover = 0;

    for (const value of Object.values(raw.entries ?? {})) {
      const zaloId = typeof value?.zaloId === 'string' ? value.zaloId : undefined;
      const type = value?.type === 0 || value?.type === 1 ? value.type : undefined;
      const count = typeof value?.count === 'number' && Number.isFinite(value.count) ? Math.max(1, Math.floor(value.count)) : undefined;
      const updatedAt = typeof value?.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : undefined;
      if (!zaloId || type === undefined || count === undefined || updatedAt === undefined) {
        droppedInvalid += 1;
        continue;
      }

      const lastMsgIds = normalizeMsgIds(value.lastMsgIds);
      if ((raw.version ?? 0) < UNREAD_STATE_VERSION && lastMsgIds.length === 0) {
        droppedLegacy += 1;
        continue;
      }

      // The bridge only observes unread edges when messages arrive. After a
      // restart/offline window we cannot reliably reconcile whether old entries
      // were already read on Zalo. Keep DMs on a short leash, but allow groups
      // (where self seen_events are reliable) to survive much longer.
      if (updatedAt < PROCESS_BOOT_TS - getCarryoverGraceMs(type)) {
        droppedCarryover += 1;
        continue;
      }

      entries[makeKey(zaloId, type)] = {
        zaloId,
        type,
        count,
        updatedAt,
        ...(lastMsgIds.length > 0 ? { lastMsgIds } : {}),
      };
    }

    const next = {
      version: UNREAD_STATE_VERSION,
      entries,
    } satisfies UnreadStateFile;

    if ((raw.version ?? 0) !== UNREAD_STATE_VERSION || droppedLegacy > 0 || droppedInvalid > 0 || droppedCarryover > 0) {
      try {
        persistNow(next);
      } catch (err) {
        console.error('[UnreadState] Failed to persist migrated unread-state.json:', err);
      }
      if (droppedLegacy > 0 || droppedInvalid > 0 || droppedCarryover > 0) {
        console.log(`[UnreadState] Migrated unread-state.json dropped legacy=${droppedLegacy} invalid=${droppedInvalid} carryover=${droppedCarryover}`);
      }
    }

    return next;
  } catch {
    return emptyState();
  }
}

let _data: UnreadStateFile = load();
let _persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(): void {
  if (_persistTimer) return;
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    try {
      persistNow(_data);
    } catch (err) {
      console.error('[UnreadState] Failed to persist unread-state.json:', err);
    }
  }, 300);
  _persistTimer.unref?.();
}

export const unreadState = {
  remember(zaloId: string, type: 0 | 1, count: number, options?: RememberUnreadOptions): void {
    const key = makeKey(zaloId, type);
    const previous = _data.entries[key];
    const normalized = Math.max(1, Math.floor(count));
    const lastMsgIds = normalizeMsgIds(options?.lastMsgIds);
    const next: UnreadStateEntry = {
      zaloId,
      type,
      count: normalized,
      updatedAt: Date.now(),
    };

    if (lastMsgIds.length > 0) {
      next.lastMsgIds = lastMsgIds;
    } else if (previous?.lastMsgIds?.length) {
      next.lastMsgIds = previous.lastMsgIds;
    }

    _data.entries[key] = next;
    schedulePersist();
  },

  get(zaloId: string, type: 0 | 1): UnreadStateEntry | undefined {
    return _data.entries[makeKey(zaloId, type)];
  },

  all(): UnreadStateEntry[] {
    return Object.values(_data.entries);
  },

  matchesMessageIds(zaloId: string, type: 0 | 1, messageIds: string[]): boolean {
    const entry = _data.entries[makeKey(zaloId, type)];
    if (!entry?.lastMsgIds?.length) return false;
    const expected = new Set(entry.lastMsgIds);
    return normalizeMsgIds(messageIds).some((id) => expected.has(id));
  },

  clear(zaloId: string, type: 0 | 1): void {
    const key = makeKey(zaloId, type);
    if (!_data.entries[key]) return;
    delete _data.entries[key];
    schedulePersist();
  },

  reload(): void {
    _data = load();
  },
};
