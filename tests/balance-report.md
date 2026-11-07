# Báo cáo sửa luật và cân bằng CR7 vs M10

Ngày kiểm tra: 07/11/2026. Yêu cầu: `BRIEF-live-tiktok-sua-can-bang.md`.

Đã triển khai công thức vận tốc theo tỉ lệ và các sửa luật trong brief. `npm test` đạt **9/9 smoke test và 41/41 test Node**. Tuy nhiên, **chưa đạt toàn bộ mục tiêu nhịp trận**: thế 50/50 còn quá ít bàn; đội đông hơn thắng 100% trong mẫu 60/40 ở quy mô 10 và 500 người. Đây là kết quả cần xem xét tiếp về thiết kế luật, không phải kết luận game đã cân bằng hoàn chỉnh.

## 1. File thay đổi trong đợt này

| File | Nội dung |
|---|---|
| `src/gameConfig.js` | Thông số lực, vận tốc, cửa sổ hoạt động, chính sách quà chưa chọn đội, AI |
| `src/gameEngine.js` | Chuẩn hóa vận tốc; nhận quà chưa có đội; báo quà bị chặn; theo dõi hoạt động/rời phòng; sửa gộp xung lực |
| `src/server.js` | Đưa `member_join`, `member_leave` vào hàng đợi game; truyền thời điểm nhận tương tác cho engine |
| `tests/gameEngine.test.js` | Cập nhật kỳ vọng lực mới; bổ sung test chính sách quà, cooldown, hoạt động, AI, vận tốc và tải comment |
| `tests/gameEventQueue.test.js` | Kiểm tra thứ tự và thời điểm gốc của sự kiện vào/rời phòng |
| `tests/server.test.js` | Kiểm tra qua server/socket thật: rời/quay lại, auto-balance, `gift_rejected`, bảo toàn donate |
| `tests/balanceSim.js` | Mô phỏng engine với RNG có seed và đồng hồ giả, in bảng và đánh dấu tiêu chí chưa đạt |
| `tests/balance-report.md` | Báo cáo này |

Không thêm dependency, không sửa UI/3D/âm thanh. Đã đối chiếu SHA-256: `.env` và các file trong `data/` giữ nguyên. Các thay đổi có sẵn ở file khác trong working tree không thuộc đợt này. `result.md` vẫn là báo cáo của đợt trước.

## 2. Công thức và thông số cuối cùng

```text
active = chưa bị đánh dấu rời AND thời gian từ tương tác cuối < 120 giây
aiScale = clamp(1 - activeJoined / 12, 0, 1)

F_raw(team) = activeCount(team) × 1 + tổng lực comment/quà đang còn hạn + AI(team)
F_boosted = F_raw × (1 + likeBoost) × comebackMultiplier
F(team) = min(F_boosted, 1500) × freezeMultiplier

v = 60 × (F_cr7 - F_m10) / (F_cr7 + F_m10 + 8)
ballPos += v × dt
```

Comeback nhân 1,15 khi đội bị ép quá mốc 400 về phía khung thành mình; bình thường nhân 1. Đóng băng nhân 0,3; bình thường nhân 1. Vận tốc bị chặn theo độ lớn bởi 60 đơn vị/giây. Khung thành vẫn ở ±1000.

| Tham số | Giá trị |
|---|---|
| `movement.maxSpeed`, `movement.damping` | 60; 8 |
| `playerBaseForce`, `activeWindowSeconds` | 1; 120 giây |
| Comment | Lực 3; tồn tại 2 giây; cooldown 2 giây/người |
| Quà cơ bản | 5 lực/xu mới; tối đa 25 lực/lần |
| Tuyệt kỹ | Quà đơn giá ≥10 xu; lực 40; cooldown 3 giây/người |
| Bóng vàng | Quà đơn giá ≥99 xu; lực 120; cooldown 60 giây/đội |
| Thời gian xung lực quà | 1 giây, giữ như trước |
| Đóng băng | Quà đơn giá ≥1000 xu; lực đối thủ ×0,3 trong 10 giây; 1 lần/đội/trận; khóa khi tổng thời gian còn lại ≤20 giây |
| AI | `fullPlayers: 12`, `baseForce: 6`, `variation: 6`, `decisionSeconds: 40` |
| Tim | +0,001/tim; trần +25%; giảm 0,02/giây |
| Trần xung lực | 512 bản ghi tổng, chia hạn mức cho hai đội; lực hiệu dụng tối đa 1500/đội trước đóng băng |
| Thời gian trận | 150 giây chính +30 giây hiệp phụ; nghỉ sau bàn 3 giây; bàn hiệp phụ tính 2 điểm |

