'use client';

import dynamic from 'next/dynamic';

// three.js와 localStorage를 쓰므로 브라우저에서만 그린다
const App = dynamic(() => import('@/components/App'), { ssr: false });

export default function Page() {
  return <App />;
}
