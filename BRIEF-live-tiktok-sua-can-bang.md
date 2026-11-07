# Brief: sửa cân bằng và 4 lỗi luật cho game CR7 vs M10 (repo LIve-Tiktok)

> File này viết cho Codex ở dự án thật. Đọc hết trước khi làm. Người dùng nói tiếng Việt: trả lời tiếng Việt, ngắn gọn.
> Đây là đợt **sau** `result.md` của bạn. Không đụng giao diện, 3D hay âm thanh (có brief riêng, làm sau đợt này).

## 1. Vì sao phải sửa

Mình (Claude) đã đọc `src/gameConfig.js` và `src/gameEngine.js` và thấy các vấn đề sau. Hãy tự kiểm chứng trước khi sửa, đừng tin mù.

1. **Lực nền theo đầu người lấn át mọi thứ.** Mỗi người đã chọn đội cho `playerBaseForce = 8` liên tục, nhân `ballUnitsPerForceSecond = 1,5` = ~12 đơn vị/giây. Một comment chỉ cho +1 lực trong 1 giây (~1,5 đơn vị), mỗi người tối đa 1 lần/2 giây. Vậy việc gõ "7" một lần có tác dụng lớn hơn spam comment. Sân dài 1000: chênh 10 người = ~120 đơn vị/giây, bóng vào lưới sau ~8 giây. Phòng đông mà lệch đội sẽ có bàn liên tục.
2. **Quà từ người chưa chọn đội vô tác dụng:** `handleGift` trả `false` nếu `userId` chưa có đội, và không ghi vào bảng donate game.
3. **AI nền đo sai:** `aiScale` tính theo `viewerCount` (người xem), không theo số người đã vào đội. 25 người xem mà chưa ai chọn đội thì AI chỉ còn ~17%, bóng gần như đứng yên.
4. **Quà bị từ chối không báo gì:** quà ≥1000 xu bị bỏ khi đội đã dùng đóng băng hoặc còn ≤20 giây, nhưng không phát sự kiện nào; người tặng không thấy phản hồi.
5. **Người rời phòng vẫn giữ lực nền** (bạn đã tự nêu ở `result.md` mục 9.3).

## 2. Việc cần làm

### 2.1. Chuẩn hoá lực theo tỉ lệ thay vì cộng tuyến tính (chính)
Mục tiêu: kết quả phụ thuộc **tỉ lệ lực hai đội**, không phụ thuộc quy mô phòng, để phòng 10 người và phòng 1000 người đều cho nhịp trận hợp lý.

Hướng đề xuất (được phép đề xuất công thức tốt hơn nếu giải thích):

- Tính "điểm lực" mỗi đội: `F = lực nền theo số người hoạt động + xung lực comment + xung lực quà` (có hệ số tim, comeback, đóng băng như cũ).
- Vận tốc bóng: `v = maxSpeed × (F_a − F_b) / (F_a + F_b + K)`.
  - `K` là hằng số làm phòng ít hoạt động chạy chậm.
  - `maxSpeed` khởi điểm khoảng 60 đơn vị/giây khi một đội áp đảo hoàn toàn.
- Lực nền của một người nhỏ hơn comment: yêu cầu **một người spam đúng cooldown tạo ra ≥ 2× lực nền của chính người đó**. Khởi điểm gợi ý (đơn vị lực trước chuẩn hoá): có mặt 1, comment 3 kéo 2 giây, quà cơ bản 5 mỗi xu (trần 25), tuyệt kỹ 40, bóng vàng 120.
- Giữ nguyên các giới hạn đã có (cooldown, trần số xung lực, đóng băng một lần/trận).

Tất cả hằng số đặt trong `src/gameConfig.js`.

### 2.2. Quà từ người chưa chọn đội
Thêm `config.unassignedGift.policy` với 3 giá trị:
- `auto_balance` (**mặc định đề xuất**): tự gán người đó vào **đội đang ít người hoạt động hơn**, phát `team_join` với cờ `viaGift: true`, rồi áp dụng quà bình thường.
- `hash`: gán đội theo hàm băm `userId` (ổn định giữa các trận).
- `ignore`: như hiện tại (bỏ qua nhưng **vẫn ghi vào bảng donate** để không mất dữ liệu).

