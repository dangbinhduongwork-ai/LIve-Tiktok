# Brief: giao diện sân bóng 3D cho game CR7 vs M10 (repo LIve-Tiktok)

> File này viết cho Codex ở dự án thật. Đọc hết trước khi làm. Người dùng nói tiếng Việt: trả lời tiếng Việt, ngắn gọn.
> Làm **sau** khi đợt sửa cân bằng (`BRIEF-live-tiktok-sua-can-bang.md`) đã xong và `npm test` xanh.
> Brief này tự đủ ý: Codex không thấy repo `repo-hay`, nên các điều cần biết về nhân vật 3D đã chép ở mục 6.

## 1. Mục tiêu

Làm giao diện `/game` (OBS Browser Source 1080×1920) đẹp như một chương trình bóng đá trên điện thoại: **sân 3D thật** nhìn từ trên xuống, hai cầu thủ 3D, thanh kéo co, tỉ số, đồng hồ, hiệu ứng quà và bàn thắng, hướng dẫn tham gia và bảng top donator nổi bật. Hiện tại giao diện là canvas hình khối, bị đánh giá xấu.

Luật chơi **không đổi và không nằm ở client**. Client chỉ vẽ từ `game:state` và `game:event`.

## 2. Phạm vi hai bước

- **Bước A (làm ngay):** toàn bộ giao diện, sân 3D, HUD, hiệu ứng, và **nhân vật tạm có khung thay model sẵn** (mục 6). Nhân vật tạm phải đủ dùng để chơi và quay thử, không chỉ là ô vuông đứng yên.
- **Bước B (không cần Codex viết lại code):** người dùng chỉ **thả file GLB hoặc FBX** (model, animation) vào thư mục quy định, sửa vài dòng cấu hình, tải lại trang là thấy nhân vật thật. Toàn bộ khả năng nạp, tự scale, tự chạm đất, ghép clip và xử lý texture phải được làm **ngay ở bước A**, để bước B không cần sửa code.

## 3. Yêu cầu hiển thị

### Sân và camera
- Three.js, sân cỏ có vạch, hai khung thành; trục dài của sân đặt **theo chiều dọc màn hình** để hợp 9:16.
- Camera nhìn từ trên xuống, hơi nghiêng. Vị trí bóng `ballPos` (−1000..+1000) ánh xạ lên trục dài. −1000 là khung thành CR7, +1000 là khung thành M10.
- Mỗi đội một cầu thủ chính; trạng thái trận điều khiển hành động: đội đang thắng thế chạy/sút, ghi bàn thì ăn mừng, đội thua thế đứng thở hoặc buồn. Với nhân vật tạm, dùng chuyển động đơn giản (nhún, chạy tại chỗ).
- Hiển thị bóng nhỏ từ comment (`smallBalls`) bay về phía đối thủ.

### HUD (HTML/CSS phủ lên canvas, chữ nét)
- **Bảng tỉ số trên cùng:** tên đội, số áo, tỉ số, đồng hồ. Chữ lớn, tương phản cao, đọc được trên điện thoại.
- **Thanh kéo co** dọc theo sân, màu hai đội, có chỉ báo lực và thời gian đóng băng.
- **Hướng dẫn tham gia luôn hiển thị:** dòng cố định kiểu "Gõ 7 = CR7 · Gõ 10 = M10" (nội dung lấy từ `gameConfig.teams[*].keywords`, không viết cứng), đặt chỗ không bị che.
- **Top donator mỗi đội** (top 3, có avatar và tên, số xu): làm nổi bật, có hiệu ứng khi vị trí đổi.
- Dòng sự kiện gần nhất (vào đội, quà, ghi bàn).
- Màn kết quả (thắng/hòa) kèm pháo hoa.
- **Vùng an toàn:** giao diện TikTok thường che một phần trên, dưới và cạnh phải màn hình. Chừa khoảng trống cho thông tin quan trọng (ước lượng ban đầu: khoảng 150px trên, 400px dưới, 140px phải; **đây là ước lượng, cần kiểm tra trên điện thoại thật**). Để các số này trong một biến cấu hình dễ chỉnh.

