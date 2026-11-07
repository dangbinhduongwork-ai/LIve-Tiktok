# Game Live TikTok "CR7 vs M10": đánh giá và quy trình

Nguồn ban đầu: 4 ảnh ý tưởng và repo https://github.com/dangbinhduongwork-ai/LIve-Tiktok. **Cập nhật 07/11/2026:** đã cài thư viện, chạy test và server; đã có game hình khối, xác thực admin và hàng đợi sự kiện. [Brief hiện tại](BRIEF-live-tiktok-game-engine.md) ghi chi tiết luật và giới hạn triển khai.

## Tiến độ hiện tại

| Giai đoạn | Trạng thái trong repo |
|---|---|
| 0. Luật/số liệu | Đã có cấu hình thử nghiệm, tên Ronaldo/Messi và AI nền đã được chọn; chính sách LIVE chưa được kiểm chứng trong đợt code này |
| 1. Chạy repo/bảo mật | Đã có bind local, đăng nhập token/cookie, chặn socket admin và reset trái phép, test trên server thật |
| 2. Logic server | Đã có phase, luật quà/tim/chat, queue có trần, cooldown, giới hạn lực và test dồn 100 quà |
| 3. Hình khối | Đã có canvas 9:16, tỉ số, timer, lực/bóng, top 3, kết quả trận, đồng bộ khi mở lại trang |
| 4. 3D | Chờ model và clip animation; chưa có `quytrinh.md`, `demo-messi/rigged.html` hoặc asset 3D trong repo này |
| 5. Âm thanh/hiệu ứng | Chưa có kho âm thanh, TTS local hay hàng đợi âm thanh |
| 6. Thử tải/live | Đã thử cục bộ và 15 bot; còn đo FPS trong OBS, tải lớn hơn và thử live thật 1–2 giờ |
| 7–8. Phát/đo/cải tiến | Chưa thực hiện |

Luật hiện hành: chờ 5s → đá 150s → **bù giờ cố định 30s**, bàn thắng ×2 → kết quả 15s. Đóng băng **10s** với lực đối thủ ×0,3. Bản brief trước từng dùng 6s và bù giờ có điều kiện; hai thông số đó đã được thay theo yêu cầu cập nhật quy trình.

## 1. Ý tưởng mình hiểu

- Hai đội đối đầu trên màn dọc 9:16: Đỏ-Trắng (CR7) và Xanh-Trắng (M10), ở giữa là thanh kéo co năng lượng và quả bóng.
- Mỗi trận 3 phút. Bình luận "7/CR7" hoặc "10/M10" để vào đội, mỗi comment bắn 1 bóng nhỏ đẩy về phía đối thủ. Thả tim làm nhân vật nhanh hơn. Quà tặng tạo hiệu ứng lớn (sút, nhảy đánh đầu, bóng vàng, đóng băng đối thủ 10 giây).
- Phút 02:30–03:00 là "bù giờ ×2", hết giờ có màn ăn mừng và vinh danh đại gia.
- Yếu tố gây nghiện: bình luận viên, tiếng "SIUUU", bảng top donator hai bên.

Chiều bóng đang triển khai: đội CR7 đẩy về khung thành M10, đội M10 đẩy về khung thành CR7. Một người chọn đội bằng từ khóa một lần trong mỗi trận.

## 2. Đánh giá ý tưởng

**Điểm mạnh**
- Cơ chế dễ hiểu trong 3 giây. Người xem mới chỉ cần gõ "7" hoặc "10".
- Vòng lặp 3 phút ngắn, có cao trào (bù giờ) và kết thúc rõ (ăn mừng). Hợp với việc người xem ra vào liên tục.
- Có cả hạng miễn phí (comment, tim) lẫn trả phí (quà). Hai phe đối đầu tự sinh ra kích động giữa fan.
- Bảng top donator hai bên khai thác đúng tâm lý "avatar của mình to hơn".

**Rủi ro và điểm yếu (xếp theo mức nghiêm trọng)**

