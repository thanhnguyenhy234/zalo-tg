import { Telegraf } from 'telegraf';
import https from 'https';
import http from 'http';
import { config } from '../config.js';

// Force IPv4 to avoid ETIMEDOUT on systems where IPv6 is blocked/unreachable
const agent = new https.Agent({ family: 4 });
const localAgent = new http.Agent({ family: 4 });

const BOT_COMMANDS = [
  { command: 'login',          description: 'Đăng nhập Zalo bằng QR' },
  { command: 'search',         description: 'Tìm alias, tên, nhóm hoặc số điện thoại' },
  { command: 'group_info',     description: 'Xem thông tin & thành viên nhóm Zalo hiện tại' },
  { command: 'group_infoall',  description: 'Xem toàn bộ thành viên nhóm Zalo hiện tại' },
  { command: 'unread',         description: 'List topic unread theo trạng thái thông báo Zalo' },
  { command: 'message_search', description: 'Tìm nội dung trong tin đã sync gần đây' },
  { command: 'recall',         description: 'Thu hồi tin nhắn đã gửi sang Zalo' },
  { command: 'topic',          description: 'Quản lý topic: list | info | delete' },
  { command: 'set_topic_name', description: 'Đổi tên topic DM hiện tại ngay lập tức' },
  { command: 'set_user_icon',  description: 'Đặt icon/emoji thủ công cho user Zalo' },
  { command: 'add_kp',         description: 'Thêm topic hiện tại vào danh sách khắc phục' },
  { command: 'list_kp',        description: 'Liệt kê toàn bộ topic khắc phục đã lưu' },
  { command: 'clear_kp',       description: 'Xoá topic hiện tại khỏi danh sách khắc phục' },
  { command: 'clear_all_kp',   description: 'Xoá toàn bộ danh sách topic khắc phục' },
  { command: 'set_topic_icon_emoji', description: 'Đổi icon topic bằng custom emoji' },
  { command: 'admin',          description: 'Admin panel: trạng thái, cache, tra mapping' },
  { command: 'addgroup',       description: 'Tạo nhóm Zalo mới từ topic hiện tại' },
  { command: 'addfriend',      description: 'Gửi lời mời kết bạn Zalo' },
  { command: 'friendrequests', description: 'Xem & duyệt lời mời kết bạn đang chờ' },
  { command: 'joingroup',      description: 'Tham gia nhóm Zalo qua link mời' },
  { command: 'leavegroup',     description: 'Rời nhóm Zalo của topic hiện tại' },
  { command: 'status',         description: 'Xem trạng thái kết nối & thống kê bridge' },
];

/** Singleton Telegraf bot instance shared across the app. */
// QR /login can run for several minutes (QR refresh + phone confirm).
// Default Telegraf handlerTimeout is 90s and aborts the handler mid-login.
export const tgBot = new Telegraf(config.telegram.token, {
  handlerTimeout: 15 * 60 * 1000,
  telegram: config.telegram.localServer
    ? { apiRoot: config.telegram.localServer, agent: localAgent }
    : { agent },
});

tgBot.catch((err, ctx) => {
  const updateId = ctx?.update?.update_id;
  console.error(`[Telegram] Handler error (update ${updateId ?? '?'}):`, err);
});

export async function syncTelegramCommands(): Promise<void> {
  await tgBot.telegram.setMyCommands(BOT_COMMANDS);
  await tgBot.telegram.setMyCommands(BOT_COMMANDS, {
    scope: {
      type: 'chat',
      chat_id: config.telegram.groupId,
    },
  });
}
