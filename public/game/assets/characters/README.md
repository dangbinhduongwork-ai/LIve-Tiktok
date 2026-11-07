# Thay cầu thủ 3D

Sửa **`public/game/characters.config.js`**, rồi F5 `/game/`. Không cần build hoặc khởi động lại server. Mọi đường dẫn bên dưới tính từ thư mục này.

## Ngôi sao lớn và cầu thủ nhỏ

`model`, `clips`, `textures` ở cấp đội là ngôi sao lớn. Cầu thủ nhỏ có cấu hình độc lập trong `mini`, dùng cùng loader và quy tắc animation:

```js
cr7: {
  model: 'cr7/model.glb', height: 1.8, clips: {},
  mini: {
    model: 'cr7/mini/model.glb',
    clips: {},
    textureDirectory: 'cr7/mini/textures/'
  }
}
```

Đặt file tương tự trong `m10/mini/` cho đội M10. `mini` nhận các tùy chọn `height`, `rotationY`, `aliases`, `textures`, `textureFiles`, `positionScale` giống ngôi sao. Nếu mini trống hoặc file lỗi, dùng mini tạm; không tự tải lại model lớn của ngôi sao cho cả sáu cầu thủ.

Trong `view.config.js`, `miniPlayers.perTeam` mặc định **3**, tối đa **6** để giữ chi phí dựng hình có giới hạn. `miniPlayers.height` là chiều cao chung (2,65 đơn vị sân); `mini.height` nếu khai báo sẽ ghi đè. `stars.height` là chiều cao trình bày theo pixel (hiện 420px), độc lập với chiều cao chuẩn hóa model.

Giữ model mini nhẹ vì được dựng nhiều lần. Hành động cổ vũ, SIUUU/giơ tay là chuyển động code của nhân vật tạm; model thật dùng các clip bạn cung cấp và fallback gần nhất. Không có âm thanh hô SIUUU trong đợt này. Chưa xác nhận clip Mixamo dành riêng cho các động tác này.

## GLB / GLTF có animation

1. Chép model vào `cr7/model.glb` hoặc `m10/model.glb`.
2. Với `.gltf`, chép cả `.bin` và ảnh đi kèm, giữ cấu trúc thư mục.
3. Đặt `model: 'cr7/model.glb'`, `height: 1.8`, `clips: {}` ở đội tương ứng trong config.

Tên clip được nhận không phân biệt hoa thường và khớp chuỗi con:

| Trạng thái | Ví dụ tên clip |
|---|---|
| `idle` | Idle, Breathing Idle, Standing |
| `run` | Run, Jog, Walk, Sprint |
| `kick` | Soccer Kick, Shoot |
| `celebrate` | Victory, Celebration, Cheer, Dance |
| `defeated` | Defeated, Sad, Exhausted |
| `jump` | Jump, Leap |

Có thể thêm `aliases: { celebrate: ['MyWinClip'] }`. Thiếu clip thì dùng clip gần nhất, ví dụ `kick` → `run` → `idle`; không có animation thì model vẫn hiển thị.

## FBX từ Mixamo và clip riêng

Model chính dùng bản **With Skin**; animation riêng dùng **Without Skin**, cùng bộ xương/rig với model. Ví dụ cấu hình của CR7:

```js
{
  model: 'cr7/model.fbx', height: 1.8, rotationY: 0,
  clips: {
    idle: 'cr7/Idle.fbx', run: 'cr7/Run.fbx', kick: 'cr7/Kick.fbx',
    celebrate: 'cr7/Celebrate.fbx', defeated: 'cr7/Defeated.fbx', jump: 'cr7/Jump.fbx'
  },
  textureDirectory: 'cr7/textures/',
  textureFiles: { 'Body_D.png': 'cr7/textures/color.png' },
  textures: {
    map: 'cr7/textures/color.png',
    normalMap: 'cr7/textures/normal.png',
    roughnessMap: 'cr7/textures/roughness.png'
  },
  positionScale: 'auto'
}
```

Chỉ khai báo những texture thực sự có. `textures` ghi đè chung cho các mesh; với nhiều material dùng `textureFiles` ánh xạ theo tên ảnh gốc để giữ từng material. Ảnh FBX tự tìm trong `textureDirectory`. Model/texture không được tải từ máy chủ bên ngoài. Metallic map không dùng, `metalness = 0`; ảnh màu dùng sRGB.

Clip có nhiều animation có thể chọn bằng `kick: { file: 'cr7/Actions.glb', name: 'Soccer Kick' }`. Bộ nạp chỉ lấy clip từ file phụ, không thêm mesh của file đó vào sân.

## Scale và hướng

- `height`: chiều cao đích theo đơn vị sân (mặc định 1,8).
- `rotationY`: góc xoay bổ sung theo độ. Nếu quay ngược, thử `180`.
- Với rig, đo đầu/chân qua 24 mẫu animation idle rồi scale/chạm đất. Không có xương thì dùng hộp bao mesh.
- Cố định X/Z của track Hips, giữ chuyển động Y. Tự phát hiện chênh lệch lớn cm/m; nếu rig khác thường, đặt `positionScale: 0.01` hoặc `100`, hoặc đặt riêng cho từng clip.
- Đây là ghép clip cùng rig, **không phải retarget tự động mọi loại skeleton**. Thiếu xương đầu/chân thì dùng toàn bộ xương làm phương án dự phòng.
- Nhắm khoảng 20–50 nghìn đỉnh/model và texture 1–2K; giảm lưới bằng Blender trước khi dùng OBS.

Để `model: ''`, file lỗi hoặc file không có mesh sẽ dùng cầu thủ tạm có chuyển động. Clip lỗi dùng animation gần nhất. Mở `/game/?debug&reloadChars` để xem chẩn đoán và bỏ cache model/clip/texture. Nếu vừa sửa config, dùng Ctrl+F5.

## Kiểm tra

Mở `/game/character-test.html`. Trang chạy 18 kiểm tra alias, fallback, nạp GLB/GLTF/FBX mẫu, animation, chạm đất, xương, file thiếu và model mini độc lập. Các mẫu trong `fixtures/` là hình học đơn giản tự tạo, **chưa thay thế kiểm tra model Mixamo thật**.

Để thử model của bạn, đặt model vào thư mục đội, sửa config rồi mở game thật. `?quality=low` tắt bóng đổ và giảm hạt. Không có âm thanh ở đợt giao diện này.
