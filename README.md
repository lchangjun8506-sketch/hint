# FITTER

운동 일지 앱. 구조는 **GitHub → Vercel 자동 배포**이고, 데이터는 **Google 스프레드시트**에 저장됩니다.

```
브라우저 (index.html)
   │  fetch('/api/...')
   ▼
Vercel 서버리스 함수 (api/*.js)
   │  서비스 계정 + Sheets REST API
   ▼
Google 스프레드시트 (Logs, Exercises 탭)
```

기존 Apps Script 구조(HTML + Code.gs + 시트)와 비교하면 화면은 Vercel CDN에서 바로 뜨고,
저장·삭제는 화면에 먼저 반영한 뒤 백그라운드로 처리해서 훨씬 빠르게 느껴집니다.

## 파일

| 파일 | 역할 |
| --- | --- |
| `index.html` | 화면 (Tailwind CDN, 단일 파일) |
| `api/logs.js` | `GET/POST/DELETE /api/logs` 운동 일지 |
| `api/exercises.js` | `GET/POST /api/exercises` 사용자 추가 종목 |
| `api/_sheets.js` | Google Sheets 연동 공용 코드 (외부 의존성 없음) |

## 설정 (최초 1회)

환경변수가 없으면 앱은 **데모 모드**(예시 데이터, 새로고침하면 초기화)로 동작합니다.

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만들고 **Google Sheets API**를 사용 설정합니다.
2. **서비스 계정**을 만들고 JSON 키를 발급합니다.
3. 데이터를 저장할 스프레드시트를 열고, 서비스 계정 이메일(`...iam.gserviceaccount.com`)을 **편집자**로 공유합니다.
4. Vercel 프로젝트 → Settings → Environment Variables에 아래 3개를 추가합니다 (`.env.example` 참고).
   - `SHEET_ID`: 시트 주소의 `/d/` 와 `/edit` 사이 값
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: JSON 키의 `client_email`
   - `GOOGLE_PRIVATE_KEY`: JSON 키의 `private_key` (줄바꿈 `\n` 포함 그대로)
5. Redeploy 하면 연결됩니다.

`Logs`, `Exercises` 탭이 없으면 첫 요청 때 자동으로 만들어집니다.

### 시트 구조

- `Logs`: `id | date | routine | exercise | sets(JSON) | memo | createdAt`
- `Exercises`: `routine | exercise`

## 배포

`main`에 푸시하면 Vercel이 자동으로 프로덕션 배포하고, 다른 브랜치·PR은 프리뷰로 배포됩니다.

## 알아둘 점

- `/api`에는 로그인이 없어서 주소를 아는 사람은 읽고 쓸 수 있습니다. 개인용이면 괜찮지만, 공개하려면 비밀번호 방식 등을 추가하세요.
