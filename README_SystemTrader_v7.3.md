# SystemTrader Hybrid-Hướng dẫn vận hành, cài đặt và test

---

## 1. Mục tiêu hệ thống

**SystemTrader Hybrid** là hệ thống quét thị trường crypto spot theo thời gian thực, được thiết kế để:

- Quét universe coin **Binance USDT spot**
- Lọc coin theo **chất lượng setup**
- Chấm điểm **cấu trúc giá** theo logic trading system
- Phân tầng coin theo **trạng thái execution**
- Hiển thị **top setup** để trader/dev kiểm tra nhanh
- Hỗ trợ execution theo nhiều lớp:

  - `WATCH`
  - `PROBE`
  - `PLAYABLE`
  - `SCALP_READY`
  - `READY`

⚠️ **Lưu ý quan trọng**

Hệ thống **không phải trading bot** và **không tự đặt lệnh trên sàn**.

Vai trò chính của system hiện tại:

- Scan market
- Lọc setup
- Xếp hạng coin
- Đề xuất entry / stop / TP
- Hỗ trợ **con người ra quyết định**

---

## 2. Trading methodology – Hệ thống đang vận hành theo phương pháp gì

SystemTrader Hybrid là một **hybrid discretionary → systematic scanner**:

tư duy giao dịch thủ công được **chuẩn hóa thành logic định lượng** để quét tự động.

### 2.1. Wyckoff structure

Hệ thống ưu tiên nhận diện các pha:

- Early Phase D
- Phase C candidate
- Spring / Shakeout
- Re-accumulation
- Breakout retest
- Early watch

**Tư duy chính**:

- Tìm coin **chưa chạy quá xa**
- Ưu tiên coin có **dấu hiệu hấp thụ cung**
- Tránh coin đã **distribution hoặc fake pump mạnh**
- Ưu tiên vùng có khả năng **smart money tích lũy**

---

### 2.2. VSA / Volume behavior

Hệ thống đọc **hành vi volume**, không chỉ giá:

- Volume có mở ra hay không
- Volume tăng nhưng giá **chưa bị đẩy quá xa**
- Có dấu hiệu **absorption** không
- Smart money: `present / neutral / weak`

**Mục tiêu**:

- Không chỉ nhìn _giá_
- Mà nhìn **giá + volume + phản ứng của giá sau volume**

---

### 2.3. Multi-timeframe execution

System scan theo **nhiều lớp khung thời gian**:

- **4H / 1D** – Market regime & structure
- **1H** – Setup quality
- **15m** – Execution timing

**Ý nghĩa**:

- 4H / 1D: coin đang ở phase nào
- 1H: setup có đáng theo dõi không
- 15m: có thể vào lệnh hay chưa

---

### 2.4. Regime-based execution

System **không scan kiểu coin nào cũng trade**.

Execution phụ thuộc **market regime**:

- `Bullish`
- `Sideway`
- `Breakdown`

Ví dụ:

- Bullish: nới lỏng cho breakout continuation
- Sideway: ưu tiên mean reversion / re-acc / spring / probe
- Breakdown: siết chặt điều kiện, **giảm allocation mạnh**

➡️ Cùng một coin, nhưng **regime khác → execution khác**.

---

### 2.5. Confidence + risk-based ranking

Mỗi coin có nhiều lớp đánh giá, không chỉ score tổng:

- Confidence
- Relative volume
- Risk / allocation
- Timing state
- Chart entry quality
- Structure risk / entry late / wait retest
- Active / confirm / pre-trigger

➡️ Hệ thống chọn coin theo:

- Độ đẹp
- Độ vào được
- Độ rủi ro
- Phù hợp market hiện tại hay không

---

### 2.6. Execution layer

Execution được chia tầng rõ ràng:

| Tier | Ý nghĩa ngắn |

|-----|-------------|

| AVOID | Loại |

| EARLY | Theo dõi |

| PROBE | Thăm dò nhỏ |

| PLAYABLE | Size nhỏ có kiểm soát |

| SCALP_READY | Execution ngắn hạn |

| READY | Setup mạnh, chất lượng cao |

---

## 3. System scan theo khung giờ như thế nào

### 3.1. Scan cycle

System là **live market scanner**:

- Lấy dữ liệu mới từ Binance
- Tính lại score
- Cập nhật ranking
- Coin **có thể lên/xuống tier theo market**

➡️ Top coin **không cố định**.

---

### 3.2. Các lớp thời gian vận hành

