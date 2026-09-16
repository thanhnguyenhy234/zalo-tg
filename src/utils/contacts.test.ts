import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

// Setup mock env vars before importing anything that touches config
process.env.TG_TOKEN = process.env.TG_TOKEN || "mock_token";
process.env.TG_GROUP_ID = process.env.TG_GROUP_ID || "-100123456";

const {
	parseContactsToml,
	findContact,
	loadContacts,
	getContactsFilePath,
	parseContactInput,
	generateContactKey,
	saveOrUpdateContact,
	formatContactTomlSection,
	stripVietnamese,
} = await import("./contacts.js");

console.log("--- Testing contacts.ts ---");

// 0. Test stripVietnamese
assert.equal(stripVietnamese("C Kiều Anh Syt"), "c kieu anh syt");
assert.equal(stripVietnamese("Đỗ Đăng Đức"), "do dang duc");
assert.equal(stripVietnamese("Huỳnh Gia Bửu"), "huynh gia buu");
assert.equal(stripVietnamese("NGUYỄN VĂN HÙNG"), "nguyen van hung");
console.log("✅ Passed: stripVietnamese helper");

// 1. Test parse TOML kiểu [key] có và không có uid, phone, email, note
const tomlTableSyntax = `
# Danh bạ Zalo cá nhân
[buu]
name = "Huỳnh Gia Bửu"
phone = "0901234567"
email = "buub1309120@gmail.com"
note = "Quản trị viên"

[sep_hung]
name = 'Nguyễn Văn Hùng'
phone = "0988123456" # số viettel
home = "hungnv@phutho.gov.vn"
note = "Giám đốc Sở"

[anh_tuan]
name = "Nguyễn Anh Tuấn"
uid = "987654321"
phone = "0988776655"
mail = "tuan@example.com"
`;

const parsedTable = parseContactsToml(tomlTableSyntax);
assert.equal(
	parsedTable.length,
	3,
	"Should parse 3 contacts from [key] table syntax",
);
assert.deepEqual(parsedTable[0], {
	key: "buu",
	name: "Huỳnh Gia Bửu",
	phone: "0901234567",
	email: "buub1309120@gmail.com",
	note: "Quản trị viên",
});
assert.deepEqual(parsedTable[1], {
	key: "sep_hung",
	name: "Nguyễn Văn Hùng",
	phone: "0988123456",
	email: "hungnv@phutho.gov.vn",
	note: "Giám đốc Sở",
});
assert.deepEqual(parsedTable[2], {
	key: "anh_tuan",
	name: "Nguyễn Anh Tuấn",
	uid: "987654321",
	phone: "0988776655",
	email: "tuan@example.com",
});
console.log("✅ Passed: parseContactsToml with [key] table syntax and emails");

// 2. Test parse TOML kiểu [[contacts]]
const tomlArraySyntax = `
[[contacts]]
key = "lan_kd"
name = "Chị Lan Kinh Doanh"
phone = "0911223344"
email = "lan@kd.com"
note = "Phòng KD"

[[contacts]]
name = "Bác Sĩ Nam"
phone = "0977889900"
# Không có key và uid -> key fallback name

[[contacts]]
name = "Đối tác VIP"
uid = "55667788"
`;

const parsedArray = parseContactsToml(tomlArraySyntax);
assert.equal(
	parsedArray.length,
	3,
	"Should parse 3 contacts from [[contacts]] array syntax",
);
assert.equal(parsedArray[0].key, "lan_kd");
assert.equal(parsedArray[0].name, "Chị Lan Kinh Doanh");
assert.equal(parsedArray[0].phone, "0911223344");
assert.equal(parsedArray[0].email, "lan@kd.com");
assert.equal(parsedArray[0].note, "Phòng KD");
assert.equal(parsedArray[0].uid, undefined);

assert.equal(parsedArray[1].name, "Bác Sĩ Nam");
assert.equal(parsedArray[1].phone, "0977889900");
assert.equal(parsedArray[1].key, "Bác Sĩ Nam");
assert.equal(parsedArray[1].uid, undefined);

assert.equal(parsedArray[2].name, "Đối tác VIP");
assert.equal(parsedArray[2].uid, "55667788");
console.log("✅ Passed: parseContactsToml with [[contacts]] array syntax");

// 3. Test findContact với danh sách mẫu
const testContacts = [
	{
		key: "buu",
		name: "Huỳnh Gia Bửu",
		phone: "0901234567",
		email: "buub1309120@gmail.com",
		note: "Admin",
	},
	{
		key: "sep_hung",
		name: "Nguyễn Văn Hùng",
		phone: "0988-123-456",
		email: "hungnv@phutho.gov.vn",
		note: "Giám đốc Sở",
	},
	{
		key: "anh_tuan",
		name: "Nguyễn Anh Tuấn",
		uid: "987654321",
		phone: "0988-776-655",
	},
	{
		key: "lan_kd",
		name: "Chị Lan Kinh Doanh",
		phone: "0911223344",
	},
	{
		key: "c_kieu_anh_syt",
		name: "C Kiều Anh Syt",
		phone: "098 669 62 86",
		email: "nguyenkieuanhvp85@gmail.com",
		note: "Phó Chánh VP",
	},
];