### Hiệu ứng khi có quà và bàn thắng
Gắn với `game:event`:

| Sự kiện | Hiệu ứng |
|---|---|
| `team_join` | Dòng chào ngắn + avatar bay vào góc đội |
| `gift_skill` (cơ bản) | Số điểm lực bay lên, bóng nhỏ tăng tốc |
| `gift_skill` (tuyệt kỹ) | Sóng xung kích, banner tên người tặng |
| `gift_skill` (bóng vàng) | Quả bóng vàng từ trời rơi xuống, ánh sáng |
| `freeze` | Lớp băng trên nửa sân đối thủ, vòng đếm ngược 10 giây |
| `goal` | Chữ GOAL lớn, rung camera nhẹ, pháo hoa, bóng về giữa |
| `overtime` | Banner "BÙ GIỜ ×2" |
| `result` | Màn kết quả, ăn mừng đội thắng |
| `gift_rejected` (nếu đã có từ đợt sửa cân bằng) | Thông báo nhỏ "Chiêu đã dùng / đang hồi" |

## 4. Phong cách

Hướng: bản tin bóng đá truyền hình hiện đại, chữ condensed đậm, màu lấy từ `gameConfig.teams` (đỏ-trắng và xanh-trắng), có chiều sâu và ánh sáng nhưng không rối. **Tránh** giao diện kiểu "AI chung chung" (gradient tím-xanh mặc định, thẻ lồng thẻ).

Gợi ý công cụ (người dùng có sẵn trong thư viện, Codex dùng nếu có): skill `taste-skill` và `impeccable` cho thiết kế, `gsap-skills` cho hoạt ảnh. Dùng font tự host (không tải từ CDN).

## 5. Hiệu năng và độ bền (quan trọng cho live)

- **Không phụ thuộc mạng ngoài lúc live:** vendoring Three.js và font vào `public/` thay vì dùng CDN. Avatar TikTok là ảnh từ domain ngoài: phải có ảnh dự phòng khi tải lỗi.
- Mục tiêu khoảng 60 FPS (chấp nhận 30 FPS ổn định) ở 1080×1920 trong OBS Browser Source. Giữ `pixelRatio` 1, dùng pool đối tượng cho hạt và bóng, không tạo mới mỗi sự kiện.
- Có chế độ chất lượng thấp qua tham số URL (ví dụ `?quality=low`): giảm bóng đổ, hạt, độ phức tạp.
- Màn hình tự khôi phục khi socket ngắt rồi nối lại; F5 giữa trận vẫn đồng bộ qua `init_state`.
- **Chưa kiểm chứng:** âm thanh và hiệu năng thật trong OBS. Chỉ đo được khi người dùng chạy thật.

## 6. Hệ thống nhân vật "thả file là chạy" (làm ở bước A)

Người dùng tạo model và animation sau (Meshy → Mixamo, hoặc nguồn khác) rồi chỉ thả file vào. Vì vậy cần một **hệ thống nhân vật có cấu hình**, không viết cứng.

### 6.1. Cấu hình và thư mục
- Thư mục: `public/game/assets/characters/` (mỗi đội một thư mục con `cr7/` và `m10/`, cộng thư mục dùng chung nếu muốn).
- File cấu hình duy nhất `public/game/characters.config.js`, ví dụ:
  ```js
  export const characters = {
    cr7: { model: 'cr7/model.fbx', clips: { idle: 'cr7/Idle.fbx', run: 'cr7/Run.fbx', kick: 'cr7/Kick.fbx', celebrate: 'cr7/Celebrate.fbx', defeated: 'cr7/Defeated.fbx' }, height: 1.8 },
    m10: { model: 'm10/model.glb', clips: {}, height: 1.8 }   // GLB đã có sẵn clip bên trong
  };
  ```
  Để trống `model` hoặc file không tồn tại thì tự dùng nhân vật tạm của đội đó.