Mỗi đợt AI lấy lực ngẫu nhiên trong [0,12] cho mỗi đội, nhân `aiScale`, và giữ trong 40 giây bóng đang chạy. AI tắt khi đủ 12 người hoạt động. `viewerCount` vẫn được gửi cho client, nhưng không quyết định AI.

## 3. Các luật đã sửa

### Quà chưa chọn đội

Mặc định **`unassignedGift.policy = 'auto_balance'`**. Người tặng được đưa vào đội có ít người hoạt động hơn, phát `team_join` với `viaGift: true`, sau đó xử lý quà. Nếu hai đội bằng người, dùng hash `userId` để chọn đội.

Hai lựa chọn khác trong config:

- `hash`: FNV-1a trên `userId`, ổn định qua các trận, không phụ thuộc RNG hoặc số người.
- `ignore`: không tạo đội/hiệu ứng, vẫn lưu toàn bộ xu vào `engine.unassignedDonations`. State có tổng xu, số người và top 3 chưa chọn đội. Khi người đó chọn đội bằng chat, xu được chuyển sang đội đúng một lần, không cộng lại hiệu ứng quà cũ.

Chính sách áp dụng khi người tặng chưa có đội; người đã có đội tiếp tục giữ đội trong trận. Donate game vẫn có phạm vi một trận và reset cùng trận như trước.

### Quà bị chặn

Phát `game:event` với `type: 'gift_rejected'`, đủ `team`, `user`, `giftName`, `deltaCoins`, và một trong bốn `reason`:

- `freeze_used`: đội đã dùng đóng băng.
- `freeze_locked`: còn tối đa 20 giây của trận, gồm cả hiệp phụ bắt buộc.
- `cooldown_skill`: tuyệt kỹ của người tặng còn cooldown.
- `cooldown_golden`: bóng vàng của đội còn cooldown.

Xu vẫn được ghi trước khi kiểm tra các giới hạn. Quà trong WAITING/RESULT vẫn chỉ ghi donate như trước. UI chưa xử lý thông báo mới trong đợt này.

### Hoạt động và rời phòng

Chat bất kỳ, tim hợp lệ, quà hợp lệ và `member_join` làm mới hoạt động của người đã chọn đội. Comment sai đội hoặc còn cooldown vẫn chứng minh người đó đang hoạt động, nhưng không đổi đội hoặc tạo thêm lực comment.

`member_leave` loại người đó khỏi số người hoạt động và lực nền; không xóa đội/donate. Tương tác tiếp theo hoặc `member_join` đưa họ trở lại. Bản thân `member_join` chưa tự chọn đội cho khán giả mới. Khi không nhận được tín hiệu rời, cửa sổ 120 giây vẫn tự loại người im lặng. Thời điểm hoạt động dùng thời điểm sự kiện đến hàng đợi, không phải thời điểm xử lý trễ; sự kiện cũ không ghi đè trạng thái rời/hoạt động mới hơn.

Các xung lực đã phát vẫn hết hạn theo thời gian riêng; việc rời phòng loại lực nền, không thu hồi quà/comment đã thực hiện.

### Tương thích state

Giữ các trường state hiện có. `teams.*.count` nay là số người hoạt động đúng yêu cầu. Bổ sung:

- `teams.*.joinedCount`: tổng người đã chọn đội trong trận, kể cả đang không hoạt động.
- `activeJoined`: tổng người hoạt động của cả hai đội.
- `unassignedDonations: { count, totalCoins, top3 }`: donate chưa gán đội ở chế độ `ignore`.

Không đổi sự kiện `live:*` cũ; nhánh game dùng thêm các sự kiện bridge đã có.

## 4. Mô phỏng và kết quả

Chạy lại bằng:

```sh
npm test
node tests/balanceSim.js
# Có thể tăng số trận/kịch bản:
node tests/balanceSim.js 100
```

Kết quả dưới đây dùng **20 seed/kịch bản, 9 kịch bản = 180 lượt mô phỏng**, mỗi lượt 180 giây, bước 50 ms. Không dùng socket hoặc đồng hồ thực. RNG của hành vi và engine tách riêng để số lần vẽ bóng nhỏ không làm đổi lịch quà.

