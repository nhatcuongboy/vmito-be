# Tạo Tournament Mẫu

Script này tạo một tournament mẫu với đầy đủ dữ liệu để test và demo.

## Cách sử dụng

### Option 1: Chạy script từ command line (cần authentication)

```bash
# Chạy script (cần đăng nhập với tài khoản HOST trước)
node scripts/create-sample-tournament.js

# Hoặc với custom API URL
API_URL=http://localhost:3000 node scripts/create-sample-tournament.js
```

**Lưu ý**: Script này cần authentication cookie từ browser. Bạn cần:
1. Đăng nhập vào app với tài khoản HOST
2. Copy authentication cookie từ browser
3. Sử dụng cookie đó trong script (hoặc sử dụng Option 2)

### Option 2: Sử dụng API endpoint (khuyến nghị)

Tạo tournament mẫu thông qua UI hoặc API call với authentication.

### Option 3: Sử dụng từ browser console

1. Mở browser và đăng nhập với tài khoản HOST
2. Mở Developer Console (F12)
3. Copy và paste code từ script vào console
4. Chạy function `createTournament()`

## Dữ liệu mẫu được tạo

### Tournament
- **Tên**: "Badminton Championship 2025"
- **Thời gian**: 7-14 ngày từ hôm nay
- **Status**: PREPARING

### Categories (5 categories)
1. Men's Single (MS)
2. Women's Single (WS)
3. Men's Double (MD)
4. Women's Double (WD)
5. Mixed Double (XD)

### Players (16 players)
- 8 nam, 8 nữ
- Đa dạng về level (Y, Y_PLUS, TBY, TB_MINUS, TB, TB_PLUS, K)
- Có đầy đủ thông tin (name, email, phone, gender, level)

### Pairs
- Tự động tạo pairs từ players
- Men's Double: 4 pairs
- Women's Double: 4 pairs
- Mixed Double: 4 pairs

### Courts (4 courts)
- Court A, Court B, Court C, Court D

### Umpires (3 umpires)
- Có thông tin liên hệ đầy đủ

### Scoring Devices (3 devices)
- 2 LED Scoreboards
- 1 Tablet Scorekeeper

### Registrations
- Players được đăng ký vào Single categories
- Pairs được đăng ký vào Double categories

## Kết quả

Sau khi chạy script thành công, bạn sẽ có:
- 1 tournament hoàn chỉnh
- 16 players
- 12 pairs
- 5 categories với registrations
- 4 courts
- 3 umpires
- 3 scoring devices

Bạn có thể:
- Xem tournament tại: `/tournaments/{tournamentId}`
- Quản lý tournament tại: `/tournaments/{tournamentId}/manage`