// 3.1. Tìm theo exact key
assert.equal(findContact("buu", testContacts)?.name, "Huỳnh Gia Bửu");
assert.equal(findContact("SEP_HUNG", testContacts)?.name, "Nguyễn Văn Hùng");
assert.equal(
	findContact("c_kieu_anh_syt", testContacts)?.name,
	"C Kiều Anh Syt",
);

// 3.2. Tìm theo exact UID (khi có UID)
assert.equal(findContact("987654321", testContacts)?.key, "anh_tuan");

// 3.3. Tìm theo phone (exact & partial)
assert.equal(findContact("0901234567", testContacts)?.key, "buu");
assert.equal(findContact("0988123456", testContacts)?.key, "sep_hung");
assert.equal(findContact("988123", testContacts)?.key, "sep_hung");
assert.equal(findContact("0986696286", testContacts)?.key, "c_kieu_anh_syt");

// 3.4. Tìm theo email (exact & partial)
assert.equal(findContact("buub1309120@gmail.com", testContacts)?.key, "buu");
assert.equal(findContact("hungnv", testContacts)?.key, "sep_hung");
assert.equal(
	findContact("nguyenkieuanhvp85", testContacts)?.key,
	"c_kieu_anh_syt",
);

// 3.5. Tìm theo name (partial / exact) có dấu
assert.equal(findContact("Gia Bửu", testContacts)?.key, "buu");
assert.equal(findContact("Lan Kinh Doanh", testContacts)?.key, "lan_kd");
assert.equal(findContact("Văn Hùng", testContacts)?.key, "sep_hung");
assert.equal(findContact("anh tuấn", testContacts)?.key, "anh_tuan");
assert.equal(findContact("Kiều Anh", testContacts)?.key, "c_kieu_anh_syt");

// 3.6. Tìm kiếm KHÔNG DẤU tiếng Việt (unaccented Vietnamese search)
assert.equal(findContact("kieu anh", testContacts)?.key, "c_kieu_anh_syt");
assert.equal(findContact("kieu_anh", testContacts)?.key, "c_kieu_anh_syt");
assert.equal(findContact("kieu", testContacts)?.key, "c_kieu_anh_syt");
assert.equal(findContact("anh syt", testContacts)?.key, "c_kieu_anh_syt");
assert.equal(findContact("van hung", testContacts)?.key, "sep_hung");
assert.equal(findContact("gia buu", testContacts)?.key, "buu");
assert.equal(findContact("chi lan", testContacts)?.key, "lan_kd");
assert.equal(findContact("anh tuan", testContacts)?.key, "anh_tuan");

// 3.7. Dynamic UID (chuỗi số >= 5 chữ số không có trong danh bạ)
const dynamicContact = findContact("88889999123", testContacts);
assert.notEqual(dynamicContact, null);
assert.equal(dynamicContact?.uid, "88889999123");
assert.equal(dynamicContact?.name, "UID 88889999123");
assert.equal(dynamicContact?.key, "88889999123");

// 3.8. Query không tồn tại và không phải UID hợp lệ
assert.equal(findContact("khong_ton_tai_xyz", testContacts), null);
assert.equal(findContact("000", testContacts), null);

console.log(
	"✅ Passed: findContact (key, name, phone, email, uid, dynamic UID, unaccented Vietnamese)",
);

// 4. Test parseContactInput (vCard / copy danh thiếp và cú pháp nhanh)
console.log("--- Testing parseContactInput & generateContactKey ---");

// 4.1. vCard Name: / Mobile: / Home:
const vCard1 = `
Name:C Kiều Anh Syt
Mobile:098 669 62 86
Home:nguyenkieuanhvp85@gmail.com
`;
const p1 = parseContactInput(vCard1);
assert.equal(p1.name, "C Kiều Anh Syt");
assert.equal(p1.phone, "098 669 62 86");
assert.equal(p1.email, "nguyenkieuanhvp85@gmail.com");
assert.equal(p1.key, "c_kieu_anh_syt");

// 4.2. Tiếng Việt Tên: / SĐT: / Email: / Ghi chú: / Key:
const vCard2 = `
Tên: Nguyễn Văn Hùng
SĐT: 0988 123 456
Email: hungnv@phutho.gov.vn
Ghi chú: Giám đốc Sở
Key: sep_hung
`;
const p2 = parseContactInput(vCard2);
assert.equal(p2.name, "Nguyễn Văn Hùng");
assert.equal(p2.phone, "0988 123 456");
assert.equal(p2.email, "hungnv@phutho.gov.vn");
assert.equal(p2.note, "Giám đốc Sở");
assert.equal(p2.key, "sep_hung");

// 4.3. Cú pháp nhanh 1 dòng: [alias] <tên> <sđt> [email]
const single1 =
	"[kieu_anh] C Kiều Anh Syt 0986696286 nguyenkieuanhvp85@gmail.com";