1. **Hình ảnh người thật và bản quyền.** Dùng tên, hình dáng Ronaldo/Messi, tiếng "SIUUU", giọng bình luận viên có thể vi phạm quyền hình ảnh, nhãn hiệu, hoặc bản quyền âm thanh, dẫn tới kênh bị gỡ nội dung. Mình không phải luật sư và chưa tra chính sách TikTok. Hướng an toàn hơn: nhân vật hoạt hình tự tạo (áo số 7 đỏ, số 10 xanh), âm thanh tự thu hoặc tạo, không dùng clip BLV thật. Bạn cần tự kiểm tra trước khi phát.
2. **Phòng live ít người thì game "chết".** Kênh mới có thể chỉ 0–20 người xem. Nếu bóng chỉ chạy theo tương tác thật, trận sẽ đứng yên. Cần **đội AI nền** tự đẩy nhẹ để luôn có kịch tính, và luật cân bằng chạy tốt từ 1 người.
3. **Spam bình luận làm hỏng cân bằng.** "Mỗi comment bắn 1 bóng" cho phép 1 người gõ liên tục. Cần giới hạn mỗi người (ví dụ 1 bóng/2 giây), giới hạn tổng số bóng trên màn, và quy tắc đội theo `userId` (một người không đổi đội giữa trận).
4. **Trả tiền là thắng.** Một quà 1000+ xu đóng băng đối thủ 10 giây có thể quyết định cả trận. Fan phe thua sẽ nản. Nên có trần lực đẩy, thời gian hồi chiêu, và cơ chế gỡ thế (phe đang thua nhận hiệu ứng nhẹ).
5. **Bảng giá trị chưa khớp.** Ảnh ghi "Hoa hồng 1–5 xu = +20 đến +100 điểm" nhưng bình luận chỉ +1 điểm. Tỉ lệ quà so với comment cần tính lại bằng số liệu thử.
6. **Quy tắc quà thưởng.** Game cho quà tạo kết quả trận đấu có thể chạm chính sách của TikTok về quà tặng, cờ bạc hoặc mô tả hứa hẹn kết quả. Mình chưa kiểm tra chính sách này, bạn cần đọc điều khoản LIVE hiện hành trước khi mở bán.
7. **Phần 3D nặng.** Model cầu thủ như model Meshy bạn dùng có khoảng 200 nghìn đỉnh và texture 4K. Hai nhân vật cộng hiệu ứng trong OBS Browser Source có thể làm tụt FPS khi live. Cần giảm xuống khoảng 20–50 nghìn đỉnh, texture 1–2K.

## 3. Đánh giá repo LIve-Tiktok

**Điểm tốt**
- Tách sạch **tầng nhận dữ liệu** khỏi **game**: TikTok/Admin → `tiktokHandler` → `stateManager` → Socket.IO (`live:gift`, `live:chat`, `live:like`, `live:viewer_count`, `live:session_reset`). Game chỉ cần `socket.on(...)`.
- **Chống cộng trùng combo quà** bằng `deltaCoins` theo từng chuỗi `userId + giftId + groupId`. Đây là phần khó nhất và đã làm sẵn.
- Có **bộ giả lập** ở `/admin` (quà, chat, tim, 15 bot tự động) nên phát triển game không cần live thật.
- Có lưu phiên (`data/session.json`), xuất CSV, `npm test`, và README viết sẵn cho AI IDE.

**Vấn đề cần xử lý**
1. **Game đã có bản hình khối.** `src/gameEngine.js`, `src/gameConfig.js` và `public/game/` đã triển khai. Cần đánh giá nhịp chơi bằng người xem thật trước khi chốt cân bằng.
2. **Đã bổ sung bảo mật admin.** Server bind cố định `127.0.0.1`, CORS theo danh sách origin, `/admin` cần đăng nhập và mọi lệnh `admin:*`/`POST /api/reset` cần quyền quản trị. Mã được cấu hình bằng `ADMIN_TOKEN` hoặc tạo tại `data/admin-token.txt`. `/game` và các API đọc vẫn công khai trong server local. Đây là phạm vi xác thực đã kiểm thử, không phải chứng nhận kiểm toán toàn hệ thống.
3. **Phụ thuộc thư viện không chính thức:** `tiktok-live-connector` đọc luồng webcast không qua API chính thức, và cần khoá Euler Stream (`SIGN_API_KEY`) để tránh bị giới hạn. TikTok đổi giao thức là kết nối có thể hỏng bất ngờ. Cần phương án dự phòng (bot giả lập hoặc kết nối lại, và thông báo cho người xem).
4. **Chưa kiểm chứng với live thật.** Combo chống trùng và danh sách "online/offline" (suy ra từ số mắt xem) mình chưa kiểm tra thực tế. Phải test trên một phòng live thật trước khi tin.
5. **Tài liệu đã được đồng bộ:** README dùng tên thư mục repo thay đường dẫn máy riêng; brief mô tả luật, đăng nhập và queue hiện hành.

## 4. Ghép repo trong thư viện (REPOS.md)

