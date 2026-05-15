# 배포 가이드 (웹 공개)

이 프로젝트는 **Next.js 16 App Router** 기준이며, 별도 서버 API 없이 정적·클라이언트 위주로 동작합니다. (`public/industry_rates.json` 등)

## 1) Vercel (권장)

1. [Vercel](https://vercel.com)에 가입 후 **GitHub 저장소**를 연결합니다.
2. **이 폴더(`tax-analyzer`)가 저장소 루트**인 경우: Root Directory를 비워 둡니다.
3. **상위 폴더가 저장소 루트**인 경우: 프로젝트 설정 → **Root Directory**에 `tax-analyzer`를 입력합니다.
4. Framework Preset은 **Next.js**로 자동 인식됩니다. (`vercel.json`에 `framework`, `regions` 등이 있습니다.)
5. **Build Command**: `npm run build` (기본값과 동일)  
   **Install Command**: `npm ci` (`vercel.json`에 명시)
6. **Node 버전**: `package.json`의 `engines.node` (20 이상)에 맞춥니다. Vercel 프로젝트 Settings → Node.js Version에서 **20.x** 선택을 권장합니다.
7. 환경 변수는 **필수 없음**. (로컬 스토리지·JSON만 사용)

배포 후 주소 예: `https://<프로젝트명>.vercel.app`

### 커스텀 도메인

Vercel 프로젝트 → **Domains**에서 구매한 도메인을 연결하면 됩니다.

---

## 2) Docker (자체 서버·NAS·클라우드 VM)

`next.config.ts`에 `output: "standalone"`이 설정되어 있습니다.

```bash
docker build -t tax-analyzer .
docker run -p 3000:3000 tax-analyzer
```

또는:

```bash
docker compose up --build
```

브라우저에서 `http://서버IP:3000` 으로 접속합니다.

---

## 3) Node만 설치된 서버

```bash
npm ci
npm run build
npm run start
```

기본 포트는 **3000**입니다. (`PORT` 환경 변수로 변경 가능)

---

## 참고

- **로고**: `public/logo.png`가 없으면 헤더·인쇄용 이미지는 404일 수 있습니다. 운영 배포 전에 파일을 넣으세요.
- **데이터**: 업종코드는 `public/industry_rates.json`에 포함되어 배포됩니다.
- **민감 정보**: 사용자 입력은 브라우저 **localStorage**에만 저장되며 서버로 전송되지 않습니다.
