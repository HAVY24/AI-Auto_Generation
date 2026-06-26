# Hướng dẫn Cài đặt Shadcn/UI và sử dụng trong rự án (EduAI)

Để các component giao diện (Button, Card, Slider, Toast) hoạt động, bạn cần chạy cài đặt Shadcn/UI trong thư mục `Frontend` (nơi chứa dự án Next.js).

## B1: Cài đặt các Component từ Shadcn
Mở terminal, trỏ vào thư mục `Frontend` và chạy lệnh sau để kéo code của Slider, Button, Card, Toast về project của bạn:

```bash
npx shadcn@latest add button card slider select toast input progress
```

Lênh trên sẽ tự động tạo ra thư mục `src/components/ui/` và cho các file mã nguồn vào đó.

## B2: Cài thêm các Web Dependencies cho Dashboard
Vì dự án ta có Upload File, Export PDF, và Lottie Animation, hãy cài thêm các thư viện sau:

```bash
npm install lucide-react @reduxjs/toolkit react-redux react-to-print docx lottie-react pdfjs-dist@3.4.120 @react-pdf-viewer/core @react-pdf-viewer/default-layout framer-motion
```

## B3: Khởi động Server
Code giao diện cho **Layout**, **Sidebar**, **Topbar** và **Trang chủ Upload** (theo Tuần 1) đã được tạo sẵn trong `src/app` và `src/components/layout`. 

Chạy:
```bash
npm run dev
```
Mở `http://localhost:3000` để xem giao diện cực kỳ hiện đại với tông màu Slate & Blue. Thử kéo thả file ở form Upload để xem hiệu ứng tiến trình AI giả lập.

## Tiếp Theo (Tuần 2 & Tuần 3)
* Chúng ta sẽ tạo tính năng API Redux (RTK Query).
* Xây dựng trang Review chia màn hình (màn hình đôi có react-pdf-viewer bên trái và câu hỏi bên phải).
