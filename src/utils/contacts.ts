import fs from "fs";
import path from "path";
import { config } from "../config.js";

export interface ContactEntry {
	key: string; // alias hoặc key bảng, ví dụ "buu", "anh_tuan"
	name: string; // Tên hiển thị
	uid?: string; // Zalo user ID (tùy chọn)
	phone?: string; // Số điện thoại nếu có
	email?: string; // Email / Home email
	note?: string; // Ghi chú nếu có
}

/**
 * Chuẩn hóa chuỗi tiếng Việt: bỏ dấu, chuyển 'đ'/'Đ' thành 'd', chuyển chữ thường
 */
export function stripVietnamese(str: string): string {
	return str
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[đĐ]/g, "d")
		.toLowerCase();
}

/**
 * Tự động sinh key/alias từ tên:
 * - Bỏ dấu tiếng Việt
 * - Chuyển chữ thường
 * - Thay khoảng trắng và ký tự không phải chữ số thành '_'
 * Ví dụ: "C Kiều Anh Syt" -> "c_kieu_anh_syt"
 */
export function generateContactKey(name: string): string {
	const normalized = stripVietnamese(name)
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
	return normalized || "contact";
}

/**
 * Xác định đường dẫn file cấu hình contacts:
 * 1. Biến môi trường ZALO_CONTACTS_TOML
 * 2. Mặc định: /home/lediem/Dropbox/zalo-contacts.toml (nếu tồn tại)
 * 3. Fallback: <dataDir>/contacts.toml (nếu tồn tại)
 * 4. Nếu chưa tồn tại file nào, trả về /home/lediem/Dropbox/zalo-contacts.toml
 */
export function getContactsFilePath(): string {
	if (process.env.ZALO_CONTACTS_TOML && process.env.ZALO_CONTACTS_TOML.trim()) {
		return process.env.ZALO_CONTACTS_TOML.trim();
	}
	const defaultPath = "/home/lediem/Dropbox/zalo-contacts.toml";
	if (fs.existsSync(defaultPath)) {
		return defaultPath;
	}
	const fallbackPath = path.join(config.dataDir, "contacts.toml");
	if (fs.existsSync(fallbackPath)) {
		return fallbackPath;
	}
	return defaultPath;
}

/**
 * Tách giá trị và loại bỏ inline comment (#) bên ngoài chuỗi quote ("..." hoặc '...').
 */
