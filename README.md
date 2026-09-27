# AI RUN : 바이러스 탈출

HTML Canvas 기반 3레인 러닝 게임입니다. 바이러스를 피하고 백신·데이터를 모으며 오래 살아남는 것이 목표입니다.

## 실행 방법

1. `index.html`을 더블클릭하거나 브라우저로 엽니다.
2. 화면을 한 번 클릭하면 배경음악·효과음이 재생됩니다.
3. **← →** (또는 **A D**)로 레인 이동, **↑** 또는 **Space**로 점프합니다.

## 폴더 구조

- `index.html`, `style.css`, `game.js` — 게임 본체
- `images/sprites/` — 캐릭터 스프라이트 (정면·달리기·회복·피격)
- `audio/` — BGM·효과음 (CC0, `SOURCES.txt` 참고)
- `tools/SliceSpriteSheets.ps1` — 스프라이트 시트 분할 스크립트

## 스프라이트 시트 다시 자르기

상위 폴더에 그리드 PNG(정면·달리기·회복·장애물)를 두고 PowerShell에서:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\SliceSpriteSheets.ps1
```

## Vercel 배포

GitHub 저장소와 연결해 정적 사이트로 배포합니다.

1. [Vercel](https://vercel.com) 로그인 (GitHub 계정 연동)
2. **Add New → Project** → `nov1802-svg/ai-run` Import
3. 설정 확인 후 **Deploy**
   - Framework Preset: **Other**
   - Build Command: *(비움)*
   - Output Directory: `.` (루트)
4. 완료 후 `https://ai-run-*.vercel.app` 주소에서 플레이

저장소에 `vercel.json`이 포함되어 있어 별도 빌드 없이 `index.html`이 바로 서비스됩니다.

## 라이선스

게임 코드: 이 저장소 기준 자유 이용 (학습·포트폴리오용).

음원: `audio/SOURCES.txt`의 CC0 출처를 따릅니다. 캐릭터 이미지는 프로젝트에 포함된 에셋입니다.
