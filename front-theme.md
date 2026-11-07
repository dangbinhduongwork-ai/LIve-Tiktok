# Front-theme: giao diện game "CR7 vs M10" (neon hologram, sân ngang)

> Tài liệu thiết kế giao diện. Dùng cùng `BRIEF-live-tiktok-giao-dien-3d.md` (brief làm việc cho Codex). Khi hai file mâu thuẫn, file này quyết định về **hình thức**, brief quyết định về **cách làm kỹ thuật**.
> Các lựa chọn đã chốt với người dùng: sân ngang ở giữa màn hình, phong cách neon hologram như ảnh tham chiếu, nhân vật to ở góc cộng cầu thủ nhỏ trên sân, camera cố định có chuyển động nhẹ.
> Mọi toạ độ pixel dưới đây là **ước lượng khởi điểm** trên khung 1080×1920, để trong biến cấu hình dễ chỉnh. Vùng an toàn của giao diện TikTok chưa được kiểm tra trên điện thoại thật.

## 1. Ý tưởng hình ảnh

Một sân bóng "hologram" phát sáng trong sân vận động tối, nhìn xiên từ trên xuống như ảnh tham chiếu: vạch sân neon, lưới sàn mờ, khán đài là các dải LED nhấp nháy theo nhịp tương tác, bóng có vệt sáng. **Hai ngôi sao đứng to ở hai góc phía gần camera** (như poster), còn **cầu thủ nhỏ chạy trên sân** theo diễn biến trận. Bảng điều khiển dạng kính mờ nổi (lấy cảm hứng từ các panel trong ảnh) dùng để hiển thị top donator và thông tin, không hiển thị chữ code.

Phần không lấy từ ảnh tham chiếu: các đoạn mã HTML/code trong panel, nút "START/EDIT", biểu đồ chung chung. Thay bằng nội dung game thật.

## 2. Bố cục màn hình 1080×1920

```
y=0    ┌─────────────────────────────┐
       │  vùng trên (TikTok che):    │  0-150  chỉ trang trí (đèn, trần sân)
y=150  ├─────────────────────────────┤
       │  BẢNG TỈ SỐ + ĐỒNG HỒ       │  150-340
y=340  ├─────────────────────────────┤
       │  THANH LỰC (kéo co)         │  340-430
y=440  ├─────────────────────────────┤
       │                             │
       │   SÂN NGANG (phối cảnh)     │  440-1090
       │  [KT CR7]   (o)   [KT M10]  │  khung thành trái/phải
       │  cầu thủ nhỏ chạy trên sân  │
       │ ┌CR7 to┐            ┌M10 to┐│  nhân vật to ở 2 góc gần camera
y=1100 ├─────────────────────────────┤
       │ GÕ 7 = CR7 · GÕ 10 = M10    │  1110-1190  luôn hiển thị
y=1200 ├─────────────────────────────┤
       │ dòng sự kiện / banner quà   │  1200-1310
y=1320 ├──────────────┬──────────────┤
       │ TOP DONATOR  │ TOP DONATOR │  1320-1500
       │ CR7 (top 3)  │ M10 (top 3) │
y=1520 ├──────────────┴──────────────┤
       │ vùng dưới (TikTok che):     │  1520-1920 chỉ trang trí (khán đài)
       └─────────────────────────────┘
```

- CR7 luôn ở **bên trái**, M10 luôn ở **bên phải**, ở mọi thành phần (tỉ số, thanh lực, top donator, khung thành, nhân vật).
- Hai cạnh phải màn hình cũng có thể bị nút của TikTok che: chừa khoảng 140px bên phải cho thông tin quan trọng (ước lượng).
- Khung thành và bóng không được bị nhân vật to che.

## 3. Sân bóng

- Sân nằm ngang trong dải khoảng y=440 đến 1090, rộng khoảng 900px (x ≈ 90–990), nhìn xiên từ trên xuống: cạnh xa hơi hẹp, cạnh gần hơi rộng. Chừa lề hai bên để nhân vật to đứng cạnh góc sân mà không đè lên khung thành.
- Khung thành **trái là của CR7** (CR7 phòng thủ bên trái, tấn công sang phải), **phải là của M10**. Bóng chạy theo trục ngang: `ballPos = −1000` ở khung thành CR7 (bên trái), `+1000` ở khung thành M10 (bên phải).
- Vạch sân neon trắng-cyan: đường biên, vòng tròn giữa sân, vạch giữa, vòng cấm, chấm phạt đền. Sàn có lưới mờ.
- Nửa sân CR7 phát sáng sắc **đỏ-cam**, nửa sân M10 phát sáng **xanh dương**, chồng nhẹ vào nhau ở giữa. Khi một đội đang chiếm thế, nửa sân nó sáng hơn một chút.
- Khán đài hai bên và phía xa là dải LED, **chiều cao dải LED tăng theo nhịp tương tác** (số comment và tim trong vài giây gần nhất).