**Layer 1 – Market context**

- Bull / Sideway / Breakdown
- Market health
- Execution gate

**Layer 2 – Structure scan**

- Phase
- Narrative
- Maturity
- Fake pump risk
- Smart money
- RelVol

**Layer 3 – Entry timing**

- Pre-trigger
- Early probe
- Active
- Confirm
- Entry quality: `good / neutral / late / wait_retest`

---

### 3.3. Thời điểm nên scan

**Khuyến nghị test**:

- Scan nhiều lần trong ngày
- Trước / sau nến mới 15m / 1H
- Chụp snapshot để so độ ổn định

**Khuyến nghị thực chiến**:

- Scan đầu phiên
- Sau biến động thị trường
- Khi BTC đổi regime
- Trước khi vào lệnh

---

## 4. Giải thích các thành phần giao diện

### 4.1. Insight Layer

Hiển thị:

- Market health
- Qualified / analyzed
- No-trade reason

➡️ Market health thấp → execution bị siết.

---

### 4.2. Near Miss & Reject Summary

Nhóm coin **gần đạt chuẩn nhưng bị loại** vì:

- wait_trigger_15m
- rr_suboptimal
- structure_soft
- smart_money_weak
- entry_late
- invalid_stop

➡️ Vùng rất quan trọng để **follow-up scan**.

---

### 4.3. Auto Avoid List

Coin bị loại tự động vì:

- No setup
- Fake pump high
- Structure risk
- Score thấp

---

### 4.4. Danh sách coin learned

Bảng scan chính, bao gồm:

- Score
- Phase / maturity
- Confidence
- RelVol
- Risk allocation
- Timing state
- Entry quality
- Breakdown logic (structure / volume / fib / EMA / BTC)

➡️ Dùng để **đối chiếu với chart tay**.

---

### 4.5. Top 3 Scanner Panel

Hiển thị coin tốt nhất theo execution layer hiện tại.

Tester cần kiểm:

- Tại sao coin này đứng top
- Entry / stop / TP có hợp lý không
- Vì sao `entry_late` nhưng vẫn xếp cao
- Vì sao coin rank thấp nhưng vẫn vào watchlist

---

### 4.6. Dashboard

Dashboard tổng hợp:

- Market regime
- Execution confidence
- Portfolio risk
- Allocation hint
- Số READY / SCALP_READY / EARLY / AVOID
- Top adaptive edge setups

➡️ Màn hình nhìn nhanh trạng thái engine.

---

### 4.7. Watchlist

Auto-tier gồm:

- Best Entry
- Theo dõi
- Tránh

Mục tiêu:

- Quản lý follow-up
- Không để trader phải nhớ mọi coin

---

## 5. Ý nghĩa các tag thường gặp

### Phase / Setup

- Phase C Candidate
- Early Phase D
- Re-acc
- Spring / Shakeout
- Breakout retest

### Quality / Execution

- FakePump low / medium / high
- SM present / neutral / weak
- Maturity weak / developing / mature
- structure_risk
- entry_late
- wait_retest
- pre_trigger
- active
- confirm
- probe / playable / scalp_ready

---

## 6. Cách sử dụng cho Trader / Tester

### 6.1. Quy trình chuẩn

1. Mở **Dashboard**
2. Kiểm market regime & health
3. Vào **Coin Scanner** → Scan
4. Đọc Top 3 + Near Miss + Learned
5. Mở chart 4H / 1H / 15m
6. Kiểm tier execution
7. Chỉ xem xét trade khi ≥ PLAYABLE

---

### 6.2. Entry / Stop / TP

- Entry: vùng hợp lý theo system
- Stop: mức invalidation
- TP1: target đầu
- RR: reward / risk

**Nguyên tắc**:

> Không vì coin top 1 mà vào lệnh bừa

> Chart lớn ưu tiên hơn chart nhỏ

---

### 6.3. Watchlist usage

- Theo dõi: chờ xác nhận
- Best Entry: ưu tiên xem trước
- Tránh: không mất thời gian

---

## 7. Hướng dẫn cài đặt – TEST

### 7.1. Yêu cầu môi trường

- Windows / Linux / macOS
- Chrome / Edge mới
- Local web server
- Internet truy cập Binance API

---

### 7.2. Cấu trúc chạy

- `index.html`
- Thư mục JS / assets
- Logic scanner / execution
- Local storage / cache

---

### 7.3. Chạy local

**Python**

```bash

python -m http.server 8080
```
