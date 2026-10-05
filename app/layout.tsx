import type { Metadata, Viewport } from 'next';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'spine — 3D 책장 메모',
  description: '책 한 권이 주제 하나, 페이지가 메모인 3D 책장',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
