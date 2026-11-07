# Brief: game "CR7 vs M10" cho repo LIve-Tiktok — cập nhật theo quy trình

> **Cập nhật 07/11/2026:** người dùng đã yêu cầu cập nhật cả code và tài liệu theo `QUYTRINH-live-bong-da-cr7-vs-m10.md`. Đợt này hoàn thiện phần nền giai đoạn 1–3: bảo mật admin, luật trận 180 giây, hàng đợi sự kiện và giao diện hình khối. Các mục dưới đây thay thế các thông số và giới hạn của brief ban đầu.

> File này viết cho Codex ở dự án thật (repo `dangbinhduongwork-ai/LIve-Tiktok`). Đọc hết trước khi làm.
> Người dùng nói tiếng Việt: trả lời tiếng Việt, ngắn gọn, đi thẳng vào việc.
> Quy trình đầy đủ nằm ở [QUYTRINH-live-bong-da-cr7-vs-m10.md](QUYTRINH-live-bong-da-cr7-vs-m10.md) trong repo này. File này ghi phạm vi triển khai hiện tại.

## 1. Mục tiêu lần này

Cập nhật **logic trận đấu phía server** (`src/gameEngine.js`), **giao diện hình khối** (`public/game/`), xác thực quản trị (`src/adminAuth.js`, `public/login/`) và hàng đợi (`src/gameEventQueue.js`).

**Giai đoạn tiếp theo:** nhân vật 3D, animation, âm thanh/BLV, đo FPS trong OBS và thử live thật. Repo hiện chưa có model, clip animation, kho âm thanh hay các tệp tham chiếu `quytrinh.md` và `demo-messi/rigged.html`.

## 2. Ý tưởng game (tóm tắt)

- Màn dọc 9:16 (1080×1920), hai đội: **CR7** (đỏ-trắng) và **M10** (xanh-trắng). Người xem thật, tên và hình người thật: người dùng đã chọn dùng tên Ronaldo/Messi. Hãy để **tên đội, màu, từ khoá, số áo nằm trong `src/gameConfig.js`** để đổi được mà không sửa logic.
- Ở giữa là thanh kéo co (vị trí bóng). Bóng chạm biên một phía là ghi bàn, tỉ số tăng, bóng về giữa sân.
- Mỗi trận: chờ 5s → đá 150s → **luôn bù giờ 30s**, bàn thắng ×2 → kết quả 15s → trận mới. Thời gian thi đấu là 180s; một chu kỳ đầy đủ là 200s. `overtime.always` trong config cho phép đổi chính sách sau này.

## 3. Hệ thống có sẵn (đừng phá)

Repo có **bridge Socket.IO** chuẩn hoá sự kiện. Đọc `README.md` (mục 4 và 9), `src/tiktokHandler.js`, `src/server.js`, `src/stateManager.js` trước.

- `live:gift` (dùng **`data.deltaCoins`**, không dùng `diamondCount × repeatCount`), `live:chat`, `live:like`, `live:viewer_count`, `live:session_reset`.
- `/admin` có bộ giả lập quà, chat, tim và 15 bot tự động. Dùng nó để test, không cần live thật.
- Giữ luồng chuẩn hóa và chống trùng trong `src/tiktokHandler.js`, `src/stateManager.js`. Được sửa `server.js` và `public/admin/` để thêm xác thực, hàng đợi và nút điều khiển trận.
- Baseline đã kiểm tra: cài thư viện thành công, 9 smoke test cũ xanh, server chạy được. `npm test` nay chạy smoke test trong workspace tạm rồi chạy các test luật, hàng đợi và server thật; không ghi vào `data/session.json` của repo chính.

## 4. Việc cần làm

### 4.1. `src/gameConfig.js`
Toàn bộ số liệu và chữ có thể chỉnh: tên đội, màu, từ khoá vào đội, bảng quy đổi, cooldown, trần. Không đặt số "ma thuật" trong `gameEngine.js`.

### 4.2. `src/gameEngine.js` (logic thuần, không phụ thuộc socket)
- Dạng class `GameEngine({ config, rng, now, emit })`: nhận `rng` và đồng hồ qua tham số để **test được và lặp lại được**. Có `tick(dt)`, `handleChat(data)`, `handleGift(data)`, `handleLike(data)`, `handleViewerCount(n)`, `reset()`.
- Trạng thái: `phase` (`WAITING` / `PLAYING` / `OVERTIME` / `RESULT`), `timeLeft`, `score {cr7, m10}`, `ball.pos` trong khoảng −1000..+1000 (−1000 = khung thành CR7, +1000 = khung thành M10), `forces`, `players` (userId → đội), `top donator mỗi đội`.
- **Gán đội:** comment khớp từ khoá (`7`, `cr7` → CR7; `10`, `m10` → M10, không phân biệt hoa thường) gán đội cho `userId` **một lần trong trận**, không đổi giữa trận. Comment khác từ khoá không có tác dụng.
- **Vòng lặp:** `setInterval` khoảng 50ms, tính `dt` bằng đồng hồ thật, không giả định bước cố định.
- Mỗi `tick`: tính lực hiệu dụng mỗi đội (xem bảng dưới), cập nhật vị trí bóng, kiểm tra ghi bàn, đổi phase.