const p3 = parseContactInput(single1);
assert.equal(p3.key, "kieu_anh");
assert.equal(p3.name, "C Kiều Anh Syt");
assert.equal(p3.phone, "0986696286");
assert.equal(p3.email, "nguyenkieuanhvp85@gmail.com");

// 4.4. Cú pháp nhanh 1 dòng tự động sinh key
const single2 = "Bác Sĩ Nam 0977889900";
const p4 = parseContactInput(single2);
assert.equal(p4.name, "Bác Sĩ Nam");
assert.equal(p4.phone, "0977889900");
assert.equal(p4.key, "bac_si_nam");

// 4.5. generateContactKey
assert.equal(generateContactKey("C Kiều Anh Syt"), "c_kieu_anh_syt");
assert.equal(generateContactKey("Đỗ Đăng Đức"), "do_dang_duc");
assert.equal(generateContactKey("  Admin @ VIP #123 "), "admin_vip_123");

console.log("✅ Passed: parseContactInput & generateContactKey");

// 5. Test saveOrUpdateContact
console.log("--- Testing saveOrUpdateContact ---");
const tmpFilePath = path.join(
	os.tmpdir(),
	`test_save_contacts_${Date.now()}.toml`,
);

try {
	// 5.1. Thêm liên hệ mới vào file chưa tồn tại
	const res1 = saveOrUpdateContact(
		{
			key: "c_kieu_anh_syt",
			name: "C Kiều Anh Syt",
			phone: "098 669 62 86",
			email: "nguyenkieuanhvp85@gmail.com",
		},
		tmpFilePath,
	);
	assert.equal(res1.isNew, true);
	assert.equal(res1.success, true);

	let contacts = loadContacts(tmpFilePath);
	assert.equal(contacts.length, 1);
	assert.equal(contacts[0].key, "c_kieu_anh_syt");
	assert.equal(contacts[0].name, "C Kiều Anh Syt");
	assert.equal(contacts[0].phone, "098 669 62 86");
	assert.equal(contacts[0].email, "nguyenkieuanhvp85@gmail.com");

	// 5.2. Thêm liên hệ thứ 2 vào file đã có
	const res2 = saveOrUpdateContact(
		{
			key: "sep_hung",
			name: "Nguyễn Văn Hùng",
			phone: "0988123456",
			note: "Giám đốc",
		},
		tmpFilePath,
	);
	assert.equal(res2.isNew, true);
	contacts = loadContacts(tmpFilePath);
	assert.equal(contacts.length, 2);
	assert.equal(contacts[1].key, "sep_hung");

	// 5.3. Cập nhật liên hệ thứ 1 (thay đổi phone và note)
	const res3 = saveOrUpdateContact(
		{
			key: "c_kieu_anh_syt",
			name: "C Kiều Anh Syt - Đã đổi",
			phone: "098 999 99 99",
			email: "nguyenkieuanhvp85@gmail.com",
			note: "Trưởng phòng",
		},
		tmpFilePath,
	);
	assert.equal(res3.isNew, false);
	contacts = loadContacts(tmpFilePath);
	assert.equal(contacts.length, 2);
	const updated = contacts.find((c) => c.key === "c_kieu_anh_syt");
	assert.equal(updated?.name, "C Kiều Anh Syt - Đã đổi");
	assert.equal(updated?.phone, "098 999 99 99");
	assert.equal(updated?.note, "Trưởng phòng");

	// 5.4. Cập nhật liên hệ thứ 2
	const res4 = saveOrUpdateContact(
		{
			key: "sep_hung",
			name: "Nguyễn Văn Hùng (Sếp)",
			phone: "0988123456",
			email: "hung@gmail.com",
		},
		tmpFilePath,
	);
	assert.equal(res4.isNew, false);
	contacts = loadContacts(tmpFilePath);
	assert.equal(contacts.length, 2);
	const updated2 = contacts.find((c) => c.key === "sep_hung");
	assert.equal(updated2?.name, "Nguyễn Văn Hùng (Sếp)");
	assert.equal(updated2?.email, "hung@gmail.com");
	console.log("✅ Passed: saveOrUpdateContact (create, append, update)");
} finally {
	if (fs.existsSync(tmpFilePath)) {
		fs.unlinkSync(tmpFilePath);
	}
}

// 6. Test getContactsFilePath với env
const originalEnv = process.env.ZALO_CONTACTS_TOML;
try {
	process.env.ZALO_CONTACTS_TOML = "/custom/path/contacts.toml";
	assert.equal(getContactsFilePath(), "/custom/path/contacts.toml");
} finally {
	if (originalEnv !== undefined) {
		process.env.ZALO_CONTACTS_TOML = originalEnv;
	} else {
		delete process.env.ZALO_CONTACTS_TOML;
	}
}
console.log("✅ Passed: getContactsFilePath respects ZALO_CONTACTS_TOML env");

console.log("🎉 All contacts unit tests passed successfully!");