function parseValueAndComment(rawVal: string): string {
	const trimmed = rawVal.trim();
	if (!trimmed) return "";

	// Quoted string "..."
	if (trimmed.startsWith('"')) {
		const closingIdx = trimmed.indexOf('"', 1);
		if (closingIdx !== -1) {
			return trimmed.slice(1, closingIdx);
		}
		return trimmed.slice(1).replace(/"$/, "");
	}

	// Quoted string '...'
	if (trimmed.startsWith("'")) {
		const closingIdx = trimmed.indexOf("'", 1);
		if (closingIdx !== -1) {
			return trimmed.slice(1, closingIdx);
		}
		return trimmed.slice(1).replace(/'$/, "");
	}

	// Unquoted string: strip inline comment starting with #
	const hashIdx = trimmed.indexOf("#");
	const valWithoutComment =
		hashIdx !== -1 ? trimmed.slice(0, hashIdx) : trimmed;
	return valWithoutComment.trim();
}

/**
 * Parser TOML zero-dependency cho contacts:
 * Hỗ trợ cả 2 kiểu viết thông dụng:
 * 1. Bảng [key]
 * 2. Mảng [[contacts]] hoặc [[contact]]
 */
export function parseContactsToml(content: string): ContactEntry[] {
	const lines = content.split(/\r?\n/);
	const contacts: ContactEntry[] = [];
	let current: Partial<ContactEntry> | null = null;

	const commitCurrent = () => {
		if (
			current &&
			(current.name ||
				current.phone ||
				current.email ||
				current.uid ||
				current.key)
		) {
			const key =
				(current.key ?? "").trim() ||
				(current.name ?? "").trim() ||
				(current.phone ?? "").trim() ||
				(current.uid ?? "").trim();
			const name =
				(current.name ?? "").trim() ||
				key ||
				(current.phone ?? "").trim() ||
				(current.uid ?? "").trim();

			if (key || name) {
				const entry: ContactEntry = {
					key,
					name,
				};
				if (current.uid && current.uid.trim()) {
					entry.uid = current.uid.trim();
				}
				if (current.phone && current.phone.trim()) {
					entry.phone = current.phone.trim();
				}
				if (current.email && current.email.trim()) {
					entry.email = current.email.trim();
				}
				if (current.note && current.note.trim()) {
					entry.note = current.note.trim();
				}
				contacts.push(entry);
			}
		}
		current = null;
	};

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}

		// Check array table header: [[contacts]] or [[contact]]
		const arrayHeaderMatch = line.match(/^\[\[\s*([a-zA-Z0-9_-]+)\s*\]\]$/);
		if (arrayHeaderMatch) {
			commitCurrent();
			current = {};
			continue;
		}

		// Check table header: [key]
		const tableHeaderMatch = line.match(/^\[\s*([a-zA-Z0-9_-]+)\s*\]$/);
		if (tableHeaderMatch) {
			commitCurrent();
			const headerKey = tableHeaderMatch[1].trim();
			if (
				headerKey.toLowerCase() === "contacts" ||
				headerKey.toLowerCase() === "contact"
			) {
				current = {};
			} else {
				current = { key: headerKey };
			}
			continue;
		}

		// Check key = value
		const eqIdx = line.indexOf("=");
		if (eqIdx !== -1) {
			if (!current) {
				current = {};
			}
			const k = line.slice(0, eqIdx).trim().toLowerCase();
			const v = parseValueAndComment(line.slice(eqIdx + 1));

			if (k === "key" || k === "alias") {
				current.key = v;
			} else if (k === "name" || k === "ten") {
				current.name = v;
			} else if (
				k === "uid" ||
				k === "user_id" ||
				k === "userid" ||
				k === "zalo_id" ||
				k === "zaloid"
			) {
				current.uid = v;
			} else if (
				k === "phone" ||
				k === "phone_number" ||
				k === "phonenumber" ||
				k === "mobile" ||
				k === "tel" ||
				k === "sdt"
			) {
				current.phone = v;
			} else if (
				k === "email" ||
				k === "mail" ||
				k === "e-mail" ||
				k === "home" ||
				k === "gmail"
			) {
				current.email = v;
			} else if (k === "note" || k === "notes" || k === "ghichu") {
				current.note = v;
			}
		}
	}

	commitCurrent();
	return contacts;
}

/**
 * Đọc fresh file mỗi lần gọi (để khi người dùng sửa file là có tác dụng ngay).
 * Không crash nếu file không tồn tại hoặc lỗi đọc file.
 */
export function loadContacts(customFilePath?: string): ContactEntry[] {
	try {
		const filePath = customFilePath || getContactsFilePath();
		if (!fs.existsSync(filePath)) {
			return [];
		}
		const content = fs.readFileSync(filePath, "utf-8");
		return parseContactsToml(content);
	} catch (err) {
		console.error(`[Contacts] Error reading or parsing contacts file:`, err);
		return [];
	}
}

/**
 * Phân tích text đầu vào (dạng vCard / danh thiếp sao chép hoặc cú pháp nhanh 1 dòng)
 * thành Partial<ContactEntry>.
 */
