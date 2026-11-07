# Báo cáo triển khai — TikTok Live game CR7 vs M10

**Ngày cập nhật:** 07/11/2026

**Dự án:** `dangbinhduongwork-ai/LIve-Tiktok`

**Mục đích:** Tổng hợp kết quả, quyết định kỹ thuật và giới hạn hiện tại để bên khác nhận xét trước khi làm tiếp.

## 1. Kết quả hiện tại

Dự án đã có bản game bóng đá kéo co bằng hình khối, chạy trên trình duyệt theo tương tác TikTok Live hoặc bộ giả lập. Luật trận chạy ở server; client nhận trạng thái để vẽ. Đã bổ sung đăng nhập quản trị, bảo vệ lệnh điều khiển, hàng đợi tương tác, giới hạn lực và kiểm thử tự động.

Phần nền của **giai đoạn 1–3** trong quy trình đã được triển khai và kiểm tra cục bộ. Bản này phục vụ thử luật và nhịp chơi; chưa hoàn thành nhân vật 3D, âm thanh/BLV, đo hiệu năng trong OBS hoặc thử live thật dài hạn.

Các thay đổi đang nằm trong working tree, **chưa commit hoặc đẩy lên Git**. Báo cáo này không chứa token, API key hay nội dung `.env`.

## 2. Nền tảng có sẵn và công việc đã thực hiện

Repo ban đầu đã có Node.js, Express, Socket.IO, `tiktok-live-connector`, trang `/admin`, giả lập quà/chat/tim/15 bot, API thống kê, xuất CSV và lưu phiên. Chống cộng trùng combo bằng `deltaCoins` là chức năng có sẵn.

Công việc đã thực hiện trong quá trình triển khai:

1. Đọc README, khảo sát cấu trúc và luồng dữ liệu; đối chiếu brief với quy trình tổng thể.
2. Bổ sung `.gitignore`: thư viện cài đặt, biến thể `.env.*`, dữ liệu runtime, log, file tạm editor và workspace kiểm thử. Vẫn theo dõi `.env.example` và `package-lock.json`.
3. Kiểm tra baseline: cài dependency thành công, 9 smoke test cũ qua, server và trang admin chạy được.
4. Viết cấu hình luật, engine server, tích hợp Socket.IO và giao diện canvas cho game.
5. Viết test luật và kiểm tra tương tác trên server thật, combo quà, kết nối lại, Test Tải.
6. Cập nhật theo quy trình mới: bù giờ cố định, đóng băng 10 giây, xác thực admin, hàng đợi, giới hạn tải, nút điều khiển trận và màn kết quả.
7. Tách kiểm thử sang thư mục tạm; cập nhật README, brief và tiến độ quy trình.

Không thêm dependency vào `package.json`. Các thư viện đã có và module chuẩn của Node.js đủ cho đợt này. `package-lock.json` đã có thay đổi trước phần triển khai game; không coi toàn bộ diff của file đó là thay đổi do game mới tạo ra.

## 3. Kiến trúc và luồng xử lý

```text
TikTok Live / giả lập admin
          |
          v
tiktokHandler: chuẩn hóa, tính deltaCoins, chống combo trùng
          |
          v
server.js: callback setEventCallback
          |                              |
          v                              v
Bridge cũ: live:* / thống kê      GameEventQueue: FIFO có trần
                                         |
                                         v
                                  GameEngine phía server
                                         |
                           game:state / game:event
                                         |
                                         v
                              Canvas /game và admin
```

- Giữ nguyên mã nguồn `src/tiktokHandler.js` và `src/stateManager.js`.
- Nhánh game nhận `gift_received`, `chat_received`, `like_received`, `viewer_count` từ callback có sẵn. `session_reset` xóa trận và hàng đợi.
- `GameEngine({ config, rng, now, emit })` không phụ thuộc Socket.IO; có thể cấp RNG và đồng hồ giả để kiểm thử.
- Server tick khoảng **50 ms**, tính `dt` bằng đồng hồ đơn điệu `performance.now()`.
- Broadcast `game:state` tối đa **10 lần/giây**. Snapshot gồm phase, thời gian, tỉ số, vị trí bóng, lực, đội, top 3, số mắt xem, trạng thái đóng băng, bóng nhỏ và kết quả trận.
- `game:event` thông báo vào đội, kỹ năng quà, đóng băng, ghi bàn, bù giờ và kết quả.
- `init_state.game` đồng bộ trận khi mở trang hoặc kết nối lại. F5 không tạo trận mới.
- Trạng thái game hiện nằm trong RAM. **Khởi động lại server sẽ tạo trận mới**; file phiên của bridge không lưu toàn bộ trạng thái game.