### 4.3. Nối vào `src/server.js`
Tìm nơi `tiktokHandler` đẩy sự kiện ra `io` (hàm callback đặt bằng `setEventCallback`). Thêm **một nhánh** cấp cùng dữ liệu cho `gameEngine`, không sửa hành vi cũ.
- Phát `game:state` (tối đa 10 lần/giây): `{ phase, timeLeft, score, ballPos, forces, teams: {cr7:{count, top3}, m10:{count, top3}}, viewerCount }`.
- Phát `game:event` khi có sự kiện: `{ type: 'goal'|'gift_skill'|'freeze'|'overtime'|'result'|'team_join', team, user, giftName, deltaCoins }`.
- Admin test: `admin:custom_command` → `game:custom_command`, với `START`, `RESET_MATCH`, `FORCE_GOAL {team}`; có nút tương ứng trên `/admin`, yêu cầu phiên đăng nhập hợp lệ.

### 4.4. `public/game/index.html` + `game.js` (hình khối)
- Canvas 1080×1920 theo mẫu README mục 7. Chỉ **vẽ** từ `game:state` và `game:event`, không giữ logic luật ở client.
- Hiển thị: tỉ số, đồng hồ, thanh kéo co + bóng, hai đội (hình chữ nhật hoặc tròn màu), top 3 donator mỗi đội, dòng sự kiện gần nhất, chữ "GOAL!" và "BÙ GIỜ ×2" khi có sự kiện.
- Kết nối lại socket tự động và đồng bộ qua `init_state` (F5 không mất trận).

### 4.5. Test
`npm test` phải giữ smoke test cũ xanh và phủ: gán đội một lần, cooldown comment, trần bóng/lực, quà theo bậc, bàn thắng và reset bóng, bù giờ cố định kể cả khi cách biệt lớn, kết thúc và trận mới, AI nền, đóng băng 10s, hàng đợi 100 quà, chống lệnh admin trái phép và đồng bộ khi kết nối lại.

### 4.6. Quản trị có xác thực

- Bind cố định `127.0.0.1`; cấu hình `HOST` cũ trong `.env` không mở server ra LAN.
- `/admin` chuyển tới `/login/` khi chưa đăng nhập. Dùng `ADMIN_TOKEN` nếu cấu hình; nếu chưa có, server tạo mã tại `data/admin-token.txt` (đã bị Git bỏ qua).
- Phiên đăng nhập dùng cookie HttpOnly, SameSite=Strict, hạn 12 giờ. Đăng xuất thu hồi phiên và ngắt socket admin.
- Mọi lệnh `admin:*` và `POST /api/reset` cần cookie hợp lệ hoặc token. Socket admin dùng `auth: { role: 'admin', token }` khi kết nối từ công cụ ngoài; REST dùng `Authorization: Bearer ...`.
- `/game` và API đọc vẫn hoạt động không cần đăng nhập. CORS chỉ cho origin local; thêm origin phát triển bằng `ALLOWED_ORIGINS` khi cần. Luồng `admin:*` chỉ phát vào phòng socket admin.

### 4.7. Hàng đợi và giới hạn tải

- FIFO tối đa 4096 sự kiện, xử lý tối đa 100 sự kiện mỗi tick, dành 512 vị trí cho quà. Gộp tim/số mắt xem liền nhau, giữ thứ tự chat vào đội trước quà.
- Cooldown dựa trên thời điểm sự kiện đến; reset và trận mới loại sự kiện cũ còn chờ.
- Tối đa 512 xung lực đang hoạt động, chia đều chỗ cho hai đội; lực hiệu dụng tối đa 1500 mỗi đội trước hệ số đóng băng. Các số đều ở config.
- Khi đầy, game từ chối sự kiện vượt trần và tăng `dropped`/`droppedGifts` trong `/api/status`; admin nhận cảnh báo. Bridge vẫn ghi nhận quà, nhưng hiệu ứng/điểm donate trong game của sự kiện bị từ chối không được áp dụng. Đây là giới hạn quá tải, không phải bảo đảm xử lý vô hạn.

## 5. Bảng luật khởi điểm (người dùng đã đồng ý nhận số đề xuất; sẽ chỉnh sau khi thử)

