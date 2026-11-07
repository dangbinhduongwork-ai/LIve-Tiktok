# Báo cáo front-theme — 07/11/2026

Đã triển khai giao diện theo [front-theme.md](../../front-theme.md): sân ngang neon hologram, CR7 bên trái/M10 bên phải, hai ngôi sao lớn và mặc định sáu cầu thủ nhỏ. Giữ nguyên luật và hợp đồng `game:state`/`game:event`.

## Những gì đã đổi

- Sân phối cảnh ngang có vạch neon, lưới nền, ánh sáng hai màu từ snapshot server, khung thành trái/phải và vệt bóng. `ballPos = −1000` ở trái, `+1000` ở phải.
- Hai ngôi sao dùng lớp camera riêng trong cùng canvas Three.js để giữ vị trí tiền cảnh; sáu mini chạy/tiến/lùi theo bóng và lực server. Khi đóng băng, cả vị trí và animation của đội đó dừng lại.
- Nhân vật tạm có khởi động, cổ vũ, cúi đầu, CR7 nhảy/xoay/dang tay với chữ SIUUU, M10 giơ hai tay/chỉ lên trời. Kết quả có hiệu ứng cúp và pháo hoa. Đây là chuyển động code, không phải model/clip người thật hoặc âm thanh.
- Thêm `createMiniPlayer(teamId, index)`, cấu hình `teams.mini` độc lập trong `characters.config.js`. GLB/GLTF/FBX, clip riêng, tự scale và fallback đều dùng chung hệ thống nhân vật. Mini trống không tải model lớn của ngôi sao.
- LED dựng bằng instancing, tăng chiều cao khi có comment/tim rồi giảm dần. Những tương tác này chỉ điều khiển ánh sáng ở client.
- HUD mới: tỉ số 120px, đồng hồ 70px, thanh lực ngang, % tim, vòng đóng băng, hướng dẫn tại y=1110, rail quà/sự kiện y=1205, top donate y=1320. Màn kết quả có tỉ số và top người tặng của đội thắng.
- `low` giảm hạt và LED, tắt shadow cùng rung/trôi/zoom camera. Hiệu ứng dùng emissive/additive và pool; không dùng bloom/backdrop-filter toàn màn hình.

Các tọa độ bố cục, camera, số mini và kích thước ngôi sao nằm trong `view.config.js`. Chọn **420px** cho ngôi sao ở cấu hình đầu thay cho 480px ước lượng để chừa bóng/miệng khung thành trong khung dọc. Có thể chỉnh `stars.height`, `inset`, `floor` sau khi thử trên điện thoại. Font và thư viện tiếp tục tự host.

## Kiểm tra

| Hạng mục | Kết quả |
|---|---|
| `npm test` | 9/9 smoke và 41/41 Node đạt |
| `/game/character-test.html` | 18/18 đạt, gồm thêm model mini độc lập, mini thiếu file và không tự dùng model lớn |
| `tests/theme-checks.js` | 8/8 normal và 8/8 low đạt |
| Khung 390×844 | 8/8 kiểm tra bố cục/theme đạt; có ảnh riêng |
| Chiều sân | Bóng −1000 → 0 → +1000 và chỉ báo thanh lực chạy trái → phải; đội không bị đảo |
| Che khuất | Kiểm tra hình chiếu bóng ở hai đầu/giữa và tâm hai miệng khung thành không nằm dưới ngôi sao tạm khi đang đá |
| Đóng băng | Transform mini/ngôi sao giữ nguyên dù snapshot bóng thay đổi; băng hiện đúng nửa sân |
| LED | Tăng theo comment/tim, giảm khi hết tín hiệu |
| Pool | 80 quà liên tiếp không thêm geometry mới |
| Model trong sân | Ghi đè cấu hình riêng trong browser thử: ngôi sao GLB có rig + 3 mini FBX nạp thành công; đội mini thiếu file dùng fallback |
| Số mini | Ghi đè `perTeam: 2` trong browser thử, nạp lại thành 2 cầu thủ mỗi đội; file config gốc không bị thay bởi phép thử |
| Trận 15 bot | Bật Test Tải qua admin; đủ WAITING → PLAYING → OVERTIME → RESULT → trận mới, không có JavaScript pageerror |
| F5/mất mạng | Match ID/tỉ số khớp sau F5; khi offline vẫn hiện sân/hướng dẫn; socket tự nối lại |
| Font/avatar lỗi | Chặn tải có chủ ý: font hệ thống và avatar dự phòng hoạt động, renderer không lỗi |
| WebGL context | Mất/khôi phục context thành công, khởi tạo lại đủ 2 ngôi sao và 6 mini |
| Kết quả M10/hòa | Tên đội, tỉ số, top donor và cúp đúng; hòa không giữ thông báo thắng/cúp |
| File bảo vệ | Đối chiếu hash: engine, gameConfig, server, `.env`, token và phiên live chính không đổi |