- Tất cả người tham gia comment mỗi 2 giây, thời điểm bắt đầu lệch nhau ngẫu nhiên.
- Chọn ngẫu nhiên khoảng 10% người thả 10 tim mỗi 2 giây; tối thiểu 1 người nếu phòng có người chơi.
- Thử gửi 18 quà/trận: 8 cơ bản, 5 tuyệt kỹ, 4 bóng vàng, 1 đóng băng. Thứ tự bậc quà, thời điểm và người tặng đều dùng RNG. Cooldown và khóa cuối trận có thể từ chối một số quà.
- Đảo đội đông hơn giữa CR7/M10 theo seed; người tặng lấy đều từ tập người chơi, nên đội đông có nhiều cơ hội nhận quà hơn.
- Phòng AI có 25 mắt xem và 0 người chọn đội, để kiểm chứng mắt xem không làm tắt AI.
- **2 người không thể chia đúng 60/40**: làm tròn thành 1/1 và để tỷ lệ thắng đội đông là N/A; hai hàng này dùng cùng hành vi.

| Người | Tỉ lệ yêu cầu (thực tế) | Bàn TB/180s | Bàn tối đa | Giữa bàn min / trung vị (s) | Đội đông thắng | Đội ít thắng | Hòa | Trận có bàn |
|---:|---|---:|---:|---|---:|---:|---:|---:|
| 0 | AI (0/0) | 0,70 | 3 | 34,25 / 45,33 | N/A | N/A | 50% | 50% |
| 2 | 50/50 (1/1) | 0,25 | 1 | N/A | N/A | N/A | 75% | 25% |
| 2 | 60/40 (1/1) | 0,25 | 1 | N/A | N/A | N/A | 75% | 25% |
| 10 | 50/50 (5/5) | 0,00 | 0 | N/A | N/A | N/A | 100% | 0% |
| 10 | 60/40 (6/4) | 1,00 | 1 | N/A | 100% | 0% | 0% | 100% |
| 100 | 50/50 (50/50) | 0,00 | 0 | N/A | N/A | N/A | 100% | 0% |
| 100 | 60/40 (60/40) | 1,30 | 2 | 53,65 / 71,93 | 80% | 0% | 20% | 80% |
| 500 | 50/50 (250/250) | 0,00 | 0 | N/A | N/A | N/A | 100% | 0% |
| 500 | 60/40 (300/200) | 1,00 | 1 | N/A | 100% | 0% | 0% | 100% |

Số bàn là số sự kiện `goal`, không phải tổng điểm đã nhân đôi ở hiệp phụ. Min/trung vị gộp các khoảng giữa hai bàn liên tiếp trong cùng trận, không tính từ giao bóng đến bàn đầu tiên. N/A nghĩa là không có trận nào đủ hai bàn hoặc không có đội đông hơn; không có nghĩa khoảng cách bằng 0. Tỷ lệ thắng dùng toàn bộ 20 trận làm mẫu số, có tính trận hòa.

So sánh riêng 1 người comment với chính người đó ngồi im, đội đối thủ giữ 1 người ngồi im, AI tắt, trong 20 giây: tổng lực tích lũy **3,925 lần**, bóng đi **270 so với 0 đơn vị**. Phần lực riêng của comment bằng 2,925 lần lực nền, đạt yêu cầu ≥2 lần. Chênh lệch nhỏ so với lý thuyết tổng 4 lần đến từ bước cập nhật 50 ms.

## 5. Đạt/chưa đạt và lý do

| Tiêu chí | Kết quả |
|---|---|
| Comment rõ tác dụng hơn ngồi im | Đạt trong phép đo kiểm soát ở trên |
| Không tăng vận tốc tuyến tính theo số người | Đạt; kiểm tra quy mô 20/200/500 và trần vận tốc khi dồn quà |
| Không có khoảng giữa hai bàn <8 giây | Không quan sát thấy; nhiều kịch bản không đủ hai bàn để đo |
| 60/40 không quá 15 bàn/trận | Đạt trong tất cả lượt mô phỏng |
| AI phòng trống di chuyển và có bàn ở nhiều trận | Đạt: bóng di chuyển 20/20 trận, có bàn 10/20; TB 0,70 bàn |
| 50/50 có 2–8 bàn/180 giây ở mọi quy mô | **Chưa đạt ở cả bốn quy mô** |
| 60/40 đội đông thắng nhiều hơn nhưng không gần 100% | **Chưa đạt ở 10 và 500 người**; 100 người đạt theo ngưỡng mô phỏng <95%, nhưng đội ít vẫn chưa thắng trận nào |