Người dùng chưa chốt chính sách này, nên cứ đặt mặc định như trên và nói rõ trong báo cáo để họ đổi.

### 2.3. AI nền theo người đã vào đội
`aiScale = clamp(1 − soNguoiHoatDong / aiFullPlayers, 0, 1)`, `aiFullPlayers` khởi điểm 12 trong config. Không dùng `viewerCount` cho AI. Khi không ai chọn đội, AI chạy đầy đủ để bóng vẫn di chuyển.

### 2.4. Phản hồi khi quà bị từ chối
Phát `game:event` `{ type: 'gift_rejected', reason: 'freeze_used' | 'freeze_locked' | 'cooldown_skill' | 'cooldown_golden', team, user, giftName, deltaCoins }`. Vẫn ghi `deltaCoins` vào bảng donate như hiện tại. Không cần UI mới, chỉ phát sự kiện (giao diện sẽ dùng sau).

### 2.5. Người rời phòng
- Xử lý `live:member_leave` và dùng **cửa sổ hoạt động**: một người chỉ tính vào lực nền và số người đội nếu có tương tác (chat, tim, quà, `member_join`) trong `activeWindowSeconds` (khởi điểm 120 giây) và chưa bị đánh dấu rời.
- Người rời vẫn giữ đội và điểm donate; quay lại thì được tính lại.
- Lưu ý: tín hiệu `member_leave` của bridge được suy ra từ số mắt xem nên không chính xác. Vì vậy ưu tiên cửa sổ hoạt động.

## 3. Kiểm tra bằng mô phỏng (bắt buộc)

Thêm `tests/balanceSim.js` chạy engine không cần socket (RNG và đồng hồ giả), in bảng kết quả. Mô phỏng ít nhất:

| Kịch bản | Mô tả |
|---|---|
| Quy mô | 2, 10, 100, 500 người hoạt động |
| Phân bố | 50/50 và 60/40 |
| Hành vi | mỗi người comment đúng cooldown; một nhóm nhỏ thả tim; vài quà ngẫu nhiên các bậc |
| Phòng trống | 0 người chọn đội (chỉ AI) |

Cho mỗi kịch bản chạy nhiều trận (ví dụ 20 hạt giống RNG) rồi báo: số bàn trung bình/180 giây, thời gian giữa hai bàn (nhỏ nhất, trung vị), tỉ lệ trận thắng của đội đông hơn.

**Tiêu chí đạt (khởi điểm, báo lại nếu thấy không hợp lý):**
- 50/50: 2–8 bàn mỗi 180 giây, thời gian giữa hai bàn ≥ 8 giây ở mọi quy mô.
- 60/40: đội đông hơn thắng nhiều hơn nhưng không áp đảo gần 100%, không có "bàn liên tục" (≤ 15 bàn/180 giây).
- Phòng trống: bóng vẫn di chuyển, có ít nhất 1 bàn trong nhiều trận nhưng không phải trận nào cũng nhiều bàn.
- Spam comment: một người spam đúng cooldown tạo tác động rõ hơn người chỉ ngồi im.

## 4. Test và ràng buộc

- Cập nhật hoặc thêm test trong `tests/gameEngine.test.js` cho 2.2 đến 2.5, không làm hỏng test cũ. `npm test` phải xanh.
- Chỉ sửa trong `src/gameConfig.js`, `src/gameEngine.js` (và nhánh nối trong `src/server.js` nếu cần xử lý `member_leave`), cùng test.
- Không đổi hợp đồng sự kiện `game:state` hiện có theo hướng làm hỏng client; chỉ **thêm** trường hoặc loại sự kiện.
- Không thêm dependency. Không đụng `.env`, `data/`.

## 5. Báo cáo khi xong

Gồm: file đã sửa, kết quả `npm test`, **bảng kết quả mô phỏng**, công thức cuối cùng và các hằng số đã chọn, chỗ nào bạn lệch khỏi đề xuất và vì sao, và những điểm chưa chắc.