- Bổ sung `README.md` trong thư mục nhân vật, tiếng Việt, hướng dẫn người dùng đặt file nào ở đâu và tên clip nào được nhận.

### 6.2. Hợp đồng bắt buộc
1. **Hỗ trợ cả `.glb`/`.gltf` (GLTFLoader) và `.fbx` (FBXLoader)**, chọn theo đuôi file. Hai kiểu clip: nằm sẵn trong file model, hoặc ở file riêng (FBX "Without Skin" của Mixamo).
2. **Tên trạng thái cố định** mà game dùng: `idle`, `run`, `kick`, `celebrate`, `defeated`, `jump`. Cho phép ghép **bí danh theo tên clip** (không phân biệt hoa thường, khớp chuỗi con: ví dụ clip tên `Breathing Idle`, `Soccer Kick`, `Victory` được ghép vào `idle`, `kick`, `celebrate`). Trạng thái nào không có clip thì dùng clip gần nhất (ví dụ không có `kick` thì dùng `run`) và vẫn chạy bình thường.
3. **Hàm tạo cố định:** `createCharacter(teamId)` trả về `{ object3d, play(stateName, opts), dispose() }`. Nhân vật tạm và nhân vật thật dùng chung giao diện này; phần còn lại của game không biết sự khác nhau.
4. **Không bao giờ làm hỏng game vì thiếu file:** file lỗi hoặc thiếu thì dùng nhân vật tạm, ghi cảnh báo rõ trên console, và hiện một dòng nhỏ khi bật `?debug`. Không được trắng màn hình.
5. **Tự scale và tự chạm đất:** chiều cao đích lấy từ `height` trong cấu hình. Với model có xương, đo theo xương (mục 6.3 số 3); với model không có xương, dùng hộp bao của mesh.
6. **Thay file là thấy:** chỉ cần tải lại trang (hoặc tham số `?reloadChars` nếu có cache), không build.
7. **Nhân vật tạm** nên là hình người đơn giản (thân, đầu, tay, chân bằng khối), có chuyển động tạo từ code cho `idle` (nhún), `run` (chạy tại chỗ), `kick` (vung chân), `celebrate` (nhảy, giơ tay), `defeated` (cúi, thả tay), mặc màu áo đội và số áo trên lưng. Mục đích: xem được nhịp trận và hiệu ứng khi chưa có model thật.

### 6.3. Điều cần biết về file Mixamo (đã rút ra từ lần làm thử)

Khi nhận file FBX từ Mixamo, lưu ý:

1. **Chỉ lấy mesh và xương từ file "With Skin"** (nặng ~22MB), các clip khác ("Without Skin") chỉ lấy `animations[0]` rồi gắn vào cùng `AnimationMixer`. Tên xương trùng (`mixamorigHips`...) nên khớp.
2. **Texture phải gắn lại bằng code.** FBX trỏ ảnh về đường dẫn trên server Mixamo. Dùng `LoadingManager.setURLModifier` đổi URL `.png` về file trong `public/`, rồi tạo `MeshStandardMaterial` với `map` (sRGB), `normalMap`, `roughnessMap`. **Không dùng metallic map** (làm giày và tất bóng như kim loại), đặt `metalness = 0`.
3. **Scale và chạm đất theo xương, không theo hộp bao mesh.** Hộp bao của mesh có skin cho kết quả sai (nhân vật lơ lửng). Cách làm: cho clip chạy, lấy mẫu khoảng 24 thời điểm, đo `mixamorigHeadTop_End` (đỉnh đầu) và `mixamorigLeftToe_End` / `mixamorigRightToe_End` (mũi chân thấp nhất), rồi scale về chiều cao mong muốn và hạ chân chạm đất.
4. **Giữ tại chỗ:** cố định X/Z của track `Hips.position` (lấy giá trị frame đầu), giữ trục Y để còn nhún lên xuống. Code tự di chuyển nhân vật.
5. **Clip tải cho nhân vật khác bị lệch đơn vị (cm so với m):** nhân vị trí Hips với `hipsTrungBinhCuaClipWalk / 100`, nếu không nhân vật biến mất hoặc chìm xuống đất.
6. **Nhẹ cho OBS:** mesh gốc ~200 nghìn đỉnh, texture 4K là quá nặng cho hai nhân vật; mục tiêu 20–50 nghìn đỉnh, texture 1–2K. Việc giảm đỉnh do người dùng làm bằng Blender.
7. **Chuyển clip mượt:** dùng `crossFadeTo` khoảng 0,3 giây; clip `kick`, `celebrate`, `jump` chạy một lần rồi quay về `idle` hoặc `run`.

