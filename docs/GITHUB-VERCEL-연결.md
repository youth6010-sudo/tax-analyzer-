# GitHub 연결 + Vercel 배포 (순서대로)

로그인·저장소 생성은 **본인 계정**으로만 가능합니다. 아래 순서만 따라가면 됩니다.

---

## 0. 준비

- PC에 **Git** 설치: https://git-scm.com/download/win  
  (또는 **GitHub Desktop**만 써도 됩니다.)
- **Node.js 20** 이상 (이미 있으면 생략)

---

## 1. GitHub에 빈 저장소 만들기

1. https://github.com 로그인 → 우측 **+** → **New repository**
2. Repository name 예: `tax-analyzer`
3. **Add a README** 체크 **해제** (빈 저장소가 푸시하기 편합니다.)
4. **Create repository** 후, 화면에 나오는 주소를 복사합니다.  
   예: `https://github.com/내아이디/tax-analyzer.git`

---

## 2. 이 프로젝트 폴더에서 Git 첫 연결

**PowerShell** 또는 **Git Bash**에서 `tax-analyzer` 폴더로 이동한 뒤:

```bash
git init
git add .
git commit -m "Initial commit: tax analyzer"
git branch -M main
git remote add origin https://github.com/내아이디/tax-analyzer.git
git push -u origin main
```

- `내아이디` / 저장소 URL은 본인 것으로 바꿉니다.
- GitHub에 **2단계 인증**이 있으면 비밀번호 대신 **Personal Access Token**을 써야 할 수 있습니다.  
  GitHub → **Settings → Developer settings → Personal access tokens** 에서 `repo` 권한으로 토큰 발급.

**GitHub Desktop**을 쓰는 경우: **File → Add local repository** 로 이 폴더 선택 → **Publish repository** 로 올려도 됩니다.

---

## 3. Vercel에서 GitHub와 연결해 배포

1. https://vercel.com 가입·로그인 (GitHub 계정으로 가입 가능)
2. **Add New… → Project**
3. **Import Git Repository** 에서 방금 만든 `tax-analyzer` 저장소 선택 → **Import**
4. 설정 확인:
   - **Framework Preset**: Next.js (자동)
   - **Root Directory**: 이 저장소 루트가 `tax-analyzer` 폴더라면 `.` 그대로
   - **Build Command** / **Install Command**: `vercel.json` 과 동일하게 쓰려면 그대로 두어도 됩니다.
5. **Deploy** 클릭

끝나면 **`https://프로젝트이름.vercel.app`** 같은 주소가 생깁니다. 이후 **GitHub에 `push`할 때마다** Vercel이 자동으로 다시 빌드합니다.

### 도메인

Vercel 프로젝트 → **Settings → Domains** 에서 회사 도메인을 연결할 수 있습니다.

---

## 4. (선택) GitHub Actions로만 배포하고 싶을 때

저장소에 이미 `.github/workflows/vercel-production.yml` 이 있습니다.  
GitHub → 저장소 **Settings → Secrets and variables → Actions** 에 아래 **3개**를 넣으면, `main` / `master` 에 **push**할 때마다 프로덕션 배포가 돌아갑니다.

| Name | 값 |
|------|-----|
| `VERCEL_TOKEN` | Vercel → 우측 프로필 → **Account Settings → Tokens** → Create |
| `VERCEL_ORG_ID` | Vercel → 해당 **Team** → Settings → **Team ID** |
| `VERCEL_PROJECT_ID` | 해당 **프로젝트** → Settings → General → **Project ID** |

**시크릿을 하나도 넣지 않으면** 이 워크플로는 **실행되지 않습니다**(실패로 빨간 X가 나오지 않게 처리해 두었습니다).  
Vercel 대시보드에서만 배포해도 되고, 나중에 시크릿을 넣고 Actions를 쓰면 됩니다.

---

## 5. 자주 나는 문제

| 현상 | 조치 |
|------|------|
| `npm ci` 실패 | `package-lock.json` 이 저장소에 포함돼 있는지 확인 |
| 빌드 오류 | 로컬에서 `npm run build` 가 통과하는지 먼저 확인 |
| Root가 상위 폴더 | Vercel에서 **Root Directory** 를 `tax-analyzer` 로 지정 |

---

## 로컬에서 Vercel CLI만 쓰고 싶을 때

```bash
npx vercel@latest login
npx vercel@latest link
npx vercel@latest --prod
```

`package.json` 에는 `vercel:login` / `vercel:link` / `vercel:deploy` 스크립트를 넣어 두었습니다.
