# TIKTOK LIVE DATA CONTROLLER & GAME INTEGRATION HUB

## Bản CR7 vs M10 hiện tại (07/11/2026)

- Game ở `/game`: chờ 5s → thi đấu 150s → bù giờ cố định 30s (bàn thắng ×2) → kết quả 15s → trận mới. Đóng băng kéo dài 10s, lực đối thủ ×0,3.
- Cấu hình luật: `src/gameConfig.js`; logic server: `src/gameEngine.js`; hàng đợi: `src/gameEventQueue.js`.
- `npm start` bind cố định `127.0.0.1`. Mở `/admin` và đăng nhập bằng `ADMIN_TOKEN`, hoặc mã tự sinh trong `data/admin-token.txt`. File mã nằm trong thư mục dữ liệu đã bị Git bỏ qua. Cấu hình `HOST` cũ trong `.env` không mở server ra LAN.
- Cookie quản trị có hạn 12 giờ, HttpOnly/SameSite=Strict. `/game` và API đọc không yêu cầu đăng nhập; `POST /api/reset` và mọi lệnh socket `admin:*` yêu cầu quyền quản trị. Có nút điều khiển trận trên admin.
- `npm test` chạy smoke test và server kiểm thử trong `.test-workspaces/`, tự dọn sau khi xong; không ghi vào phiên live thật trong `data/session.json`.
- Queue xử lý tối đa 100 sự kiện/tick, 4096 sự kiện chờ, dự phòng 512 chỗ cho quà. Nếu đầy, admin nhận cảnh báo và `/api/status.game.queue` tăng `dropped`/`droppedGifts`; bridge vẫn ghi quà nhưng game không áp dụng sự kiện bị từ chối.
- Xem [brief cập nhật](BRIEF-live-tiktok-game-engine.md) và [tiến độ theo quy trình](QUYTRINH-live-bong-da-cr7-vs-m10.md). Model 3D, âm thanh và thử live thật là các bước tiếp theo.

> **Tài liệu Kỹ thuật & Hướng dẫn Tích hợp Game (Dành cho Developer & AI IDE / Coding Agents)**  
> Dự án này là **Hệ thống Tiếp nhận Dữ liệu TikTok Live Thời gian thực & Trung tâm Quản trị Streamer (`/admin`)** được thiết kế tách biệt hoàn toàn khỏi logic game. Bạn (hoặc bất kỳ AI IDE nào) có thể gắn bất kỳ con game nào vào hệ thống này chỉ bằng cách lắng nghe các sự kiện Socket.IO hoặc gọi REST API có sẵn.

---