Thang vị trí bóng −1000..+1000. Lực của đội dương = đẩy về phía khung thành đối thủ.

| Nguồn | Hiệu ứng khởi điểm | Giới hạn |
|---|---|---|
| Comment hợp lệ | +1 điểm lực tức thì | Mỗi người 1 lần/2s; tối đa 30 bóng nhỏ cùng lúc trên màn |
| Tim (like) | Tăng tốc độ đẩy toàn đội: mỗi tim +0,1%, tối đa +25%, giảm dần 2%/giây | Tính theo đội của người thả; người chưa vào đội không tính |
| Quà 1–9 xu | +20 điểm lực mỗi xu mới, tối đa +100 | — |
| Quà 10–98 xu | "Tuyệt kỹ": +150 điểm lực | Mỗi người 1 lần/3s |
| Quà 99–999 xu | "Bóng vàng": +400 điểm lực | Mỗi đội tối đa 1 lần/60s |
| Quà ≥ 1000 xu | "Đóng băng": lực đối thủ ×0,3 trong **10s** | Mỗi đội tối đa 1 lần/trận, không dùng trong 20s cuối bù giờ |
| Ghi bàn | +1 tỉ số (×2 khi bù giờ), bóng về 0, nghỉ 3s | — |
| Phe đang thua (bóng lệch ≥ 400 về phía mình) | Lực +15% | Gỡ thế cho phe thua |

Đơn giá `diamondCount` chọn bậc quà; `deltaCoins` tính phần xu mới và tổng donate. Vì vậy combo x10 Hoa Hồng vẫn là quà cơ bản, không biến thành tuyệt kỹ. Các khoảng giá chưa nêu trong bản gốc được mở rộng như bảng trên (Vương Miện 199 xu thuộc Bóng vàng). Bóng vàng vẫn cộng lực 400, không tự ghi bàn. Đóng băng 10s vẫn giữ hệ số ×0,3 và giới hạn lượt dùng.

Mỗi người đã vào đội tạo lực nền 8; hệ số chuyển lực sang vị trí bóng là 1,5. Đây là thông số thử nghiệm. Test Tải gán 15 bot theo tỉ lệ 9/6, đổi phe đông hơn theo trận, và gán lại sau reset/trận mới; tương tác TikTok thật chỉ vào đội bằng từ khóa.

**AI nền (đã chốt: có):** mỗi đội có lực nền ngẫu nhiên khoảng 6 điểm lực/giây, nhân hệ số `aiScale = clamp(1 − viewerCount / 30, 0, 1)`. Phòng đông thì AI giảm về 0. Mục đích: phòng ít người trận vẫn chuyển động.

## 6. Ràng buộc

- Giữ dữ liệu chuẩn hóa và chống combo trùng của bridge; các quyền truy cập quản trị được thay đổi theo giai đoạn bảo mật.
- Dùng **`deltaCoins`** cho quà. Nếu bỏ qua, quà combo sẽ bị cộng trùng.
- Không đặt luật ở client; client chỉ hiển thị.
- Không thêm dependency mới nếu không cần (đã có `express`, `socket.io`, `dotenv`).
- Không commit thay người dùng. Không đụng `.env`, `data/session.json`.

## 7. Tiêu chí hoàn thành

1. `npm test` xanh, kể cả test mới.
2. `npm start`, đăng nhập `/admin`, bật **Test Tải (15 bots)**, mở `/game`: đủ phase chờ → đá → bù giờ → kết quả → trận mới, có ít nhất một bàn thắng.
3. Giả lập quà ở `/admin` (ví dụ `5 Hoa = 5 Xu`, Vương Miện 199 xu) cho thấy đúng hiệu ứng theo bảng; combo `x10` không cộng trùng.
4. Với 0 người xem, bóng vẫn di chuyển nhờ AI nền; khi `viewerCount` lớn thì AI tắt.
5. F5 trang `/game` giữa trận vẫn đồng bộ đúng.
6. Admin không có token/cookie bị từ chối; game không có token vẫn xem được. 100 quà dồn không mất xu trong game; reset không áp dụng lại sự kiện tồn từ trận cũ.

Khi xong báo: file đã thêm/sửa, kết quả `npm test`, và những chỗ phải đoán (nhất là cấu trúc callback trong `server.js`).

## 8. Việc còn lại trong quy trình

- Đo FPS/độ trễ trong OBS, tăng tải ngoài mức 15 bot và thử live thật 1–2 giờ.
- Nhân vật 3D: sẽ dùng quy trình Meshy → Mixamo → Three.js (`quytrinh.md`).
- Âm thanh, BLV, hiệu ứng pháo hoa.