## 4. Nhân vật

### 4.1. Hai ngôi sao (to, ở góc gần camera)
- **CR7: góc dưới-trái của sân**, đứng ngoài biên gần khung thành CR7. **M10: góc dưới-phải**, gần khung thành M10.
- Cỡ khoảng 25% chiều cao canvas (≈ 480px). Hơi xoay 3/4 hướng vào trung tâm sân, nhìn về phía bóng.
- Không đứng trong khung thành hay vùng bóng đang chạy; có thể chồng nhẹ lên lề sân.
- Dùng hệ thống nhân vật "thả file là chạy" ở mục 6 của brief (`createCharacter(teamId)`, cấu hình trong `characters.config.js`). Chưa có model thật thì dùng nhân vật tạm.

| Trạng thái | CR7 | M10 |
|---|---|---|
| Chờ (`WAITING`) | Đứng khởi động, giãn người | Đứng bình tĩnh, nhìn đối thủ |
| Đang đá, đội mình đang thắng thế | Cổ vũ, vung nắm đấm | Cổ vũ, vỗ tay nhịp |
| Đang đá, đội mình đang bị ép | Căng thẳng, nhìn bóng | Căng thẳng, nhìn bóng |
| Đội mình ghi bàn | Chạy ra rồi nhảy xoay người, dang tay hô "SIUUU" (theo ý tưởng gốc) | Giơ hai ngón tay lên trời, nâng tay cao (theo ý tưởng gốc) |
| Đội mình bị thủng lưới | Cúi đầu, thả tay | Cúi đầu, thả tay |
| Bị đóng băng | Đứng cứng, phủ băng | Đứng cứng, phủ băng |
| Kết quả: thắng | Ăn mừng lớn, pháo hoa | Nâng cúp (hiệu ứng cúp), pháo hoa |
| Kết quả: thua | Cúi đầu | Cúi đầu |

Các clip chưa có thì dùng quy tắc "clip gần nhất" của brief. Việc có clip "SIUUU" hay nâng cúp trong Mixamo **chưa được xác nhận**.

### 4.2. Cầu thủ nhỏ (trên sân)
- Mỗi đội 3 cầu thủ nhỏ (đặt trong config), màu áo đội, số áo trên lưng, cỡ khoảng 90–120px.
- Chạy và đẩy bóng theo hướng đội đang thắng thế: tốc độ chạy theo lực đội, lùi khi bị ép, ăn mừng nhỏ khi ghi bàn, đứng chết khi bị đóng băng.
- Dựng đơn giản (khối, hoặc chibi); là hàm riêng `createMiniPlayer(teamId, index)`, dùng cùng cơ chế thay model: thả file mini vào thư mục nếu muốn.
- Số lượng và độ phức tạp phải rẻ để giữ FPS trong OBS.

### 4.3. Bóng
- Một bóng chính chạy ngang sân theo `ballPos`, có vệt sáng đuôi theo hướng chạy.
- Bóng nhỏ của comment (`smallBalls`) bay vệt sáng theo màu đội về phía khung thành đối thủ (giống các quả bóng có vệt trong ảnh tham chiếu).

## 5. Màu và chữ

| Vai trò | Gợi ý khởi điểm |
|---|---|
| Nền sân vận động | xanh đen đậm `#050b1a` |
| CR7 | đỏ `#ff3b3b`, ánh cam `#ff7a45`, trắng `#fff1f2` |
| M10 | xanh `#2f7bff`, ánh cyan `#4fd1ff`, trắng `#eff6ff` |
| Vạch sân neon | cyan-trắng `#9ff4ff` |
| Chữ nhấn / vàng bóng vàng | `#ffd54a` |
| Panel kính | nền tối trong suốt, viền sáng mảnh màu đội |

- Màu hai đội phải lấy từ `src/gameConfig.js` (`teams[*].color`, `lightColor`), không viết cứng.
- Chữ: font condensed đậm kiểu bản tin bóng đá cho tỉ số và tiêu đề; font rõ cho tên người dùng. **Font tự host**, không tải từ CDN.
- Tỉ số và đồng hồ phải đọc được trên điện thoại nhỏ: tỉ số tối thiểu cỡ chữ khoảng 120px, đồng hồ khoảng 70px.
- Tránh nhiều lớp blur nặng (backdrop-filter) trên toàn màn hình; chưa kiểm chứng hiệu năng trong OBS.