export function parseContactInput(rawText: string): Partial<ContactEntry> {
	const trimmed = rawText.trim();
	if (!trimmed) return {};

	const lines = trimmed
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	const result: Partial<ContactEntry> = {};

	// 1. Kiểm tra xem có dòng nào match format Prefix: Value không
	let hasPrefixMatch = false;

	for (const line of lines) {
		const match = line.match(/^([^:]+):\s*(.*)$/);
		if (match) {
			const prefix = match[1].trim().toLowerCase();
			const val = match[2].trim();

			if (/^(name|tên|ten|full\s*name|fullname)$/i.test(prefix)) {
				result.name = val;
				hasPrefixMatch = true;
			} else if (
				/^(mobile|phone|sđt|sdt|tel|điện\s*thoại|dien\s*thoai|hotline|cell)$/i.test(
					prefix,
				)
			) {
				result.phone = val;
				hasPrefixMatch = true;
			} else if (
				/^(home|email|mail|e-mail|gmail|work\s*email|home\s*email)$/i.test(
					prefix,
				)
			) {
				result.email = val;
				hasPrefixMatch = true;
			} else if (
				/^(note|notes|ghi\s*chú|ghi\s*chu|địa\s*chỉ|dia\s*chi|address|chức\s*vụ|chuc\s*vu|phòng\s*ban|phong\s*ban)$/i.test(
					prefix,
				)
			) {
				result.note = val;
				hasPrefixMatch = true;
			} else if (/^(uid|user\s*id|userid|zalo\s*id|zaloid)$/i.test(prefix)) {
				result.uid = val;
				hasPrefixMatch = true;
			} else if (/^(key|alias|mã|ma|id)$/i.test(prefix)) {
				result.key = val;
				hasPrefixMatch = true;
			}
		}
	}

	if (hasPrefixMatch) {
		if (!result.key && result.name) {
			result.key = generateContactKey(result.name);
		}
		return result;
	}

	// 2. Không có prefix: Parse cú pháp nhanh 1 dòng hoặc nhiều từ
	// Cú pháp: [alias] <tên> <sđt> [email] hoặc <tên> <sđt> [email]
	let rest = trimmed;

	// Check [alias] ở đầu
	const aliasMatch = rest.match(/^\[\s*([a-zA-Z0-9_-]+)\s*\]\s*(.*)$/);
	if (aliasMatch) {
		result.key = aliasMatch[1].trim();
		rest = aliasMatch[2].trim();
	}

	// Tìm email
	const emailMatch = rest.match(
		/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
	);
	if (emailMatch) {
		result.email = emailMatch[0];
		rest = rest.replace(emailMatch[0], " ").replace(/\s+/g, " ").trim();
	}

	// Tìm SĐT: chuỗi bắt đầu bằng +84 hoặc 0, theo sau là 8-11 số có thể có khoảng trắng/chấm/gạch nối
	const phoneMatch = rest.match(/(?:(?:\+84|0)[1-9](?:[\s.-]*\d){7,10})/);
	if (phoneMatch) {
		result.phone = phoneMatch[0].trim();
		rest = rest.replace(phoneMatch[0], " ").replace(/\s+/g, " ").trim();
	}

	// Phần còn lại làm tên
	if (rest) {
		result.name = rest;
	}

	if (!result.key && result.name) {
		result.key = generateContactKey(result.name);
	}

	return result;
}

/**
 * Chuyển đổi 1 ContactEntry thành định dạng TOML section [key].
 */
export function formatContactTomlSection(entry: ContactEntry): string {
	const lines: string[] = [`[${entry.key}]`];
	lines.push(`name = ${JSON.stringify(entry.name)}`);
	if (entry.phone) {
		lines.push(`phone = ${JSON.stringify(entry.phone)}`);
	}
	if (entry.email) {
		lines.push(`email = ${JSON.stringify(entry.email)}`);
	}
	if (entry.uid) {
		lines.push(`uid = ${JSON.stringify(entry.uid)}`);
	}
	if (entry.note) {
		lines.push(`note = ${JSON.stringify(entry.note)}`);
	}
	return lines.join("\n");
}

/**
 * Thêm mới hoặc cập nhật liên hệ vào file TOML:
 * - Nếu key đã tồn tại: cập nhật section [key] đó
 * - Nếu key chưa tồn tại: append section [key] mới vào cuối file
 */
export function saveOrUpdateContact(
	entry: ContactEntry,
	customFilePath?: string,
): { success: boolean; isNew: boolean; entry: ContactEntry } {
	const filePath = customFilePath || getContactsFilePath();
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	let content = fs.existsSync(filePath)
		? fs.readFileSync(filePath, "utf-8")
		: "";
	const escapedKey = entry.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	// Regex tìm table header [key] và tất cả các dòng thuộc section đó cho đến section tiếp theo hoặc EOF
	const tableHeaderRegex = new RegExp(
		`(^|\\r?\\n)[ \\t]*\\[[ \\t]*${escapedKey}[ \\t]*\\][ \\t]*(?:\\r?\\n[\\s\\S]*?)?(?=(?:\\r?\\n[ \\t]*\\[{1,2}[^\\]]+\\]{1,2})|$)`,
		"i",
	);

	const newSection = formatContactTomlSection(entry);
	let isNew = false;

	if (tableHeaderRegex.test(content)) {
		isNew = false;
		content = content.replace(tableHeaderRegex, (match, p1) => {
			const prefix = p1 ? p1 : "";
			return `${prefix}${newSection}`;
		});
	} else {
		isNew = true;
		const trimmed = content.trimEnd();
		if (trimmed) {
			content = `${trimmed}\n\n${newSection}\n`;
		} else {
			content = `${newSection}\n`;
		}
	}

	fs.writeFileSync(filePath, content, "utf-8");
	return { success: true, isNew, entry };
}

