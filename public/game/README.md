# Giao diện bóng đá 3D · Neon hologram

Giao diện hiện tại theo [front-theme.md](../../front-theme.md): sân ngang, CR7 trái/M10 phải, hai ngôi sao ở tiền cảnh và mặc định 3 cầu thủ nhỏ mỗi đội. Tỉ số 120px, đồng hồ 70px, thanh lực ngang, tăng tốc từ tim, panel quà và bảng top donate nằm trong vùng an toàn dự kiến.

Chạy `npm start` ở thư mục dự án, mở `/admin/`, đăng nhập và bật **Test Tải**. Mở `/game/` để xem trận; OBS Browser Source dùng **1080 × 1920**.

## Các địa chỉ

| Địa chỉ | Công dụng |
|---|---|
| `/game/` | Nhận trận thật từ server |
| `/game/?quality=low` | Tắt shadow, giảm mesh/hạt; giữ pixelRatio 1 |
| `/game/?debug` | FPS, draw calls, trạng thái model, cảnh báo |
| `/game/?reloadChars&debug` | Bỏ cache model, clip và texture khi thay file |
| `/game/?preview=1&scene=playing` | Xem fixture giao diện, không kết nối socket |
| `/game/character-test.html` | Chạy 18 kiểm tra model/animation và mini |

Các `scene` xem thử: `waiting`, `playing`, `goal`, `overtime`, `freeze`, `golden`, `result`, `empty`. Đây là snapshot mẫu để duyệt giao diện; đồng hồ và bóng trong fixture không mô phỏng luật trận.

## Cấu hình

- [characters.config.js](characters.config.js): file model, clip, texture, chiều cao và hướng mỗi đội.
- [Hướng dẫn thay model](assets/characters/README.md): GLB/GLTF/FBX, clip Mixamo và xử lý ảnh.
- [view.config.js](view.config.js): các vùng `layout` theo pixel, camera, kích thước/vị trí ngôi sao, `miniPlayers.perTeam`, chiều cao mini, mức chất lượng và nhịp LED. Mặc định chừa trên 150px, dưới 400px, phải 140px, trái 48px. Cần đối chiếu trên điện thoại TikTok thật.
- Tên/màu đội, số áo, cú pháp bình luận và thông tin trận lấy từ snapshot server. Không thêm luật tính điểm/lực ở client.

Three.js **0.187.0**, các loader, Draco, Meshopt và font **Roboto Condensed 5.3.0** được lưu trong `vendor/` và `assets/fonts/`. Giữ các file LICENSE khi phân phối. Không tải thư viện/font từ CDN lúc live. Avatar dùng ảnh dự phòng khi không tải được.

## Cấu trúc

| File/thư mục | Nội dung |
|---|---|
| `index.html`, `game.css` | HUD HTML nét, bố cục dọc, bảng donate, banner |
| `game.js` | Socket, snapshot, avatar, HUD, hiệu ứng DOM và chẩn đoán |
| `stadium.js`, `hologram-effects.js` | Sân ngang Three.js, 2 ngôi sao, mini, LED, vệt bóng, băng, cúp và pool hiệu ứng |
| `characters.js`, `character-rules.js` | Nạp model/clip, căn chiều cao, animation và fallback |
| `characters.config.js`, `view.config.js` | Cấu hình model và trình bày |
| `assets/characters/fixtures/` | Model/animation nhỏ tự tạo dùng kiểm tra |
| `tests/character-tests.js`, `character-test.html` | Kiểm tra trực tiếp bằng loader thật trong browser |
| `tests/scenarios.js` | 8 snapshot giao diện mẫu |
| `tests/theme-checks.js` | 8 kiểm tra chiều sân, đóng băng, LED, vùng an toàn và pool; chạy ở mỗi mức chất lượng |
| `tests/generate-fixtures.mjs` | Tạo lại các fixture bằng Node, không cần package mới |

Chế độ `low` tắt shadow, rung/trôi/zoom camera, giảm LED từ 96 xuống 40 và hạt từ 240 xuống 72. Không dùng bloom hay backdrop-filter toàn màn hình. LED phản ứng với `live:chat`/`live:like` và giảm dần trong vài giây; các tín hiệu này chỉ điều khiển ánh sáng, không tính lực trận.

Kiểm tra theme: mở `/game/?preview=1`, rồi chạy trong console:

```js
const { runThemeChecks } = await import('/game/tests/theme-checks.js');
await runThemeChecks(window.__gameView);
```

Lặp lại với `&quality=low`. Hàm từ chối chạy nếu trang đang nối socket trận thật.

Xem [báo cáo neon hiện tại](QA-front-theme.md), [8 ảnh mới](../../docs/screenshots/front-theme/) và [báo cáo trước khi đổi theme](QA.md).