| Phần việc | Repo / công cụ | Vì sao |
|---|---|---|
| Nhận dữ liệu TikTok Live, giả lập admin | **LIve-Tiktok của bạn** (chưa có trong REPOS.md) | Đã làm sẵn bridge Socket.IO và chống trùng combo quà |
| Cấu trúc code game (trạng thái trận, sự kiện dồn) | **Habrador/Unity-Programming-Patterns** | Dùng ý tưởng: *State* (chờ → đá → bù giờ → kết thúc), *Event Queue* (100 quà cùng lúc không làm đơ), *Object Pool* (bóng nhỏ), *Observer*. Code là C#, nhưng khái niệm áp dụng được cho JavaScript |
| Vẽ nhân vật 3D trên web | **CloudAI-X/threejs-skills** | Kiến thức Three.js mới, code Claude viết ra đúng phiên bản |
| Model, rig, animation | Quy trình bạn đã làm: [quytrinh.md](quytrinh.md), `demo-messi/rigged.html` | Đã chạy được Meshy → Mixamo → Three.js |
| Sửa model (giảm đỉnh, đổi áo) | **ahujasid/mcp-for-blender** | Điều khiển Blender bằng lời, xuất GLB/FBX |
| Giao diện HUD, thanh kéo co | **Leonxlnx/taste-skill**, **pbakaus/impeccable** | Giao diện có gu thay vì kiểu AI chung chung |
| Hiệu ứng chuyển động (thanh năng lượng, số bay) | **greensock/gsap-skills** | Dạy agent dùng GSAP đúng cách |
| Giọng BLV tiếng Việt | **debpalash/VoiceStudio**, **howznguyen/shorts-kit** (có giọng VieNeu-TTS tiếng Việt, chạy offline) | Tạo câu lồng tiếng chạy local. **Không nhân bản giọng người thật** |
| Kiểm tra bảo mật server | **cloudflare/security-audit-skill** | Rà lỗi như admin không xác thực |
| Kéo người xem vào live bằng clip ngắn | **howznguyen/shorts-kit**, **harry0703/MoneyPrinterTurbo** | Làm clip dọc TikTok từ khoảnh khắc ghi bàn |
| Quy trình làm game từ ý tưởng | **Donchitos/Claude-Code-Game-Studios** | Có template GDD, sprint plan nếu muốn làm bài bản |

**Chưa có trong thư viện (gợi ý ngoài, mình chưa kiểm tra lại):**
- Thư viện 2D/3D game cho web như Phaser, PixiJS (nếu không muốn tự vẽ canvas thuần), hoặc dùng thẳng Three.js như đã làm.
- Kho âm thanh miễn phí bản quyền (tiếng khán giả, còi, bàn thắng).
- Animation bóng đá trên Mixamo (đá bóng, ăn mừng, thủ môn): bạn cần tự tìm từ khoá `soccer`, `kick`, `celebrate`, mình chưa xác nhận kho có đủ.

**Không cần:** `unity-mcp`, `GameAnalytics SDK` (Unity). Server của bạn là Node, và OBS nhúng trang web trực tiếp, nên làm game bằng web (Three.js) đơn giản hơn nhiều so với Unity.

## 5. Quy trình làm

### Giai đoạn 0: Chốt luật và số liệu (làm trên giấy, ½ ngày)
- Quyết định **nhân vật**: người thật hay hoạt hình tự tạo (mục 2.1).
- Viết bảng cân bằng. Ví dụ: lực đẩy mỗi comment, trần mỗi người, mỗi quà, thời gian hồi chiêu, mức bù cho phe thua, và số bóng tối đa trên màn.
- Xác định **đội AI nền** để trận luôn có chuyển động khi ít người.
- Đọc điều khoản quà/LIVE của TikTok (mục 2.6).
- **Xong khi:** có 1 trang luật và bảng số mà bạn chốt được.

### Giai đoạn 1: Chạy repo và vá bảo mật (½–1 ngày)

**Đã triển khai và có test tự động.** Mở `/admin` sẽ đi tới trang đăng nhập khi chưa có phiên. `npm test` chạy trên workspace tạm để không ghi đè phiên live thật.
- `npm install`, `npm test`, `npm start`, mở `/admin` bấm giả lập quà, chat, tim.
- Bind `127.0.0.1`, thêm token cho `/admin` và các sự kiện admin trên socket, hạn chế `POST /api/reset`.
- **Xong khi:** test chạy qua, và kết nối admin không có token bị từ chối.

### Giai đoạn 2: Logic game phía server (1–2 ngày)

**Đã triển khai.** Queue 4096 sự kiện, tối đa 100 sự kiện/tick, dành 512 chỗ cho quà. Khi đầy, bộ đếm từ chối tăng trong `/api/status` và admin nhận cảnh báo; bridge vẫn ghi nhận quà nhưng phần game có thể bỏ hiệu ứng/điểm donate của sự kiện vượt trần.
- Tạo `src/gameEngine.js` (theo hướng dẫn ở README mục 9): máy trạng thái *chờ → đá → bù giờ → kết thúc → chờ*, tick khoảng 20 lần/giây, giữ vị trí bóng và lực hai phe.
- Quy đổi: bình luận "7/CR7/10/M10" → gán đội theo `userId`; tim → tăng tốc; quà → hiệu ứng theo bảng bậc xu.
- Giới hạn tốc độ mỗi người và tổng, hàng đợi sự kiện (Event Queue).
- Phát trạng thái xuống client qua Socket.IO (`game:state`), client chỉ vẽ.
- Viết test: bơm sự kiện giả lập, kiểm tra điểm, bù giờ, kết thúc.
- **Xong khi:** chạy 15 bot Auto Traffic mà trận vẫn chạy đúng, có kết quả thắng/hòa.