## 4. Luật đang chạy

### Chu kỳ trận

```text
WAITING 5 giây → PLAYING 150 giây → OVERTIME 30 giây → RESULT 15 giây → trận mới
```

Thời gian thi đấu là 180 giây, toàn bộ chu kỳ là 200 giây. Bù giờ hiện **luôn xảy ra**, kể cả khi tỉ số cách biệt lớn. Có thể đổi chính sách bằng `overtime.always` trong config.

Vị trí bóng nằm trong khoảng −1000 đến +1000. −1000 là khung thành CR7, +1000 là khung thành M10. CR7 đẩy bóng theo chiều dương; M10 đẩy theo chiều âm.

### Tương tác và tính lực

| Nguồn | Hành vi hiện tại | Giới hạn |
|---|---|---|
| Chọn đội | Comment đúng `7`/`cr7` hoặc `10`/`m10`, không phân biệt hoa thường, bỏ khoảng trắng đầu/cuối | Một đội/người/trận; không đổi giữa trận |
| Comment hợp lệ | Tạo xung lực +1 và một bóng nhỏ | Mỗi người một lần/2 giây; tối đa 30 bóng nhỏ |
| Người đã vào đội | Tạo lực nền 8 cho đội | Tồn tại trong trận hiện tại |
| Tim | Mỗi tim +0,1% tốc độ/lực đội | Tối đa +25%; giảm 2 điểm phần trăm/giây |
| Quà đơn giá 1–9 xu | +20 lực mỗi xu mới nhận, tối đa +100 cho một sự kiện | Xung lực 1 giây |
| Quà đơn giá 10–98 xu | Tuyệt kỹ +150 lực | Mỗi người một lần/3 giây |
| Quà đơn giá 99–999 xu | Bóng vàng +400 lực | Mỗi đội một lần/60 giây |
| Quà đơn giá ≥1000 xu | Lực đối thủ còn 30% trong 10 giây | Mỗi đội một lần/trận; khóa trong 20 giây cuối bù giờ |
| Bóng chạm khung thành | +1 bàn; trong bù giờ +2 điểm tỉ số | Bóng về giữa, nghỉ 3 giây |
| Bóng lệch ≥400 về khung thành một đội | Đội đang bị ép nhận +15% lực | Dựa trên vị trí bóng, không dựa trên tỉ số |

Comment khác từ khóa không có tác dụng trong game. Tim và quà của người chưa vào đội không tác động tới game; bridge vẫn tiếp nhận dữ liệu như trước. Quà của người đã vào đội vẫn được tính vào bảng donate khi kỹ năng bị cooldown, nhưng không kích hoạt kỹ năng mới.

Đơn giá **`diamondCount` chọn bậc quà**; **`deltaCoins` tính phần xu mới và tổng donate**. Không dùng `diamondCount × repeatCount` để cộng lại tổng combo. Ví dụ: combo x10 Hoa Hồng vẫn là quà cơ bản; Vương Miện 199 xu thuộc Bóng vàng.

Các xung lực comment/quà kéo dài 1 giây. Hệ số đổi lực sang vị trí bóng là 1,5. Tối đa 512 xung lực đang hoạt động, chia chỗ đều cho hai đội. Lực hiệu dụng mỗi đội bị chặn ở 1500 trước khi áp dụng hệ số đóng băng.

### AI nền và bộ giả lập

- AI tạo khoảng 4–8 lực mỗi đội, trung bình 6, nhân với `clamp(1 − viewerCount / 30, 0, 1)`.
- Từ 30 mắt xem trở lên, AI nền tắt. Người chơi và tương tác vẫn tạo lực.
- Test Tải dùng 15 bot có sẵn. Riêng game gán chúng theo tỉ lệ **9/6**, đổi phe đông hơn theo trận và gán lại sau reset/trận mới.
- Việc chia lệch bot giúp thử ghi bàn và vòng trận. Đây không phải bằng chứng rằng game đã cân bằng khi hai đội ngang người.

### Thay đổi so với brief ban đầu

| Nội dung | Bản đầu | Bản hiện tại |
|---|---|---|
| Bù giờ | Chỉ khi cách biệt ≤1 | Cố định 30 giây |
| Đóng băng | 6 giây | 10 giây, vẫn dùng hệ số ×0,3 |
| Bảo mật admin | Để giai đoạn sau | Đã triển khai |
| Điều khiển trận | Có lệnh socket | Có thêm nút trên admin |
| Tiếp nhận vào game | Gọi engine trực tiếp | Qua hàng đợi có trần |
| Kiểm thử smoke | Ghi dữ liệu vào phiên repo | Chạy trong workspace tạm |

