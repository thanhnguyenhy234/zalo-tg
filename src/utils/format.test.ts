import assert from 'node:assert/strict';
import {
  senderEmoji,
  SENDER_EMOJI_PALETTE,
  groupCaption,
  formatGroupMsg,
  formatGroupMsgHtml,
} from './format.js';

// 1. Cùng uid → cùng emoji (gọi 2 lần)
const emoji1 = senderEmoji('user_123');
const emoji2 = senderEmoji('user_123');
assert.equal(emoji1, emoji2, 'Same UID must produce identical emoji');

// 2. Hai uid khác nhau cho ra 2 emoji khác
const emojiA = senderEmoji('uid_alpha');
const emojiB = senderEmoji('uid_beta');
assert.notEqual(emojiA, emojiB, 'Different UIDs should produce different emojis for selected pair');

// 3. senderEmoji luôn trả về member của palette
for (const testUid of ['123', '456', 'user_abc', '999999999', 'test_uid_xyz']) {
  const e = senderEmoji(testUid);
  assert.ok(SENDER_EMOJI_PALETTE.includes(e), `Emoji ${e} for UID ${testUid} must be in palette`);
}

// 4. groupCaption('An') === '<b>An</b>' (không uid = format cũ)
assert.equal(groupCaption('An'), '<b>An</b>', 'Without UID should produce original format');

// 5. groupCaption('An', '123') match /^.* <b>An<\/b>$/ và bắt đầu bằng emoji của uid 123
const expectedEmoji123 = senderEmoji('123');
assert.equal(groupCaption('An', '123'), `${expectedEmoji123} <b>An</b>`);
assert.match(groupCaption('An', '123'), /^.* <b>An<\/b>$/);
assert.ok(groupCaption('An', '123').startsWith(expectedEmoji123));

// 6. formatGroupMsgHtml('An', 'hi', '123') có prefix emoji + <b>An:</b>\nhi
assert.equal(formatGroupMsgHtml('An', 'hi', '123'), `${expectedEmoji123} <b>An:</b>\nhi`);
assert.equal(formatGroupMsg('An', 'hi', '123'), `${expectedEmoji123} <b>An:</b>\nhi`);

// 7. Tên có < vẫn escape: groupCaption('A<B') chứa &lt;
assert.equal(groupCaption('A<B'), '<b>A&lt;B</b>');
assert.equal(groupCaption('A<B', '123'), `${expectedEmoji123} <b>A&lt;B</b>`);
assert.ok(groupCaption('A<B').includes('&lt;'));
assert.ok(groupCaption('A<B', '123').includes('&lt;'));

// 8. Empty uid không prefix emoji: groupCaption('An', '') === '<b>An</b>'
assert.equal(groupCaption('An', ''), '<b>An</b>');
assert.equal(formatGroupMsg('An', 'hi', ''), '<b>An:</b>\nhi');
assert.equal(formatGroupMsgHtml('An', 'hi', ''), '<b>An:</b>\nhi');

// Fallback empty UID in senderEmoji directly
assert.equal(senderEmoji(''), '⚪');

console.log('All format tests passed successfully!');