Clip dự kiến: Idle, Run, Kick (sút), Celebrate (ăn mừng), Defeated (thua), Jump. Người dùng chưa xác nhận Mixamo có đủ clip bóng đá; thiếu thì áp dụng quy tắc dùng clip gần nhất ở mục 6.2.

**Việc người dùng phải làm (không phải Codex):** tạo và rig model, tải clip, giảm số đỉnh (khoảng 20–50 nghìn), thả file vào `public/game/assets/characters/` và sửa `characters.config.js`.

**Kiểm tra bằng file thật:** người dùng có thể đưa vài file mẫu để Codex thử hệ thống thay model. Nếu chưa có, tạo một file GLB/FBX nhỏ đơn giản để kiểm tra đường nạp (loader, scale, chạm đất, ghép clip) và nói rõ chưa thử với model Mixamo thật.

## 7. Tiêu chí hoàn thành

**Hệ thống nhân vật (quan trọng nhất, vì người dùng sẽ thay model sau):**
- Thả một file GLB hoặc FBX vào `public/game/assets/characters/` + sửa `characters.config.js` → tải lại trang thì nhân vật mới xuất hiện, đúng chiều cao, chân chạm đất, animation chạy theo trạng thái trận; **không cần sửa code**.
- Xoá file hoặc để cấu hình trống → quay về nhân vật tạm, game không lỗi.
- Có test (hoặc trang kiểm tra) cho: bí danh tên clip, quy tắc dùng clip gần nhất, đường nạp GLB và FBX, và trường hợp file thiếu.

**Giao diện:**
1. `npm start`, bật Test Tải (15 bots) ở `/admin`, mở `/game`: xem được một trận đủ phase, không lỗi trên console.
2. **Ảnh chụp 1080×1920 cho 8 trạng thái:** chờ, đang đá, ghi bàn, bù giờ, đóng băng, bóng vàng, kết quả, phòng trống (chỉ AI). Đính kèm hoặc lưu vào `docs/screenshots/`.
3. Hướng dẫn tham gia luôn thấy được; top donator nổi bật và cập nhật khi có quà.
4. Đo FPS ở chế độ thường và `?quality=low`, báo số liệu và máy dùng.
5. Bật/tắt mạng: trang vẫn hiển thị được (không tải tài nguyên từ CDN); ảnh avatar lỗi thì dùng ảnh dự phòng.
6. F5 giữa trận đồng bộ đúng; `npm test` vẫn xanh.

## 8. Ràng buộc

- Chỉ sửa `public/game/` và (nếu cần) thêm file trong `public/`. Không đổi luật ở `src/gameEngine.js`.
- Không phá hợp đồng `game:state` và `game:event`. Cần trường mới thì thêm vào, nói rõ trong báo cáo.
- Dependency cho client được vendoring vào `public/`; không thêm package vào `package.json` trừ khi thật cần và nêu lý do.
- Không commit thay người dùng.

## 9. Báo cáo khi xong

File đã thêm/sửa, ảnh chụp, số FPS, các tuỳ chọn thiết kế đã chọn và vì sao, những chỗ chưa chắc (nhất là vùng an toàn TikTok và hiệu năng trong OBS).