### Giai đoạn 3: Giao diện tạm bằng hình khối (1 ngày)

**Đã có bản chạy được.** Trang admin có nút bắt đầu, ép ghi bàn và reset trận. Đánh giá độ vui và cân bằng vẫn cần người dùng thử trực tiếp.
- `public/game/` 1080×1920 (xem mẫu ở README mục 7): thanh kéo co, tỉ số, đồng hồ, top donator, bóng.
- Chưa vẽ nhân vật 3D, dùng hình tròn/hình chữ nhật để kiểm tra nhịp chơi trước.
- **Xong khi:** xem được toàn trận trên `/game` và thấy luật có vui hay không.

### Giai đoạn 4: Nhân vật 3D và animation (2–4 ngày)
- Theo [quytrinh.md](quytrinh.md): model → Mixamo → tải clip (Idle, Run, Kick, Celebrate, Defeated, Jump) → Three.js.
- Giảm đỉnh (khoảng 20–50 nghìn) và texture (1–2K) trước khi đưa vào.
- Nối **trạng thái trận → animation** (state machine): đang đá = Run/Kick, ghi bàn = Celebrate, thua = Defeated.
- **Xong khi:** hai nhân vật chạy mượt (mục tiêu FPS ổn định trong OBS), animation đúng với sự kiện.

### Giai đoạn 5: Âm thanh và hiệu ứng (1–2 ngày)
- Còi, khán giả, tiếng bàn thắng, câu lồng tiếng BLV tiếng Việt (TTS chạy local).
- Hàng đợi âm thanh để các câu không chồng lên nhau khi có nhiều sự kiện.
- Hiệu ứng pháo hoa, bóng vàng, thanh bù giờ (GSAP).
- **Xong khi:** một trận đầy đủ nghe và xem có nhịp, không bị chồng tiếng.

### Giai đoạn 6: Thử tải và thử live thật (1–2 ngày)
- Chạy 15 bot rồi tăng dần, đo FPS và độ trễ.
- Thử trên một phòng live thật (kể cả khi chỉ có bạn và vài người) để kiểm tra combo quà, tên đội, đếm người xem.
- Tinh chỉnh bảng cân bằng theo kết quả.
- **Xong khi:** 1–2 giờ live thử không lỗi, không có trận nào "kẹt" hay thắng quá dễ.

### Giai đoạn 7: Chuẩn bị phát (½ ngày)
- OBS Browser Source `http://localhost:3000/game` 1080×1920, đẩy vào công cụ phát của TikTok (kiểm tra tài khoản đủ điều kiện live).
- Có kịch bản lỗi: mất kết nối TikTok, trận kẹt, nút reset phiên bằng token.
- Lưu log phiên và CSV quà để rút kinh nghiệm.

### Giai đoạn 8: Phát, đo và cải tiến (liên tục)
- Cắt clip ngắn các khoảnh khắc ghi bàn để kéo người vào live.
- Chỉ số cần theo dõi: thời gian xem trung bình, số comment mỗi phút, số quà mỗi giờ, tỉ lệ người ở lại sau trận.
- Chỉnh luật theo số liệu thật.

## 6. Quyết định đã dùng và phần còn cần đầu vào

1. Đã chọn Ronaldo/Messi, màu đỏ-trắng và xanh-trắng; model/animation cụ thể chưa có trong repo.
2. Đã bật AI nền, giảm theo số mắt xem và tắt từ 30 người.
3. Bảng giá trị quà và giới hạn đang ở `src/gameConfig.js`, dùng thông số thử nghiệm trong brief. Bậc quà dựa trên đơn giá, điểm donate luôn dùng `deltaCoins`.
4. Cần model có rig, các clip Idle/Run/Kick/Celebrate/Defeated/Jump, âm thanh/TTS local và tài khoản/phòng live để làm các bước tiếp theo.

## 7. Bước tiếp theo

Chạy `npm start`, dùng mã trong `data/admin-token.txt` (hoặc `ADMIN_TOKEN` đã cấu hình) để đăng nhập `/admin`, bật Test Tải và mở `/game`. Thử nhịp chơi, chốt cân bằng rồi đưa model/animation vào giai đoạn 4. Tiếp tục chuẩn bị âm thanh ở giai đoạn 5 và thử nghiệm OBS/live thật ở giai đoạn 6.