## 6. Các thành phần giao diện

1. **Bảng tỉ số** (y 150–340): logo/số áo hai đội hai bên, tỉ số lớn ở giữa, đồng hồ dưới tỉ số, nhãn phase (`CHỜ`, `HIỆP`, `BÙ GIỜ ×2`, `KẾT THÚC`).
2. **Thanh lực** (y 340–430): thanh ngang dài, nửa trái đỏ nửa phải xanh, chỉ báo là vị trí bóng; bên dưới hiện mức tăng tốc từ tim của mỗi đội và vòng đếm ngược khi bị đóng băng.
3. **Hướng dẫn tham gia** (y 1110–1190): "GÕ **7** = CR7 · GÕ **10** = M10", lấy từ `teams[*].keywords`. Luôn hiển thị, tránh bị che.
4. **Dòng sự kiện và banner quà** (y 1200–1310): vào đội, quà, ghi bàn; banner lớn cho quà lớn.
5. **Top donator** (y 1320–1500): hai panel kính, mỗi đội top 3 với avatar, tên, số xu; có hiệu ứng khi đổi hạng. Avatar lỗi thì dùng ảnh dự phòng.
6. **Số người mỗi đội** nhỏ gọn ở bảng tỉ số.
7. **Màn kết quả:** panel lớn ở giữa sân, tên đội thắng, tỉ số, top donator của đội thắng.

## 7. Hiệu ứng theo sự kiện

Gắn với `game:event` (xem brief mục 3 để biết bảng đầy đủ). Mô tả hình thức:

| Sự kiện | Hiệu ứng |
|---|---|
| `team_join` | Avatar bay từ giữa màn hình về góc đội, dòng chào ngắn |
| `gift_skill` cơ bản | Số điểm lực bay lên, vệt bóng nhanh hơn |
| `gift_skill` tuyệt kỹ | Sóng xung kích trên sân, banner tên người tặng |
| `gift_skill` bóng vàng | Quả bóng vàng từ trên rơi xuống, ánh sáng toả |
| `freeze` | Lớp băng phủ nửa sân đối thủ, vòng đếm ngược 10 giây |
| `goal` | Chữ GOAL lớn, rung camera nhẹ, pháo hoa, nhân vật ngôi sao ăn mừng, bóng về giữa |
| `overtime` | Banner "BÙ GIỜ ×2" quét ngang, đèn khán đài đổi nhịp |
| `result` | Màn kết quả, ngôi sao đội thắng ăn mừng |

## 8. Camera

- Cố định, góc nhìn xiên trên xuống, khung giống ảnh tham chiếu nhưng **không phải** góc nhìn quá rộng làm sân nhỏ trên màn dọc.
- Chuyển động nhẹ: rung ngắn khi có bàn thắng, đẩy sát nhẹ (zoom vài phần trăm) khi bóng vào gần khung thành rồi trả lại, hơi trôi chậm để sân không đứng im.
- Không bám theo bóng, để HUD và vị trí nhân vật không bị lệch.

## 9. Hiệu năng và dự phòng

- Hiệu ứng "phát sáng" ưu tiên dùng vật liệu phát sáng và sprite cộng sáng (additive), hạn chế hậu kỳ bloom toàn màn hình, vì có thể nặng trong OBS.
- Chế độ chất lượng thấp qua `?quality=low`: bớt hạt, bớt LED khán đài, tắt rung và đẩy camera, tắt bóng đổ.
- Hạt, bóng nhỏ, số bay dùng pool đối tượng. Không tạo mới mỗi sự kiện.
- Nếu nhân vật hoặc font lỗi: dùng nhân vật tạm và font hệ thống, game không được trắng màn hình.

## 10. Điều chưa chắc và cần người dùng xác nhận khi thử

1. **Vùng an toàn TikTok** (trên, dưới, phải) là ước lượng; cần chụp thử trên điện thoại thật khi live.
2. Hiệu năng của sân phối cảnh, LED khán đài và hai ngôi sao cộng 6 cầu thủ nhỏ trong OBS chưa được đo.
3. Hai ngôi sao đứng ở **góc gần camera** có thể che một phần sân trên màn nhỏ; có thể phải lùi vị trí hoặc thu nhỏ sau khi thử.
4. Clip "SIUUU" của CR7 và nâng cúp của M10 phụ thuộc kho Mixamo; mình chưa xác nhận có sẵn.
5. Dùng tên và hình người thật là quyết định của người dùng; rủi ro bản quyền và quyền hình ảnh đã được nêu ở `QUYTRINH-live-bong-da-cr7-vs-m10.md`.