Bóng vàng vẫn cộng 400 lực, **không bảo đảm ghi bàn**. Các khoảng 6–9, 31–98 và 100–999 xu được mở rộng vào các bậc tương ứng để bao phủ quà chưa được brief ban đầu quy định rõ. Các số này cần được đánh giá khi thử chơi.

## 5. Hàng đợi và giới hạn quá tải

`src/gameEventQueue.js` là FIFO có tối đa **4096 sự kiện đang chờ**, xử lý tối đa **100 sự kiện mỗi tick**, dành **512 chỗ cho quà**.

- Chỉ gộp lượt tim liền nhau của cùng người và cập nhật mắt xem liền nhau; không đẩy tim vượt lên trước comment vào đội.
- Cooldown dùng thời điểm sự kiện đến, tránh biến thời gian nằm chờ thành thời gian hồi chiêu.
- Reset xóa queue; sự kiện thuộc trận cũ không được áp dụng cho trận mới.
- `/api/status.game.queue` công bố pending, processed, peak, coalesced, dropped và droppedGifts.
- Khi queue đầy, sự kiện vượt trần bị từ chối và admin nhận cảnh báo có giới hạn tần suất.

**Giới hạn cần biết:** dữ liệu quà vẫn được bridge ghi nhận, nhưng hiệu ứng và điểm donate trong game của sự kiện bị queue từ chối không được áp dụng. Đã kiểm thử 100 quà dồn không mất xu; chưa có bảo đảm không mất hiệu ứng ở mọi mức tải.

## 6. Quản trị và giao diện

### Xác thực

- Server bind cố định `127.0.0.1`; `HOST=0.0.0.0` trong `.env` cũ không mở server ra LAN.
- `/admin` chuyển tới `/login/` khi chưa đăng nhập.
- Dùng `ADMIN_TOKEN` nếu có; nếu chưa cấu hình, server sinh mã và lưu ở `data/admin-token.txt`. Mã không được đưa vào URL hoặc báo cáo này.
- Cookie phiên có HttpOnly, SameSite=Strict, hạn 12 giờ. Đăng xuất thu hồi phiên và ngắt socket dùng phiên đó.
- Có giới hạn thử đăng nhập theo địa chỉ; token được so sánh thông qua hash với `timingSafeEqual`.
- Mọi lệnh `admin:*` cần quyền hợp lệ. Kết nối khai báo vai trò admin nhưng thiếu/sai token hoặc phiên sẽ bị từ chối.
- `POST /api/reset` cần cookie hoặc header `Authorization: Bearer ...`.
- Origin được kiểm tra cho HTTP và kết nối socket. Mặc định cho origin local; có thể thêm origin phát triển bằng `ALLOWED_ORIGINS`.
- Luồng `admin:*` được phát vào phòng socket quản trị. `/game`, các API đọc và dữ liệu snapshot dành cho client vẫn không yêu cầu đăng nhập.

Đây là phạm vi bảo vệ đã triển khai và kiểm thử, chưa phải kiểm toán bảo mật đầy đủ hay cấu hình triển khai Internet.

### Giao diện

- Canvas **1080×1920**, tự co theo khung 9:16.
- Hiển thị tỉ số, đồng hồ phase, bóng/thanh kéo co, lực hai đội, số người, tăng tốc từ tim, thời gian đóng băng còn lại, top 3 donate và sự kiện gần nhất.
- Có thông báo GOAL, BÙ GIỜ ×2 và màn kết quả thắng/hòa. Kết quả nằm trong snapshot nên tải lại trang ở phase RESULT vẫn hiển thị được.
- Admin có nút mở game, bắt đầu ngay, ép CR7/M10 ghi bàn, reset trận và đăng xuất.
- Đây vẫn là hình khối/canvas. Chưa có cầu thủ 3D, hoạt ảnh sút/đánh đầu, âm thanh hoặc hiệu ứng điện ảnh cho từng món quà.

## 7. Danh sách file

### File được thêm trong phần triển khai

