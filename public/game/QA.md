# Báo cáo giao diện 3D — 07/11/2026

Đã tiếp tục từ phần code 3D đang có trong working tree và hoàn thiện bước A của `BRIEF-live-tiktok-giao-dien-3d.md`. Phần code thay đổi trong đợt tiếp tục này nằm ở `public/game/`; ảnh lưu tại `docs/screenshots/`. Không sửa luật server, hợp đồng socket, dependency trong package.json, dữ liệu live hoặc cấu hình bí mật. Không commit.

## Kết quả

| Kiểm tra | Kết quả |
|---|---|
| `npm test` sau thay đổi | 9/9 smoke, 41/41 Node đạt |
| `/game/character-test.html` | 15/15 đạt bằng Chrome với file fixture thực |
| Trận Test Tải | Bật nút Test Tải ở admin, 15 bot; ghi nhận WAITING → PLAYING → OVERTIME → RESULT → trận mới |
| Chu kỳ quan sát | Trận số 2: bắt đầu 10:38:03, bù giờ 10:40:33, kết quả 10:41:03, trận mới 10:41:18 (UTC+7) |
| Sự kiện ghi nhận trong cửa sổ thử | 30 lượt vào đội, 7 gift_skill, 2 freeze, 1 goal, 1 overtime, 1 result, 3 gift_rejected |
| JavaScript khi chạy trận/giao diện | Không ghi nhận lỗi pageerror |
| F5 giữa trận | Match ID và tỉ số khớp snapshot trước/sau tải lại |
| Ngắt/nối mạng bằng browser | Sân và hướng dẫn giữ hiển thị; socket tự kết nối lại |
| Avatar bị chặn tải | Tự dùng `avatar-fallback.svg` |
| Tài nguyên game | Không có request ngoài origin trong lượt chạy game/preview; thử avatar lỗi riêng bằng chặn request |
| Cú pháp tham gia | Thay keywords trong snapshot sang “đỏ”/“xanh”, HUD cập nhật tương ứng |
| Donate | Đổi thứ hạng, tên hàng đầu và animation đổi vị trí cập nhật đúng |
| Vùng an toàn | Các vùng HUD chính nằm trong x=48..940, y=150..1520 ở 1080×1920 |
| Mất WebGL context | Dùng WEBGL_lose_context, khôi phục lại renderer và hai cầu thủ |
| Kiểm tra mã | Cú pháp JavaScript và `git diff --check` đạt |

Test Tải và browser chạy với server sao chép vào workspace tạm, cổng riêng; không dùng phiên live chính. Smoke test có log lỗi kết nối tài khoản TikTok giả theo kịch bản sẵn có; toàn bộ test vẫn đạt. 404 của model/clip thiếu trong trang character-test là có chủ ý.

## Hệ thống nhân vật

Đã kiểm tra GLB, GLTF kèm BIN, FBX có animation và FBX clip riêng không mesh; ghép clip bằng alias và fallback; quy đổi cm/m; khóa X/Z của Hips, giữ Y; đo rig bằng 24 mẫu; scale/chạm đất; hủy trong khi đang tải; lặp ăn mừng và trở lại idle/run sau clip một lần. Kiểm tra URL texture xác nhận FBX dùng file local và giữ đường dẫn ghi đè.

Sửa lỗi animation root có thể ghi đè scale/chạm đất bằng một group bao ngoài phần được AnimationMixer điều khiển. Cầu thủ tạm và model dùng chung `createCharacter(teamId)`, `object3d`, `play()`, `update()` và `dispose()`.

Đã nạp đồng thời GLB có rig và FBX trong sân `/game/` bằng cấu hình được ghi đè riêng trong browser kiểm thử, xác nhận cả hai chuyển thành `kind: model`. Bỏ ghi đè rồi tải lại trở về hai cầu thủ tạm; file cấu hình của người dùng giữ mặc định trống.

Các model mẫu chỉ là hình học đơn giản do dự án tự tạo. **Chưa thử model/texture/rig Mixamo thật**, chưa xác nhận ghép animation từ các skeleton khác nhau. Model thật và clip cần dùng cùng rig; tài nguyên Draco/Meshopt đã được lưu cục bộ nhưng fixture hiện không kiểm tra mesh nén.

## Hiệu năng

Máy Windows, CPU **Intel Core i5-13400**, Chrome headless **156.0.8078.80**. WebGL thực tế dùng **Intel UHD Graphics 730, ANGLE D3D11**; máy có RTX 3060 nhưng lượt đo này không dùng GPU đó.

Viewport 1080×1920, deviceScaleFactor/pixelRatio=1; một trang game đang hoạt động. Đo mỗi mức khoảng 10 giây sau warm-up 1,5 giây, hai cầu thủ tạm, 12 bóng nhỏ fixture, hiệu ứng tuyệt kỹ mỗi 1,5 giây. Đây là đo browser thử nghiệm, không phải benchmark OBS.

| Chất lượng | FPS trung bình | P95 frame | Mẫu | Draw calls ở cuối lượt |
|---|---:|---:|---:|---:|
| normal | 59,95 | 16,9 ms | 600 | 126 |
| low | 59,92 | 16,8 ms | 599 | 79 |

Lượt đầu có nhiều tab và trang admin mở cho số đo thấp, không dùng để suy ra hiệu năng renderer. Đã đo lại với chỉ một trang hoạt động như điều kiện trên. Trận thật sau khi đưa game lên trước cũng đạt khoảng 59,26 FPS trên cửa sổ 600 frame quan sát.

## Hình ảnh và thiết kế

8 ảnh PNG **1080×1920**, chụp từ fixture rõ nhãn “BẢN XEM THỬ”, đã xem lại: [chờ](../../docs/screenshots/waiting.png), [đang đá](../../docs/screenshots/playing.png), [ghi bàn](../../docs/screenshots/goal.png), [bù giờ](../../docs/screenshots/overtime.png), [đóng băng](../../docs/screenshots/freeze.png), [bóng vàng](../../docs/screenshots/golden.png), [kết quả](../../docs/screenshots/result.png), [phòng trống](../../docs/screenshots/empty.png).

Chọn nền xanh sân tối, bảng tỉ số sáng, font condensed và màu đỏ/xanh từ server để ưu tiên độ rõ khi thu nhỏ lên điện thoại. Sân dọc có khung thành, lưới, ghế và đèn; HUD HTML giữ chữ sắc nét. Bảng donate hai cột nằm sát hướng dẫn tham gia và phía trên vùng bình luận TikTok dự kiến. Hạt, vòng xung lực, bóng nhỏ và hiệu ứng DOM dùng pool để hạn chế cấp phát khi có nhiều quà.

## Chưa xác nhận

- OBS Browser Source thực tế, audio và chạy live dài 1–2 giờ.
- Vùng che của TikTok trên điện thoại/tài khoản thật; các số safeArea hiện là ước lượng theo brief.
- Hiệu năng khi thay hai model thật 20–50 nghìn đỉnh hoặc texture lớn.
- Nhịp trận/cân bằng chưa đạt trong báo cáo cân bằng trước đó vẫn cần xử lý ở đợt luật riêng; đợt này không thay thông số để che vấn đề đó.

Hướng dẫn vận hành: [README](README.md). Hướng dẫn thêm nhân vật: [assets/characters/README.md](assets/characters/README.md). Dữ liệu QA có cấu trúc: [qa-results.json](tests/qa-results.json).
