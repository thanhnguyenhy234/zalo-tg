import assert from "node:assert/strict";
import {
	formatGroupMsg,
	formatGroupMsgHtml,
	groupCaption,
	SENDER_EMOJI_PALETTE,
	senderEmoji,
	setSenderIconResolver,
} from "./format.js";

// 1. Cùng uid → cùng emoji (gọi 2 lần)
const emoji1 = senderEmoji("user_123");
const emoji2 = senderEmoji("user_123");
assert.equal(emoji1, emoji2, "Same UID must produce identical emoji");

// 2. Hai uid khác nhau cho ra 2 emoji khác
const emojiA = senderEmoji("uid_alpha");
const emojiB = senderEmoji("uid_beta");
assert.notEqual(
	emojiA,
	emojiB,
	"Different UIDs should produce different emojis for selected pair",
);

// 3. senderEmoji luôn trả về member của palette
for (const testUid of [
	"123",
	"456",
	"user_abc",
	"999999999",
	"test_uid_xyz",
	"uid_dm",
]) {
	const e = senderEmoji(testUid);
	assert.ok(
		SENDER_EMOJI_PALETTE.includes(e),
		`Emoji ${e} for UID ${testUid} must be in palette`,
	);
}

// 4. groupCaption('An') === '<b>An</b>' (không uid = format cũ / regression)
assert.equal(
	groupCaption("An"),
	"<b>An</b>",
	"Without UID should produce original format",
);

// 5. groupCaption('An', '123') match /^.* <b>An<\/b>$/ và bắt đầu bằng emoji của uid 123
const expectedEmoji123 = senderEmoji("123");
assert.equal(groupCaption("An", "123"), `${expectedEmoji123} <b>An</b>`);
assert.match(groupCaption("An", "123"), /^.* <b>An<\/b>$/);
assert.ok(groupCaption("An", "123").startsWith(expectedEmoji123));

// 6. formatGroupMsgHtml('An', 'hi', '123') có prefix emoji + <b>An:</b>\nhi
assert.equal(
	formatGroupMsgHtml("An", "hi", "123"),
	`${expectedEmoji123} <b>An:</b>\nhi`,
);
assert.equal(
	formatGroupMsg("An", "hi", "123"),
	`${expectedEmoji123} <b>An:</b>\nhi`,
);

// 7. DM UID contract: formatGroupMsgHtml('An', 'hi', 'uid_dm') có prefix senderEmoji('uid_dm')
const expectedEmojiDm = senderEmoji("uid_dm");
assert.equal(
	formatGroupMsgHtml("An", "hi", "uid_dm"),
	`${expectedEmojiDm} <b>An:</b>\nhi`,
);
assert.equal(groupCaption("An", "uid_dm"), `${expectedEmojiDm} <b>An</b>`);

// 8. Tên có < vẫn escape: groupCaption('A<B') chứa &lt;
assert.equal(groupCaption("A<B"), "<b>A&lt;B</b>");
assert.equal(groupCaption("A<B", "123"), `${expectedEmoji123} <b>A&lt;B</b>`);
assert.ok(groupCaption("A<B").includes("&lt;"));
assert.ok(groupCaption("A<B", "123").includes("&lt;"));

// 9. Empty uid / undefined không prefix emoji (regression guard)
assert.equal(groupCaption("An", ""), "<b>An</b>");
assert.equal(groupCaption("An", undefined), "<b>An</b>");
assert.equal(formatGroupMsg("An", "hi", ""), "<b>An:</b>\nhi");
assert.equal(formatGroupMsg("An", "hi", undefined), "<b>An:</b>\nhi");
assert.equal(formatGroupMsgHtml("An", "hi", ""), "<b>An:</b>\nhi");
assert.equal(formatGroupMsgHtml("An", "hi", undefined), "<b>An:</b>\nhi");

// Fallback empty UID in senderEmoji directly
assert.equal(senderEmoji(""), "⚪");

// 10. Custom Icon Resolver Tests
const customMap: Record<string, string> = {
	user_custom_1: "👑",
	user_custom_2: "  🌸  ",
	user_empty: "   ",
};

setSenderIconResolver((uid) => customMap[uid]);

// 10a. Custom icon resolved accurately
assert.equal(senderEmoji("user_custom_1"), "👑", "Must return custom icon 👑");
assert.equal(
	senderEmoji("user_custom_2"),
	"🌸",
	"Must return trimmed custom icon 🌸",
);

// 10b. Messages formatted with custom icon
assert.equal(
	formatGroupMsg("Boss", "Hello", "user_custom_1"),
	"👑 <b>Boss:</b>\nHello",
);
assert.equal(
	formatGroupMsgHtml("Boss", "Hello", "user_custom_1"),
	"👑 <b>Boss:</b>\nHello",
);
assert.equal(groupCaption("Boss", "user_custom_1"), "👑 <b>Boss</b>");

// 10c. Fallback to hash palette when resolver returns undefined or whitespace
assert.ok(
	SENDER_EMOJI_PALETTE.includes(senderEmoji("user_no_custom")),
	"Must fallback to palette",
);
assert.ok(
	SENDER_EMOJI_PALETTE.includes(senderEmoji("user_empty")),
	"Must fallback to palette when custom icon is whitespace",
);

// 10d. Empty UID still returns ⚪ even with resolver active
assert.equal(senderEmoji(""), "⚪", "Empty UID must return ⚪");

// 10e. Reset resolver back to null
setSenderIconResolver(null);
assert.ok(
	SENDER_EMOJI_PALETTE.includes(senderEmoji("user_custom_1")),
	"After reset, must fallback to palette",
);
assert.notEqual(
	senderEmoji("user_custom_1"),
	"👑",
	"After reset, custom icon should not be used",
);

console.log("All format tests passed successfully!");