/**
 * Tìm kiếm contact linh hoạt:
 * - Theo key, name (không phân biệt hoa thường, hỗ trợ tiếng Việt không dấu)
 * - Theo uid, phone, email
 * - Nếu query là chuỗi số UID thuần túy (>= 5 chữ số) chưa có trong danh bạ, tạo contact tạm
 */
export function findContact(
	query: string,
	contacts?: ContactEntry[],
): ContactEntry | null {
	const rawQ = query.trim();
	if (!rawQ) return null;
	const qLower = rawQ.toLowerCase();
	const list = contacts ?? loadContacts();

	// 1. Exact match key (case-insensitive)
	const exactKey = list.find((c) => c.key.toLowerCase() === qLower);
	if (exactKey) return exactKey;

	// 2. Exact match UID (chỉ khi c.uid tồn tại)
	const exactUid = list.find((c) => c.uid && c.uid === rawQ);
	if (exactUid) return exactUid;

	// 3. Exact match phone
	const cleanPhone = rawQ.replace(/[\s.-]/g, "");
	const exactPhone = list.find(
		(c) => c.phone && c.phone.replace(/[\s.-]/g, "") === cleanPhone,
	);
	if (exactPhone) return exactPhone;

	// 4. Exact match email
	const exactEmail = list.find(
		(c) => c.email && c.email.toLowerCase() === qLower,
	);
	if (exactEmail) return exactEmail;

	// 5. Exact match name (case-insensitive)
	const exactName = list.find((c) => c.name.toLowerCase() === qLower);
	if (exactName) return exactName;

	// 6. Partial match key (case-insensitive)
	const partialKey = list.find((c) => c.key.toLowerCase().includes(qLower));
	if (partialKey) return partialKey;

	// 7. Partial match name (case-insensitive)
	const partialName = list.find((c) => c.name.toLowerCase().includes(qLower));
	if (partialName) return partialName;

	// 8. Partial match phone
	const partialPhone = list.find(
		(c) => c.phone && c.phone.replace(/[\s.-]/g, "").includes(cleanPhone),
	);
	if (partialPhone) return partialPhone;

	// 9. Partial match email
	const partialEmail = list.find(
		(c) => c.email && c.email.toLowerCase().includes(qLower),
	);
	if (partialEmail) return partialEmail;

	// 10. Unaccented Vietnamese matching (bỏ dấu tiếng Việt)
	const cleanQ = stripVietnamese(rawQ);
	const cleanQWords = cleanQ.replace(/_/g, " ").trim();

	// 10.1. So sánh theo key bỏ dấu và thay '_' bằng khoảng trắng (cũng như giữ nguyên '_')
	const unaccentedKey = list.find((c) => {
		const keyClean = stripVietnamese(c.key);
		const keyWithSpaces = keyClean.replace(/_/g, " ");
		return (
			keyClean.includes(cleanQ) ||
			keyWithSpaces.includes(cleanQ) ||
			keyWithSpaces.includes(cleanQWords)
		);
	});
	if (unaccentedKey) return unaccentedKey;

	// 10.2. So sánh theo name bỏ dấu
	const unaccentedName = list.find((c) => {
		const nameClean = stripVietnamese(c.name);
		return nameClean.includes(cleanQ) || nameClean.includes(cleanQWords);
	});
	if (unaccentedName) return unaccentedName;

	// 11. If query is a pure UID of at least 5 digits, allow dynamic temporary contact
	if (/^\d{5,}$/.test(rawQ)) {
		return {
			key: rawQ,
			name: `UID ${rawQ}`,
			uid: rawQ,
		};
	}

	return null;
}