## MỤC LỤC
1. [Kiến trúc Tổng quan & Luồng Dữ liệu](#1-kiến-trúc-tổng-quan--luồng-dữ-liệu)
2. [Cấu trúc Thư mục Dự án](#2-cấu-trúc-thư-mục-dự-án)
3. [Hướng dẫn Nhúng Game Mới vào Dự án (2 Cách)](#3-hướng-dẫn-nhúng-game-mới-vào-dự-án-2-cách)
4. [Đặc tả Chi tiết Sự kiện Socket.IO (Game Nhận Dữ liệu từ Live & Admin)](#4-đặc-tả-chi-tiết-sự-kiện-socketio-game-nhận-dữ-liệu-từ-live--admin)
5. [Cơ chế Hoạt động của Bộ Giả lập Admin (`/admin`)](#5-cơ-chế-hoạt-động-của-bộ-giả-lập-admin-admin)
6. [Đặc tả REST APIs](#6-đặc-tả-rest-apis)
7. [Code Mẫu Khởi tạo Game (`public/game/`)](#7-code-mẫu-khởi-tạo-game-publicgame)
8. [Hướng dẫn Mở rộng Lệnh Điều khiển Riêng từ Admin sang Game](#8-hướng-dẫn-mở-rộng-lệnh-điều-khiển-riêng-từ-admin-sang-game)
9. [Chỉ dẫn Dành riêng cho AI IDE / Coding Agent](#9-chỉ-dẫn-dành-riêng-cho-ai-ide--coding-agent)

---

## 1. Kiến trúc Tổng quan & Luồng Dữ liệu

Hệ thống hoạt động theo mô hình **Event-Driven Bridge (Cầu nối sự kiện thời gian thực)**. Mọi tương tác từ **Phòng Live TikTok thật** HOẶC từ **Bộ Giả lập trên trang Admin (`/admin`)** đều đi qua cùng một luồng xử lý duy nhất và phát ra các sự kiện chuẩn hóa cho Game:

```text
[ TikTok Live Thật (@username) ] ──┐
                                   ├──► [ tiktokHandler.js ] ──► [ stateManager.js ] ──► [ server.js (Socket.IO) ]
[ Bộ Giả Lập trên Admin (/admin) ] ┘     (Chống trùng combo,      (Lưu người xem, xu,       │
                                          lọc từ bậy, đếm mắt)     tim, chat, bảng quà)      ├──► Phát sự kiện tới GAME (live:gift, live:chat, live:like...)
                                                                                             └──► Cập nhật giao diện ADMIN (/admin)
```

### Điểm mạnh của kiến trúc này:
- **Game không cần phân biệt dữ liệu thật hay giả lập:** Khi bạn bấm nút tặng quà, gửi chat, thả tim hoặc bật "Test Tải (15 Bots)" trên trang `/admin`, dữ liệu phát xuống Game **giống hệt 100%** khi có người xem thật tương tác trên TikTok Live.
- **Đã xử lý sẵn bài toán khó nhất của TikTok Live (Chống cộng trùng Combo Quà):** Trong `src/tiktokHandler.js`, thuật toán tính `deltaCoins = (currentRepeatCount - lastProcessedRepeatCount) * diamondCount` đảm bảo nếu người xem bấm combo liên tiếp 5 bông Hoa Hồng (1 xu), Game sẽ chỉ nhận tổng cộng đúng `5 Xu` (không bị cộng dồn sai thành `1 + 2 + 3 + 4 + 5 = 15 Xu`).
- **Đã lọc sẵn từ ngữ phản cảm:** Tin nhắn bình luận đi qua `src/stateManager.js` đã được cắt gọn và che từ tục tĩu thành `***`.

---

## 2. Cấu trúc Thư mục Dự án

```text
LIve-Tiktok/
├── data/
│   └── session.json          # Tự động lưu danh sách người xem, xu, tim, bảng kê quà
├── public/                   # Thư mục tĩnh được Express phục vụ tự động tại gốc "/"
│   ├── admin/                # Giao diện Bảng điều khiển & Bộ giả lập (/admin)
│   │   ├── index.html
│   │   ├── admin.css
│   │   └── admin.js
│   ├── game/                 # Canvas CR7 vs M10 (truy cập tại /game)
│   └── login/                # Trang đăng nhập quản trị
├── src/
│   ├── server.js             # Server Express + Socket.IO + REST APIs (Cổng mặc định: 3000)
│   ├── tiktokHandler.js      # Kết nối TikTok Live Webcast & xử lý sự kiện gốc
│   ├── stateManager.js       # Quản lý trạng thái người chơi, bảng xếp hạng & kho quà
│   ├── gameConfig.js         # Luật và các giới hạn game
│   ├── gameEngine.js         # Logic trận đấu phía server
│   ├── gameEventQueue.js     # Hàng đợi tương tác có trần
│   └── adminAuth.js          # Token, phiên đăng nhập và bảo vệ socket admin
├── tests/
│   ├── smokeTest.js          # Bộ kiểm thử bridge cũ
│   ├── runSmokeTest.js       # Chạy smoke test trong workspace tạm
│   ├── gameEngine.test.js    # Luật trận
│   ├── gameEventQueue.test.js # Hàng đợi và giới hạn tải
│   └── server.test.js        # Xác thực và tích hợp server thật
├── .env.example              # Mẫu cấu hình biến môi trường
├── package.json              # Khai báo dependencies
└── README.md                 # Tài liệu hướng dẫn này
```

---

## 3. Hướng dẫn Nhúng Game Mới vào Dự án (2 Cách)

### Cách 1: Nhúng Game Web trực tiếp vào thư mục `public/game/` (Khuyên dùng cho HTML5 / Canvas / PixiJS / Phaser / Three.js / React / Vue / Unity WebGL)

Vì `src/server.js` đã cấu hình `app.use(express.static(PUBLIC_DIR))`, mọi file bạn đặt trong `public/game/` sẽ tự động chạy tại địa chỉ:
👉 **`http://localhost:3000/game`**

**Các bước thực hiện:**
1. Đặt file giao diện chính của game tại `public/game/index.html` (cùng các file `.js`, `.css`, hình ảnh, âm thanh của game).
2. Trong `public/game/index.html`, nhúng thư viện Socket.IO Client được cấp sẵn bởi server:
   ```html
   <script src="/socket.io/socket.io.js"></script>
   <script src="game.js"></script>
   ```
3. Trong `public/game/game.js`, khởi tạo kết nối chỉ với 1 dòng:
   ```javascript
   const socket = io();
   ```
4. Mở 2 tab trình duyệt:
   - Tab 1: `http://localhost:3000/admin` (Để kết nối TikTok hoặc bấm nút giả lập Quà / Chat / Tim).
   - Tab 2 (hoặc OBS Browser Source 1080x1920): `http://localhost:3000/game` (Màn hình hiển thị Game).

---

### Cách 2: Kết nối từ Game chạy độc lập bên ngoài (Unity C#, Godot, Cocos, Python/Pygame, hoặc React/Vite chạy cổng khác)

Server cho phép origin local của chính ứng dụng. Nếu game web chạy cổng khác (ví dụ `http://localhost:5173`), thêm origin đó vào `ALLOWED_ORIGINS` trong môi trường chạy. Nếu game chạy ở một phần mềm khác hoặc cổng khác:
1. Kết nối Socket.IO Client tới URL: `http://localhost:3000`
   ```javascript
   import { io } from "socket.io-client";
   const socket = io("http://localhost:3000");
   ```
2. Hoặc gọi các cổng HTTP REST API tại `http://localhost:3000/api/...` nếu game engine không dùng Socket.IO.

---

## 4. Đặc tả Chi tiết Sự kiện Socket.IO (Game Nhận Dữ liệu từ Live & Admin)

Dưới đây là **toàn bộ các sự kiện mà Server phát ra (Server -> Client)**. Code game của bạn chỉ cần dùng `socket.on(eventName, callback)` để nhận dữ liệu:

---

### 4.1. Sự kiện `init_state` (Nhận ngay khi Game vừa kết nối vào Server)
Phát ra 1 lần ngay khi Game kết nối thành công tới Socket.IO, giúp Game khôi phục toàn bộ trạng thái hiện tại của phiên live (không sợ mất dữ liệu khi F5 lại trang game).

```javascript
socket.on('init_state', (state) => {
  console.log('Số mắt xem hiện tại:', state.viewerCount);
  console.log('Danh sách toàn bộ người chơi:', state.allPlayers);
  console.log('Top 5 người donate cao nhất:', state.topPlayers);
});
```

**Cấu trúc JSON của `state`:**
```json
{
  "viewerCount": 125,
  "trafficActive": false,
  "tiktokStatus": {
    "isConnected": true,
    "isConnecting": false,
    "username": "streamer_tiktok",
    "reconnectAttempts": 0,
    "viewerCount": 125
  },
  "allPlayers": [
    {
      "userId": "nguyenvana_01",
      "nickname": "Nguyễn Văn A",
      "avatarUrl": "https://...",
      "coins": 50,
      "likes": 120,
      "chatsCount": 5,
      "lastMessage": "Chào streamer!",
      "createdAt": "2026-11-06T15:00:00.000Z",
      "lastActiveAt": "2026-11-06T15:10:00.000Z"
    }
  ],
  "topPlayers": [ /* Top 5 người chơi có coins cao nhất */ ],
  "giftBreakdown": [ /* Thống kê theo từng loại quà */ ],
  "giftStats": {
    "totalTypes": 2,
    "totalUnits": 10,
    "totalCoins": 50,
    "mostPopular": { "giftName": "Hoa Hồng", "totalCount": 8, "giftPictureUrl": "" },
    "topRevenue": { "giftName": "Nước Hoa", "totalCoins": 40, "giftPictureUrl": "" }
  },
  "giftTransactions": [ /* 50 giao dịch quà gần nhất */ ]
}
```

---

### 4.2. Sự kiện `live:gift` (Khi có khán giả tặng quà trên Live hoặc bấm Giả lập Quà trên Admin)
Đây là sự kiện quan trọng nhất để quy đổi quà tặng thành hiệu ứng trong game (triệu hồi nhân vật, hồi máu, tung kỹ năng, cộng điểm...).

```javascript
socket.on('live:gift', (data) => {
  // CHÚ Ý QUAN TRỌNG:
  // Luôn sử dụng `data.deltaCoins` để cộng điểm/tài nguyên cho lần nhận này,
  // vì `deltaCoins` là số xu CHÊNH LỆCH thực tế mới phát sinh (đã chống trùng combo).
  console.log(`${data.nickname} vừa tặng ${data.giftName} (+${data.deltaCoins} Xu)`);
});
```

**Cấu trúc JSON của `data` (`live:gift`):**
```json
{
  "userId": "nguyenvana_01",
  "nickname": "Nguyễn Văn A",
  "avatarUrl": "https://p16-sign-va.tiktokcdn.com/...",
  "giftId": "5655",
  "giftName": "Hoa Hồng",
  "giftPictureUrl": "https://p16-webcast.tiktokcdn.com/...",
  "diamondCount": 1,          // Đơn giá của 1 món quà (Xu)
  "repeatCount": 5,           // Tổng số lượng trong chuỗi combo hiện tại
  "repeatEnd": true,          // true nếu chuỗi combo đã kết thúc
  "deltaCoins": 5,            // SỐ XU THỰC TẾ CẦN XỬ LÝ TRONG LẦN NÀY (Đã khử trùng lặp!)
  "totalCoins": 25,           // Tổng số xu tích lũy của người chơi này từ đầu phiên
  "isTop1": true,             // true nếu người chơi này đang đứng Top 1 BXH Donate
  "topPlayers": [             // Top 5 người chơi dẫn đầu hiện tại
    {
      "userId": "nguyenvana_01",
      "nickname": "Nguyễn Văn A",
      "avatarUrl": "https://...",
      "coins": 25,
      "likes": 10,
      "chatsCount": 2
    }
  ]
}
```

---

### 4.3. Sự kiện `live:chat` (Khi khán giả bình luận hoặc gửi Chat từ Admin)
Dùng để xử lý lệnh điều khiển bằng comment (ví dụ: comment đáp án, chọn đội `1` hoặc `2`, tạo nhân vật bước vào màn hình, hiện bong bóng chat...).

```javascript
socket.on('live:chat', (data) => {
  console.log(`[Chat] ${data.nickname}: ${data.message}`);
});
```

**Cấu trúc JSON của `data` (`live:chat`):**
```json
{
  "userId": "nguyenvana_01",
  "nickname": "Nguyễn Văn A",
  "avatarUrl": "https://...",
  "message": "Chào streamer và cả phòng live nha!", // Đã lọc từ tục tĩu thành ***
  "coins": 25,                                      // Tổng xu hiện có của người này
  "likes": 10,                                      // Tổng tim đã thả của người này
  "chatsCount": 3,                                  // Tổng số câu đã chat của người này
  "time": "22:30:15"                                // Thời gian định dạng vi-VN
}
```

---

### 4.4. Sự kiện `live:like` (Khi khán giả thả tim hoặc bấm Thả Tim trên Admin)
TikTok gom các lượt chạm màn hình thả tim theo từng cụm (batch) từ 1 đến vài chục tim mỗi sự kiện.

```javascript
socket.on('live:like', (data) => {
  console.log(`${data.nickname} vừa thả +${data.likeCount} tim (Tổng cá nhân: ${data.totalLikes})`);
});
```

**Cấu trúc JSON của `data` (`live:like`):**
```json
{
  "userId": "nguyenvana_01",
  "nickname": "Nguyễn Văn A",
  "avatarUrl": "https://...",
  "likeCount": 15,            // Số lượng tim vừa thả trong đợt này
  "totalLikes": 120,          // Tổng số tim người này đã thả từ đầu buổi live
  "coins": 25                 // Tổng số xu người này đã donate
}
```

---

### 4.5. Sự kiện `live:member_join` & `live:member_leave` (Khi khán giả vào / out phòng Live)
Hệ thống quản lý trạng thái `isOnline` của từng khán giả tương tác:
- Khi khán giả rời phòng live (**out phòng**), chỉ số **KHÁN GIẢ TƯƠNG TÁC (`onlineCount`)** tự động trừ đi `1` (`isOnline: false`), nhưng **toàn bộ số Xu (`coins`) và số Tim (`likes`) người đó đã donate được bảo toàn 100%, tuyệt đối không bị trừ**.
- Nếu người đó quay lại phòng live hoặc tương tác tiếp, hệ thống tự động bật lại `isOnline: true` cùng nguyên vẹn số Xu/Tim cũ.

```javascript
socket.on('live:member_join', (data) => {
  // data = { userId, nickname, avatarUrl, rejoined: true/false, onlineCount: 15, timestamp }
});

socket.on('live:member_leave', (data) => {
  // data = { userId, nickname, avatarUrl, coins: 25, likes: 120, chatsCount: 3, onlineCount: 14, timestamp }
  // Dùng để ẩn nhân vật của người chơi đã out phòng khỏi màn hình mà vẫn giữ nguyên điểm/xu BXH của họ!
});
```

---

### 4.6. Sự kiện `live:viewer_count` (Cập nhật số mắt xem trực tiếp)
```javascript
socket.on('live:viewer_count', (data) => {
  // data = { viewerCount: 158, totalUser: 1420, timestamp: 1794000000000 }
});
```

---

### 4.7. Sự kiện `live:session_reset` (Khi Streamer bấm nút "Reset Phiên Live" trên Admin)
Khi nhận sự kiện này, Game cần xóa sạch nhân vật/điểm số trên màn hình để bắt đầu ván mới hoặc phiên live mới.
```javascript
socket.on('live:session_reset', (data) => {
  // data = { timestamp: 1794000000000 }
  // Thực hiện reset màn hình game về trạng thái ban đầu tại đây
});
```

---

### 4.8. Sự kiện `admin:players_updated` (Cập nhật danh sách toàn bộ người chơi)

Sự kiện này hiện chỉ gửi tới socket quản trị đã xác thực. Game CR7 vs M10 dùng `game:state` để cập nhật đội, lực, bóng và bảng donate; `init_state.game` giúp đồng bộ lại khi tải trang.

Phát tới quản trị viên mỗi khi danh sách người chơi có thay đổi (sau khi donate, chat, thả tim, hoặc khi Streamer cộng `+10 Xu` / xóa người chơi trên bảng Admin).
```javascript
socket.on('admin:players_updated', (allPlayers) => {
  // allPlayers là mảng các Player đã sắp xếp giảm dần theo số coins
});
```

---

### 4.9. Trạng thái và sự kiện game CR7 vs M10

- `game:state`: phát tối đa 10 lần/giây, gồm `matchId`, `phase`, `timeLeft`, `score`, `ballPos`, `fieldLimit`, `forces`, `teams`, `viewerCount`, `goalPauseLeft`, `smallBalls`, `result`.
- Mỗi đội có tên/màu/số áo, `count`, `top3`, `likeBoost`, `frozen`, `freezeLeft`. `result` giữ đội thắng (hoặc `null` nếu hòa) và tỉ số để F5 ở màn kết quả vẫn đồng bộ.
- `game:event`: `team_join`, `gift_skill`, `freeze`, `goal`, `overtime`, `result`. Game hiển thị từ các payload này; luật chạy trong `src/gameEngine.js`.
- `init_state.game`: snapshot trận hiện tại khi kết nối/kết nối lại.

## 5. Cơ chế Hoạt động của Bộ Giả lập Admin (`/admin`)

Khi phát triển hoặc kiểm thử game, bạn **không cần phải phát trực tiếp TikTok thật**. Trang quản trị tại `http://localhost:3000/admin` cung cấp đầy đủ công cụ để bơm dữ liệu vào game:

1. **Giả lập Quà Tặng Chuẩn TikTok Live (19 loại quà thực tế):**
   - Từ quà phổ thông (`Hoa Hồng 1 Xu`, `Kem Ốc Quế 1 Xu`, `Ngón Tay Tim 5 Xu`, `Nước Hoa 20 Xu`, `Bánh Donut 30 Xu`) đến quà Trung/Cao cấp (`Vương Miện 199 Xu`, `Thiên Nga 699 Xu`, `Xe Thể Thao 1000 Xu`, `Pháo Hoa 1088 Xu`, `Cá Voi Bay 2150 Xu`) và Siêu VIP (`Sư Tử TikTok 29999 Xu`, `Vũ Trụ Universe 34999 Xu`).
   - Hỗ trợ chọn **Combo Streak (`x1`, `x5`, `x10`, `x99`)** hoặc tự nhập tên quà + đơn giá xu bất kỳ.
   - Nút **`5 Hoa = 5 Xu`** dùng để test nhanh ca cốt lõi chống cộng trùng combo.
2. **Giả lập Bình luận (Chat) & Thả Tim (Like):**
   - Nhập tên người xem, User ID, nội dung bình luận và bấm **Gửi** -> Game sẽ nhận ngay sự kiện `live:chat`.
   - Bấm các nút `+1`, `+5`, `+20`, `+50`, `+100` tim -> Game sẽ nhận ngay sự kiện `live:like`.
3. **Chế độ Auto Traffic (15 Bots tự động):**
   - Khi bấm **Bật Test Tải**, mỗi 2 giây server chọn một trong 15 bot: 50% thả tim, 28% bình luận, 12% giả lập quà và 10% mô phỏng rời phòng (hoặc thả tim nếu chưa đủ người). Số mắt xem cũng được mô phỏng. Quà là dữ liệu giả lập, không có giao dịch TikTok thật.
   - Riêng game gán bot theo hai đội 9/6, luân phiên phe đông hơn và gán lại ở trận mới. Đây là thiết lập kiểm thử; người xem thật chọn đội bằng comment.
4. **Quản lý Khán giả Trực tiếp:**
   - Trong tab **Khán Giả Tương Tác**, khi bạn bấm nút **`+10 Xu`** hoặc **`Xóa`** một người chơi, Server sẽ cập nhật ngay vào `stateManager` và phát sự kiện `admin:players_updated` xuống cho cả Admin lẫn Game.

---

## 6. Đặc tả REST APIs

Ngoài Socket.IO, Server cung cấp 6 endpoint dữ liệu/điều khiển JSON/CSV:

| Phương thức | Endpoint | Mô tả chi tiết |
| :--- | :--- | :--- |
| `GET` | `/api/status` | Trả về trạng thái server, `uptime`, `viewerCount` (số mắt xem), `playerCount`, `topPlayers` (Top 5), trạng thái kết nối TikTok và tổng quan quà tặng (`giftStats`). |
| `GET` | `/api/players` | Trả về `{ total, players: [...] }` chứa toàn bộ khán giả đã tương tác, sắp xếp giảm dần theo `coins` và `likes`. |
| `GET` | `/api/players/export.csv` | Xuất bảng xếp hạng khán giả ra CSV. |
| `GET` | `/api/gifts` | Trả về `{ stats, breakdown, recentTransactions }` thống kê chi tiết từng loại quà, tỷ trọng % doanh thu, người tặng nhiều nhất (`topDonor`) của từng món quà và 100 giao dịch gần nhất. |
| `GET` | `/api/gifts/export.csv` | Xuất báo cáo tài chính quà tặng ra file `.csv` (chuẩn UTF-8 BOM mở trực tiếp bằng Microsoft Excel không lỗi font tiếng Việt). |
| `POST` | `/api/reset` | Xóa trắng toàn bộ dữ liệu người chơi và quà tặng của phiên hiện tại, đồng thời phát sự kiện `live:session_reset`. |

`POST /api/reset` cần cookie đăng nhập hoặc header `Authorization: Bearer <ADMIN_TOKEN>` và trả HTTP 401 khi thiếu quyền. `POST /auth/login` nhận JSON `{ "token": "..." }`; `POST /auth/logout` thu hồi phiên. Không truyền token trong URL.

Socket từ công cụ quản trị ngoài kết nối bằng `io(url, { auth: { role: 'admin', token: adminToken } })`. Trang `/admin` dùng cookie tự động, còn game chỉ cần `io()`. Các sự kiện `admin:*` từ socket không có quyền đều bị từ chối.

---

## 7. Code Mẫu Khởi tạo Game (`public/game/`)

Để bắt đầu làm một con game mới nhanh nhất, bạn chỉ cần tạo 2 file trong thư mục `public/game/`:

### File 1: `public/game/index.html`
```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TikTok Live Interactive Game</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0f172a;
      color: #f8fafc;
      font-family: sans-serif;
      overflow: hidden;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
    }
    /* Khung chuẩn màn hình dọc TikTok 9:16 (1080x1920 thu nhỏ theo tỷ lệ) */
    #game-container {
      width: 540px;
      height: 960px;
      background: #1e293b;
      position: relative;
      border: 2px solid #334155;
      overflow: hidden;
    }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
  </style>
</head>
<body>
  <div id="game-container">
    <canvas id="gameCanvas" width="1080" height="1920"></canvas>
  </div>

  <!-- Nhúng Socket.IO từ chính Server và file logic Game -->
  <script src="/socket.io/socket.io.js"></script>
  <script src="game.js"></script>
</body>
</html>
```

### File 2: `public/game/game.js`
```javascript
const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Trạng thái trong game
let viewerCount = 0;
let topPlayers = [];
let recentEvents = [];

// 1. Nhận dữ liệu khởi tạo khi mới mở trang Game
socket.on('init_state', (state) => {
  viewerCount = state.viewerCount || 0;
  topPlayers = state.topPlayers || [];
  console.log('[Game] Đã đồng bộ trạng thái ban đầu:', state);
});

// 2. Nhận sự kiện TẶNG QUÀ từ TikTok Live hoặc từ Bộ Giả lập Admin
socket.on('live:gift', (data) => {
  console.log(`[Quà] ${data.nickname} tặng ${data.giftName} (+${data.deltaCoins} Xu)`);
  topPlayers = data.topPlayers || topPlayers;

  // Ví dụ: Phân tầng hiệu ứng trong game theo số xu vừa nhận (data.deltaCoins)
  if (data.deltaCoins >= 1000) {
    spawnUltimateBossOrEffect(data);
  } else if (data.deltaCoins >= 20) {
    spawnSpecialSkill(data);
  } else {
    spawnBasicUnit(data);
  }
});

// 3. Nhận sự kiện BÌNH LUẬN (CHAT)
socket.on('live:chat', (data) => {
  console.log(`[Chat] ${data.nickname}: ${data.message}`);
  addFloatingEvent(`${data.nickname}: ${data.message}`, '#38bdf8');
});

// 4. Nhận sự kiện THẢ TIM (LIKE)
socket.on('live:like', (data) => {
  console.log(`[Tim] ${data.nickname} thả +${data.likeCount} tim`);
  addFloatingEvent(`${data.nickname} +${data.likeCount} Tim`, '#fb7185');
});

// 5. Nhận cập nhật SỐ NGƯỜI XEM LIVE
socket.on('live:viewer_count', (data) => {
  viewerCount = data.viewerCount || 0;
});

// 6. Nhận lệnh RESET PHIÊN LIVE từ Admin
socket.on('live:session_reset', () => {
  topPlayers = [];
  recentEvents = [];
  console.log('[Game] Đã reset toàn bộ ván chơi!');
});

// Các hàm xử lý hiệu ứng mẫu trong Game
function spawnBasicUnit(data) {
  addFloatingEvent(`+${data.deltaCoins} Xu: ${data.nickname} tặng ${data.giftName}`, '#fbbf24');
}

function spawnSpecialSkill(data) {
  addFloatingEvent(`[COMBO] ${data.nickname} tung chiêu ${data.giftName} (+${data.deltaCoins} Xu)!`, '#f59e0b');
}

function spawnUltimateBossOrEffect(data) {
  addFloatingEvent(`[SIÊU VIP] ${data.nickname} triệu hồi ${data.giftName} (+${data.deltaCoins} Xu)!`, '#a855f7');
}

function addFloatingEvent(text, color) {
  recentEvents.unshift({ text, color, time: Date.now() });
  if (recentEvents.length > 10) recentEvents.pop();
}

// Vòng lặp vẽ Game 60FPS
function gameLoop() {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Vẽ thông tin mắt xem
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(`Đang xem: ${viewerCount}`, 50, 70);

  // Vẽ danh sách sự kiện tương tác mới nhất
  ctx.font = 'bold 30px sans-serif';
  recentEvents.forEach((ev, index) => {
    ctx.fillStyle = ev.color;
    ctx.fillText(ev.text, 50, 160 + index * 55);
  });

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
```

---

## 8. Hướng dẫn Mở rộng Lệnh Điều khiển Riêng từ Admin sang Game

Nếu con game của bạn cần thêm các nút điều khiển đặc thù trên trang Admin (ví dụ: nút *"Qua màn mới"*, *"Tăng độ khó"*, *"Triệu hồi Boss"*):

1. **Tại `public/admin/admin.js` (Gửi lệnh lên Server):**
   ```javascript
   socket.emit('admin:custom_command', { action: 'SPAWN_BOSS', level: 5 });
   ```
2. **Tại `src/server.js` (Trong khối `io.on('connection', (socket) => { ... })`, chuyển tiếp lệnh tới Game):**
   ```javascript
   socket.on('admin:custom_command', (payload) => {
     io.emit('game:custom_command', payload);
   });
   ```
3. **Tại `public/game/game.js` (Game lắng nghe và thực thi):**
   ```javascript
   socket.on('game:custom_command', (payload) => {
     if (payload.action === 'SPAWN_BOSS') {
       // Xử lý triệu hồi Boss trong game
     }
   });
   ```

---

## 9. Chỉ dẫn Dành riêng cho AI IDE / Coding Agent

Nếu bạn đang là một **AI Coding Assistant (Cursor, Windsurf, GitHub Copilot, Antigravity, Claude Code...)** được người dùng yêu cầu *"Hãy tạo hoặc gắn một con game mới vào dự án này"*, hãy tuân thủ nghiêm ngặt các quy tắc sau:

1. **KHÔNG ĐƯỢC phá vỡ hoặc xóa các file hệ thống lõi:**
   - Giữ nguyên `src/tiktokHandler.js`, `src/stateManager.js`, và các endpoint/socket event hiện có trong `src/server.js`.
   - Khi gắn game mới, giữ cơ chế đăng nhập và kiểm tra quyền quản trị trong `src/adminAuth.js`, `src/server.js` và `public/admin/`.
2. **Vị trí đặt code Game mới:**
   - Đặt toàn bộ mã nguồn giao diện của game trong thư mục `public/game/` (bắt đầu từ `public/game/index.html`).
   - Nếu game cần lưu trạng thái riêng ở phía server, hãy viết thành module riêng (ví dụ `src/gameEngine.js`) và import vào `src/server.js`.
3. **Quy tắc lắng nghe tương tác TikTok Live trong Game:**
   - Kết nối Socket.IO bằng `const socket = io();`.
   - Lắng nghe `live:gift` và **bắt buộc dùng `data.deltaCoins`** (không dùng `data.diamondCount * data.repeatCount`) để tính điểm/xu nhằm tránh lỗi nhân đôi combo quà.
   - Lắng nghe `live:chat` (`data.message`, `data.nickname`, `data.avatarUrl`, `data.userId`) cho các tương tác bình luận.
   - Lắng nghe `live:like` (`data.likeCount`, `data.totalLikes`) cho tương tác thả tim.
   - Lắng nghe `live:viewer_count` (`data.viewerCount`) cho số người đang xem.
   - Lắng nghe `live:session_reset` để xóa/reset màn chơi khi Streamer bấm nút Reset trên Admin.

---

## Khởi chạy & Kiểm thử

```bash
# 1. Cài đặt thư viện
npm install

# 2. Khởi chạy Server (Mặc định tại cổng 3000)
npm start

# 3. Chạy smoke test, test luật trận, hàng đợi và xác thực server
npm test
```

- **Trang Admin & Bộ giả lập:** [http://localhost:3000/admin](http://localhost:3000/admin)
- **Trang Hiển thị Game (sau khi đặt code vào `public/game/`):** [http://localhost:3000/game](http://localhost:3000/game)