Nguyên nhân: khi hai đội có lực bằng nhau, công thức tỉ lệ cho vận tốc bằng 0. Comment đều của cả hai đội gần như triệt tiêu nhau. Ở phòng 500 người, mỗi đội có khoảng 1000 lực nền + comment; một bóng vàng 120 lực chỉ tạo chênh vận tốc khoảng 3,4 đơn vị/giây trong một giây, trong khi từ giữa sân đến khung thành cần 1000 đơn vị. Comeback còn kéo bóng về khi lệch quá 400. Vì vậy chuẩn hóa vận tốc đã giải quyết tốc độ quá nhanh, nhưng **chưa làm tác động quà độc lập với quy mô phòng**.

Đã thử riêng ở 500 người 50/50, 20 seed mỗi biến thể: bỏ damping (`K=0`), hoặc tăng xung quà lên 5/10 giây. Cả ba biến thể vẫn 0 bàn trung bình; không đưa các thông số thử này vào config cuối. Việc chỉ vặn nhẹ K hoặc thời gian quà chưa giải quyết được mục tiêu này.

Mục tiêu 2–8 bàn với hai đội tương tác gần đối xứng cần thêm một quyết định thiết kế: chẳng hạn chuẩn hóa phần lực đám đông và sức quà tương đối theo phòng, hoặc bổ sung cơ chế pha tấn công/dứt điểm. Các thay đổi đó sẽ đổi ý nghĩa quà/độ ngẫu nhiên của kết quả; báo cáo này giữ công thức đề xuất và công khai tiêu chí chưa đạt theo yêu cầu trong brief.

## 6. Khác đề xuất và giới hạn cần biết

- AI thay đổi lực theo đợt 40 giây, biên độ ±6 thay vì lấy ±2 mỗi tick như trước. Lấy ngẫu nhiên mỗi 50 ms làm lực hai phía trung bình gần bằng nhau, không tạo được chuyển động/ghi bàn hữu ích trong phòng trống. Đây là phần mở rộng cần thiết để đáp ứng mục tiêu AI.
- Thêm cách phá hòa bằng hash cho `auto_balance` khi số người hoạt động bằng nhau. `ignore` có sổ donate chưa gán đội riêng để không ép người tặng vào một đội trái chính sách.
- Sửa gộp xung lực: những xung cùng hạn hết lực dùng chung bản ghi. Khi đầy hạn mức mà không có cùng hạn, gộp vào hạn sớm nhất, không kéo dài lực cũ. Giữ trần 512 và trần lực; trường hợp cực đoan quá nhiều hạn riêng có thể rút ngắn lực mới, nhưng không duy trì lực cũ vô hạn. Có test 600 người comment liên tục rồi dừng để kiểm chứng lực hết hạn.
- `member_leave` của bridge có thể suy đoán sai; tương tác mới khôi phục người chơi ngay. Không suy ra người chơi hoạt động từ `viewerCount`; cửa sổ 120 giây xử lý trường hợp thiếu tín hiệu rời.
- 20 seed cho mỗi kịch bản là kiểm tra ban đầu, không phải ước lượng xác suất thắng chính xác ngoài thực tế. Chưa thử LIVE thật; nhịp chat, tim, quà và tỷ lệ chia đội thực tế có thể khác mô hình.
- `npm test` kiểm tra chức năng và hồi quy; kết quả xanh **không đồng nghĩa đạt các mục tiêu cân bằng**. `balanceSim.js` in `UNMET` cho mục tiêu chưa đạt và dùng assertion cho bất biến engine; mã thoát 0 của mô phỏng không phải chứng nhận mọi mục tiêu đều đạt.

## 7. Kiểm thử đã chạy

- `npm test`: exit 0; 9/9 smoke; 41/41 Node test, 0 fail. Bao gồm engine, queue và server Socket.IO/HTTP trong thư mục kiểm thử riêng.
- `node tests/balanceSim.js`: chạy đủ 180 lượt, in bảng trên và các dòng PASS/UNMET; assertion về trạng thái trận, số người hoạt động và tác động comment đều qua.
- `git diff --check`: qua tại thời điểm kiểm tra.
- SHA-256 trước/sau của `.env` và toàn bộ file hiện có trong `data/`: không thay đổi.
