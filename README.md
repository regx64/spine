# spine — 3D 책장 메모

혼자 쓰는 메모 사이트. 책 한 권이 주제 하나, 페이지가 메모다. 흰 원형 탑의 벽 전체가 책장이고, 레일 사다리를 타고 오르내리며 책을 꺼내 독서대에 펼쳐 페이지에 직접 쓴다.

## 실행

```bash
npm install
npm run dev   # http://localhost:3000
```

Supabase 환경 변수가 없으면 **로컬 모드**로 동작한다(이 브라우저 localStorage에 저장, 예시 책장이 채워짐).

### Supabase (Google 로그인 + 서버 저장)

1. Supabase 프로젝트를 만들고 `supabase/migrations/0001_init.sql`을 실행한다 (테이블 3개 + RLS + `book_stats` 뷰).
2. Authentication → Providers에서 Google을 켜고, Redirect URL에 배포 주소를 넣는다.
3. `.env.local`(또는 Vercel 환경 변수)에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 넣는다.

## 조작

| 입력 | 동작 |
| --- | --- |
| 휠 | 사다리 위아래 |
| A/D (←/→) | 벽을 따라 좌우 |
| 마우스 이동 | 시점 기울임 (좌우 35°, 상하 20°) |
| 책 클릭 | 뽑아서 독서대에 펼침 |
| 페이지 가장자리 클릭 | 한 장 넘김 |
| Esc / 닫기 | 제자리에 꽂기 |
| 옮기기 | 책을 든 채로 이동, 책 사이를 눌러 끼움 (다른 기둥이면 카테고리 변경) |
| 버리기 | 휴지통으로 (복구 가능) |
| 모션 중 클릭 | 즉시 끝 상태로 |

`?stress=500`을 붙이면 저장하지 않는 테스트 책 500권이 채워진다 (1단계 성능 확인용).

## 구조

- `lib/geometry.ts` 탑·기둥·칸 치수와 책 배치 계산 (위치·두께는 저장하지 않고 순서와 분량에서 계산)
- `lib/director.ts` GSAP 모션 연출과 시간표 (뽑기 0.3s, 독서대 0.6s, 표지 0.6s, 넘김 0.5s, 점프 0.8s, 꽂기 1.0s …)
- `lib/paginate.ts` 고정 글꼴·크기로 DOM에서 재는 페이지 나눔
- `lib/store.ts` Zustand 상태 + 1초 디바운스 자동 저장
- `lib/repo/` 로컬 / Supabase 저장소
- `components/scene/` R3F 장면: 인스턴싱된 책, 책등 텍스처(보이는 책만), 펼친 책, 휘는 페이지, 페이지에 겹친 HTML 입력창
- 글꼴: Pretendard (npm 패키지로 함께 배포)