| File | Vai trò |
|---|---|
| `src/gameConfig.js` | Luật, đội và thông số điều chỉnh |
| `src/gameEngine.js` | Trạng thái và logic trận, tách khỏi socket |
| `src/gameEventQueue.js` | FIFO có giới hạn và thống kê tải |
| `src/adminAuth.js` | Token, cookie, kiểm tra origin và quyền admin |
| `public/game/index.html`, `public/game/game.js` | Màn hình game canvas |
| `public/login/index.html`, `public/login/login.js` | Đăng nhập quản trị |
| `tests/gameEngine.test.js` | Kiểm thử luật và các mốc thời gian |
| `tests/gameEventQueue.test.js` | Kiểm thử thứ tự, tải, cooldown và trận cũ |
| `tests/server.test.js` | Chạy server thật trong môi trường tạm để kiểm thử auth và tích hợp |
| `tests/testWorkspace.js`, `tests/runSmokeTest.js` | Tạo/dọn workspace và chạy smoke test cô lập |
| `result.md` | Báo cáo này |

### File được cập nhật

- `src/server.js`: nối engine/queue, phát trạng thái, bảo vệ admin, cấu hình bind/CORS, reset và điều khiển trận.
- `public/admin/index.html`, `admin.js`, `admin.css`: phiên đăng nhập, đăng xuất và nút điều khiển trận.
- `package.json`: nối smoke test cô lập và các test mới vào `npm test`.
- `.env.example`: hướng dẫn `ADMIN_TOKEN`, `ALLOWED_ORIGINS` và chế độ local.
- `.gitignore`: bỏ qua dữ liệu runtime, mã quản trị, workspace kiểm thử và file không cần commit.
- `README.md`: cách chạy, đăng nhập, sự kiện game, API có xác thực và bộ kiểm thử.
- `BRIEF-live-tiktok-game-engine.md`, `QUYTRINH-live-bong-da-cr7-vs-m10.md`: tài liệu người dùng cung cấp đã được cập nhật theo code và tiến độ hiện tại.

`.env` không được sửa. Smoke test gốc được giữ nguyên, chạy qua wrapper. Các lần test sau khi có wrapper đã được kiểm tra bằng hash để xác nhận `data/session.json` của repo chính không đổi; trước khi có wrapper, smoke test gốc chạy trực tiếp và tự ghi/reset dữ liệu như hành vi vốn có.

## 8. Kết quả kiểm thử và mức độ xác nhận

Kết quả dưới đây là các lượt kiểm thử đã thực hiện trong phiên triển khai ngày 07/11/2026. Khi tạo báo cáo chỉ đối chiếu lại code/tài liệu, không chạy lại toàn bộ test.

| Kiểm tra | Kết quả và phạm vi |
|---|---|
| Cài dependency | Thành công; không thêm dependency cho tính năng mới |
| Smoke test cũ | 9/9 qua |
| Test mới bằng Node | Runner báo 25/25 qua: 14 test engine, 4 test queue, 6 subtest tích hợp và 1 test cha tích hợp |
| Server thật | Khởi động được; bind local; đăng nhập, cookie, từ chối lệnh trái phép, logout, bearer token và origin được kiểm thử |
| Quà/queue | 100 quà dồn, tổng donate, combo trùng, thứ tự chat/quà và kết nối lại đều qua test |
| Trình duyệt | Đăng nhập, nút bắt đầu/ép bàn/Test Tải, mở game và F5 hoạt động; không ghi nhận lỗi JavaScript trong lượt QA |
| Giao diện | Đã chụp và xem ảnh login, admin, game và màn kết quả 9:16 |
| Chu kỳ thời gian | Có test mốc chính xác 180s/200s, bù giờ kể cả cách biệt lớn, reset trận và điểm ×2 |
| Trận chạy thời gian thực | Đã chạy bản ban đầu với 15 bot: có 3 bàn và sang trận mới. Lượt này diễn ra trước thay đổi sang bù giờ cố định; chưa lặp lại một trận 200s thời gian thực với toàn bộ bản cập nhật cuối |
| Dữ liệu phiên | Các test cô lập giữ nguyên hash phiên live chính |
| Chất lượng diff | `git diff --check` và kiểm tra cú pháp các file JavaScript đã qua |

Các lỗi cụ thể đã phát hiện và sửa:

- Bot mất đội khi sang trận mới: thêm gán đội lại khi Test Tải còn bật.
- Combo Hoa Hồng x10 bị chọn nhầm bậc kỹ năng nếu dùng tổng xu để phân loại: dùng đơn giá chọn bậc, `deltaCoins` cộng phần mới.
- Sai số số thực ở mốc 180 giây khiến còn hiện 00:01: giới hạn bước tick theo phase và dùng ngưỡng sai số thời gian.
- Quà dồn một phe có thể chiếm hết chỗ xung lực: chia dung lượng cho từng đội.
- Đóng băng có thể mất tác dụng khi lực thô quá cao: chặn trần lực trước rồi mới nhân ×0,3.
- Lệnh điều khiển trước đây phát thêm `game:state` ngay lập tức: chuyển broadcast trạng thái về vòng tick để giữ giới hạn 10 lần/giây.

