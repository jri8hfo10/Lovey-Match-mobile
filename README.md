# Lovey Match — SillyTavern 확장

최근 대화한 캐릭터를 Tinder 스타일 카드로 보여주고, ♥(매칭)을 누르면 그 캐릭터의 채팅방으로 이동하는 시작 화면 확장입니다.

## 설치

1. SillyTavern 폴더에서 `public/scripts/extensions/third-party/` 안에 `lovey-match` 폴더를 만들고 이 3개 파일(`manifest.json`, `index.js`, `style.css`)을 넣습니다.
   - 또는 SillyTavern 안의 확장 메뉴 → "Install extension"에 이 폴더를 깃 저장소로 올려서 URL로 설치할 수도 있습니다.
2. SillyTavern을 새로고침(F5) 하면 자동으로 이 화면이 뜹니다.
3. 오른쪽 위 "지금은 넘어갈게요"를 누르면 평소 화면으로 들어갈 수 있고, 확장 메뉴(마법봉 아이콘)에 생긴 "Lovey Match" 항목을 눌러 언제든 다시 열 수 있습니다.

## 동작

- **카드 목록**: 최근 대화 기록이 있는 캐릭터를 최근 순으로 최대 15명 보여줍니다 (대화 기록이 없는 캐릭터는 카드에 포함되지 않아요).
- **✕ (패스)**: 다음 카드로 넘어갑니다. 이번 세션에서만 건너뛰고, 새로고침하면 다시 보입니다.
- **♥ (매칭)**: "It's a match" 모달이 뜨고, "채팅 이어가기"를 누르면 그 캐릭터의 채팅방으로 이동합니다.
- **↺ (되돌리기)**: 방금 넘긴 카드로 돌아갑니다.

## 확인이 필요한 부분 (SillyTavern 버전에 따라 다를 수 있어요)

이 확장은 SillyTavern의 `getContext()` 공개 API를 사용합니다. 다만 아래 두 가지는 실제 환경에서 한 번 테스트해보시는 게 좋아요:

- `character.date_last_chat` 필드: 캐릭터 목록을 "최근 대화순"으로 정렬할 때 쓰는 값이라고 알고 있는데, 만약 카드가 안 뜨거나 순서가 이상하면 브라우저 개발자도구(F12) 콘솔에서 `SillyTavern.getContext().characters[0]` 를 찍어서 실제 필드명을 확인해주세요.
- `selectCharacterById(chid)` 호출로 채팅방 이동이 안 되면, index.js 안의 `openCharacterChat` 함수에 폴백 코드가 있지만 그것도 실패할 수 있어요 — 그럴 땐 알려주시면 캐릭터 목록 DOM을 직접 클릭하는 방식으로 다시 맞춰드릴게요.

문제가 생기면 위 콘솔 로그(`[Lovey Match] ...`로 시작하는 경고)를 캡처해서 보여주시면 바로 고쳐드릴 수 있어요.