Trận số 2 trong môi trường thử: bắt đầu **13:06:34**, bù giờ **13:09:04**, kết quả **13:09:34**, trận mới **13:09:49** (UTC+7). Mọi thao tác admin chạy trên server sao chép với dữ liệu tạm/cổng riêng. Các cảnh 404 và abort font/avatar là kiểm thử có chủ ý. Không thêm dependency npm, không commit/push ở đợt này.

## Hiệu năng đo được

Windows, **Core i5-13400**, Chrome headless **156.0.8078.80**, WebGL dùng **Intel UHD Graphics 730 / ANGLE D3D11**. Viewport **1080×1920**, pixelRatio **1**, một trang hoạt động; hai ngôi sao + sáu mini tạm, 12 bóng comment, kích hoạt tuyệt kỹ/comment/tim mỗi 1,5 giây. Warm-up 1,5 giây rồi đo 10 giây mỗi mức, 600 frame cuối.

| Mức | FPS trung bình | P95 frame | Draw calls ở cuối lượt | Tam giác |
|---|---:|---:|---:|---:|
| normal | 59,98 | 16,8 ms | 331 | 18.308 |
| low | 59,97 | 16,8 ms | 204 | 11.040 |

Đây là số đo browser với nhân vật tạm, **chưa phải số đo OBS hoặc model Mixamo thật**.

## Ảnh và file

8 ảnh 1080×1920, đã xem lại: [chờ](../../docs/screenshots/front-theme/waiting.png), [đang đá](../../docs/screenshots/front-theme/playing.png), [ghi bàn](../../docs/screenshots/front-theme/goal.png), [bù giờ](../../docs/screenshots/front-theme/overtime.png), [đóng băng](../../docs/screenshots/front-theme/freeze.png), [bóng vàng](../../docs/screenshots/front-theme/golden.png), [kết quả](../../docs/screenshots/front-theme/result.png), [phòng trống](../../docs/screenshots/front-theme/empty.png).

Thêm [M10 thắng](../../docs/screenshots/front-theme/result-m10.png) và [khung điện thoại](../../docs/screenshots/front-theme/mobile.png). Ảnh dùng snapshot fixture, có nhãn “BẢN XEM THỬ”; không thay thế ảnh TikTok Live thật.

Code đổi ở `index.html`, `game.css`, `game.js`, `stadium.js`, `characters.js`, `characters.config.js`, `view.config.js`; thêm `hologram-effects.js`, `tests/theme-checks.js` và thư mục mini. Cập nhật fixture, kiểm tra nhân vật và hướng dẫn; dữ liệu kiểm chứng lưu tại [tests/front-theme-results.json](tests/front-theme-results.json). Báo cáo/ảnh sân dọc trước đó được giữ lại để đối chiếu.

## Cần thử thực tế

- Vùng che TikTok trên điện thoại và hiệu năng trong OBS khi live dài.
- Độ rộng model thật có thể khác nhân vật tạm; cần kiểm tra lại việc che bóng/khung thành sau khi thay model.
- Clip SIUUU, chỉ tay/nâng cúp từ Mixamo chưa xác nhận; model thật cần clip cùng rig. Chưa có audio.
- Nếu dùng sáu mini là model nặng, cần giảm lưới/texture hoặc số mini và đo lại FPS.

Vận hành và cấu hình: [README](README.md), [hướng dẫn nhân vật](assets/characters/README.md).
