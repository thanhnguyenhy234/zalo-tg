# Local node_modules patches

Repo không dùng patch-package; patch được apply thủ công bằng `git apply`.

## Danh sách patch

- `zca-js-upload-concurrency.patch` — `node_modules/zca-js/dist/apis/uploadAttachment.js`:
  zca-js 2.1.2 đẩy **tất cả** chunk upload vào một `Promise.all` (file 110MB → ~55
  kết nối song song → `ConnectTimeoutError` tới `tt-files-wpa.chat.zalo.me` trên Pi).
  Patch biến mỗi request thành lazy thunk và chạy tuần tự theo batch **5 request
  song song**, giữ nguyên thứ tự chunk và logic `uploadCallbacks`.

## Reapply sau khi npm install / npm ci

```bash
bash scripts/apply-patches.sh
```

Script idempotent: patch đã apply sẵn sẽ được bỏ qua, patch lệch version sẽ báo FAILED.

## Cập nhật patch khi nâng version zca-js

1. Sửa file trong `node_modules/...` cho đúng ý đồ.
2. Tạo lại patch, ví dụ:

   ```bash
   diff -u --label a/node_modules/zca-js/dist/apis/uploadAttachment.js \
           --label b/node_modules/zca-js/dist/apis/uploadAttachment.js \
           /tmp/uploadAttachment.js.orig \
           node_modules/zca-js/dist/apis/uploadAttachment.js \
           > patches/zca-js-upload-concurrency.patch
   ```