## 9. Các điểm cần bên nhận xét tập trung

1. **Cân bằng lực:** lực nền 8/người, comment +1, quà +100/+150/+400 và trần 1500 đang là số thử nghiệm. Cần đánh giá tác dụng của người tham gia so với mức chi quà, đặc biệt hai đội ngang người.
2. **Cách gom combo và giới hạn theo sự kiện:** chống trùng tổng xu đã có, nhưng lực cơ bản bị chặn theo từng sự kiện. Cùng một tổng xu được bridge chia thành nhiều delta nhỏ hoặc một delta lớn có thể tạo lực khác nhau; cần đánh giá có nên chuẩn hóa theo chuỗi/thời gian.
3. **Người rời phòng:** engine giữ đội theo trận và hiện chưa giảm lực nền khi nhận `live:member_leave`. Cần quyết định lực nền theo người đã tham gia hay theo người đang hoạt động.
4. **Hành vi khi quá tải:** queue có thể từ chối cả quà khi hết chỗ dành cho quà. Có cần cơ chế lưu bù điểm donate hoặc xử lý kỹ năng theo lô để giảm chênh lệch với thống kê bridge?
5. **Người chưa chọn đội và quà ngoài thời gian đá:** cần xem cách xử lý hiện tại có rõ ràng cho người xem và streamer hay không.
6. **AI ở phòng ít người:** đã kiểm tra bóng có di chuyển và AI tắt đúng ngưỡng; chưa đánh giá mức hấp dẫn của chuyển động hoặc xác suất ghi bàn trong phòng trống.
7. **Phạm vi xác thực:** API đọc/snapshot vẫn công khai ở server local; trạng thái đăng nhập không bảo vệ mọi dữ liệu. Cần đánh giá lại trước mọi kế hoạch mở tunnel hoặc triển khai mạng.
8. **Khôi phục sau lỗi:** F5 được đồng bộ, nhưng restart server không khôi phục trận. Cần quyết định có cần lưu game state và cách xử lý mất kết nối TikTok.
9. **Hiệu năng thực tế:** chưa đo FPS/độ trễ trong OBS, chưa có kiểm thử live 1–2 giờ; các test hiện tại chưa đủ để kết luận sẵn sàng phát lâu dài.

Các điểm trên là vấn đề cần đánh giá tiếp, không được coi là đã giải quyết chỉ vì test hiện tại xanh.

## 10. Cách chạy để đánh giá

```bash
npm install
npm test
npm start
```

1. Mở `http://localhost:3000/admin/`.
2. Đăng nhập bằng `ADMIN_TOKEN` đã cấu hình, hoặc mở file local `data/admin-token.txt` để lấy mã được tạo khi server khởi động.
3. Mở `http://localhost:3000/game/` ở tab khác. Khi thử OBS, dùng Browser Source 1080×1920.
4. Bật Test Tải 15 bot để xem trận. Khi thử người dùng cụ thể, gửi comment chọn đội trước, rồi gửi quà/tim với cùng `userId`.
5. Thử nút bắt đầu, ép bàn, reset trận; tải lại trang game và kiểm tra tỉ số/đội còn đồng bộ.
6. Xem `/api/status` để kiểm tra queue. Không gửi kèm `.env`, file token hoặc dữ liệu phiên khi chia sẻ báo cáo/code.

## 11. Phần chưa triển khai

- Model/rig/animation Ronaldo/Messi và tích hợp Three.js. Repo hiện chưa có các asset này hoặc các file được quy trình tham chiếu như `quytrinh.md`, `demo-messi/rigged.html`.
- Âm thanh, BLV/TTS tiếng Việt, hàng đợi âm thanh, hiệu ứng ăn mừng và kỹ năng hoàn chỉnh.
- Đo hiệu năng trong OBS, tăng tải có hệ thống, thử TikTok Live thật, tinh chỉnh cân bằng dựa trên người xem.
- Kịch bản vận hành dài hạn, khôi phục lỗi, lưu trận qua restart và các chỉ số giữ chân người xem.
- Rà soát điều kiện/chính sách LIVE và quyền sử dụng tài sản trước khi phát hành; đợt triển khai này không kiểm chứng các nội dung đó.

Tài liệu liên quan: [README](README.md), [brief hiện tại](BRIEF-live-tiktok-game-engine.md), [quy trình và tiến độ](QUYTRINH-live-bong-da-cr7-vs-m10.md).
