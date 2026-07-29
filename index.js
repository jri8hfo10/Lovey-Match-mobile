// Lovey Match — SillyTavern extension
// 최근 대화한 캐릭터를 Tinder 스타일 카드로 보여주고, "매칭"하면 그 채팅방으로 이동합니다.

(function () {
  const MAX_CARDS = 15;
  let profiles = [];
  let index = 0;
  let history = [];
  let overlayEl = null;
  let stackWrapEl = null;

  function ctx() {
    return SillyTavern.getContext();
  }

  // ---------- 데이터 준비 ----------

  function timeAgoLabel(ts) {
    if (!ts) return '';
    const diff = Date.now() - Number(ts);
    const min = 60000, hour = 60 * min, day = 24 * hour;
    if (diff < hour) return `${Math.max(1, Math.floor(diff / min))}분 전 대화 💬`;
    if (diff < day) return `${Math.floor(diff / hour)}시간 전 대화 💬`;
    const d = Math.floor(diff / day);
    if (d < 30) return `${d}일 전 대화 💬`;
    return `오래 전 대화 💬`;
  }

  function getUserAvatarUrl() {
    const c = ctx();
    try {
      const file = c.user_avatar; // SillyTavern의 전역 변수: 현재 선택된 페르소나 아바타 파일명
      if (!file) return 'img/ai4.png'; // ST 기본 유저 아바타
      if (typeof c.getThumbnailUrl === 'function') {
        return c.getThumbnailUrl('persona', file);
      }
      return `/User%20Avatars/${encodeURIComponent(file)}`;
    } catch (e) {
      console.warn('[Lovey Match] 유저 페르소나 아바타를 가져오지 못했어요', e);
      return 'img/ai4.png';
    }
  }

  function getAvatarUrl(avatarFile) {
    // 카드에서는 크게 보여주므로 목록용 저화질 썸네일 대신 원본 이미지를 사용합니다.
    if (!avatarFile || avatarFile === 'none') {
      return getThumbnail(avatarFile); // 기본 아바타는 썸네일 경로가 처리해줍니다
    }
    return `/characters/${encodeURIComponent(avatarFile)}`;
  }

  function getThumbnail(avatarFile) {
    const c = ctx();
    try {
      if (typeof c.getThumbnailUrl === 'function') {
        return c.getThumbnailUrl('avatar', avatarFile);
      }
    } catch (e) { /* fall through */ }
    return `/thumbnail?type=avatar&file=${encodeURIComponent(avatarFile)}`;
  }

  function shortQuote(character) {
    const raw = (character.first_mes || (character.data && character.data.first_mes) || '').toString();
    const clean = raw.replace(/[{}<>*]/g, '').replace(/\s+/g, ' ').trim();
    if (!clean) return '오랜만이에요, 대화 이어가볼까요?';
    return clean.length > 46 ? clean.slice(0, 46) + '…' : clean;
  }

  function buildProfiles() {
    const c = ctx();
    const chars = Array.isArray(c.characters) ? c.characters : [];
    return chars
      .map((character, chid) => ({ character, chid }))
      .filter(({ character }) => Number(character.date_last_chat) > 0)
      .sort((a, b) => Number(b.character.date_last_chat) - Number(a.character.date_last_chat))
      .slice(0, MAX_CARDS)
      .map(({ character, chid }) => ({
        chid,
        name: character.name,
        sub: timeAgoLabel(character.date_last_chat),
        quote: shortQuote(character),
        image: getAvatarUrl(character.avatar),
      }));
  }

  // ---------- 마크업 ----------

  function injectMarkup() {
    if (document.getElementById('loveyMatchOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'loveyMatchOverlay';
    overlay.innerHTML = `
      <div class="lm-phone">
        <div class="lm-header">
          <div class="lm-brand"><span class="lm-dot"></span>Lovey Match</div>
          <button class="lm-skip" id="lm_skip_btn" type="button">지금은 넘어갈게요</button>
        </div>
        <div class="lm-stack-wrap" id="lm_stack_wrap"></div>
        <div class="lm-actions">
          <button class="lm-btn-rewind" id="lm_btn_rewind" title="되돌리기">↺</button>
          <button class="lm-btn-nope" id="lm_btn_nope" title="패스">✕</button>
          <button class="lm-btn-like" id="lm_btn_like" title="매칭">♥</button>
        </div>
      </div>
      <div class="lm-match-overlay" id="lm_match_overlay">
        <div class="lm-match-card">
          <div class="lm-emoji">💕</div>
          <h2>It's a Match!</h2>
          <p id="lm_match_text">서로 마음에 들었어요</p>
          <div class="lm-match-avatars">
            <img id="lm_my_avatar" src="" alt="">
            <img id="lm_match_avatar" src="" alt="">
          </div>
          <button class="lm-continue-btn" id="lm_continue_btn">채팅 이어가기 ✨</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlayEl = overlay;
    stackWrapEl = overlay.querySelector('#lm_stack_wrap');

    lockBackgroundAndSize();
    window.addEventListener('resize', lockBackgroundAndSize);
    window.addEventListener('orientationchange', lockBackgroundAndSize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', lockBackgroundAndSize);
      window.visualViewport.addEventListener('scroll', lockBackgroundAndSize);
    }

    overlay.querySelector('#lm_skip_btn').onclick = closeOverlay;
    overlay.querySelector('#lm_btn_like').onclick = () => {
      const card = stackWrapEl.querySelector('.lm-card');
      if (card) swipeOut(card, 1, profiles[index]);
    };
    overlay.querySelector('#lm_btn_nope').onclick = () => {
      const card = stackWrapEl.querySelector('.lm-card');
      if (card) swipeOut(card, -1, profiles[index]);
    };
    overlay.querySelector('#lm_btn_rewind').onclick = () => {
      if (history.length) { index = history.pop(); renderStack(); }
    };
    overlay.querySelector('#lm_continue_btn').onclick = () => {
      overlay.querySelector('#lm_match_overlay').classList.remove('lm-show');
      const p = overlay.dataset.pendingChid;
      closeOverlay();
      if (p !== undefined && p !== '') {
        openCharacterChat(Number(p));
      }
    };
  }

  // 모바일 웹뷰에서 position:fixed가 "현재 보이는 화면"이 아니라
  // "문서 전체" 기준으로 계산되는 버그가 있어, 실제 픽셀 좌표/크기를
  // 강제로 인라인 스타일에 박아 넣어 항상 화면 전체를 덮도록 합니다.
  function lockBackgroundAndSize() {
    if (!overlayEl) return;
    const vv = window.visualViewport;
    const w = vv ? vv.width : window.innerWidth;
    const h = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    const left = vv ? vv.offsetLeft : 0;

    window.scrollTo(0, 0);

    overlayEl.style.position = 'fixed';
    overlayEl.style.top = top + 'px';
    overlayEl.style.left = left + 'px';
    overlayEl.style.width = w + 'px';
    overlayEl.style.height = h + 'px';
    overlayEl.style.margin = '0';
    overlayEl.style.inset = 'auto';

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
  }

  function unlockBackground() {
    window.removeEventListener('resize', lockBackgroundAndSize);
    window.removeEventListener('orientationchange', lockBackgroundAndSize);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', lockBackgroundAndSize);
      window.visualViewport.removeEventListener('scroll', lockBackgroundAndSize);
    }
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
  }

  function closeOverlay() {
    if (!overlayEl) return;
    overlayEl.classList.add('lm-hide');
    unlockBackground();
    setTimeout(() => overlayEl && overlayEl.remove(), 300);
  }

  function openCharacterChat(chid) {
    const c = ctx();
    try {
      if (typeof c.selectCharacterById === 'function') {
        c.selectCharacterById(chid);
        return;
      }
    } catch (e) { console.warn('[Lovey Match] selectCharacterById 실패', e); }
    // 폴백: 캐릭터 목록에서 아바타를 직접 클릭
    try {
      const avatarFile = c.characters[chid]?.avatar;
      const el = document.querySelector(`#rm_print_characters_block .character_select[data-avatar="${CSS.escape(avatarFile)}"]`);
      if (el) el.click();
    } catch (e) { console.warn('[Lovey Match] 캐릭터 채팅 이동 실패', e); }
  }

  // ---------- 카드 렌더링 (스와이프) ----------

  function renderStack() {
    if (!stackWrapEl) return;
    stackWrapEl.querySelectorAll('.lm-card, .lm-empty').forEach(el => el.remove());
    const visible = profiles.slice(index, index + 3);

    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'lm-empty';
      const hasAny = profiles.length > 0;
      empty.innerHTML = `
        <div class="lm-big">☁️💗</div>
        <h3>${hasAny ? '오늘의 카드를 모두 봤어요' : '최근 대화한 캐릭터가 없어요'}</h3>
        <div>${hasAny ? '새로고침하면 다시 볼 수 있어요' : '캐릭터와 먼저 대화를 시작해보세요'}</div>
        <button class="lm-enter-btn" id="lm_enter_btn">SillyTavern으로 들어가기</button>
      `;
      stackWrapEl.appendChild(empty);
      empty.querySelector('#lm_enter_btn').onclick = closeOverlay;
      return;
    }

    visible.slice().reverse().forEach((p, i) => {
      const depth = visible.length - 1 - i;
      const card = document.createElement('div');
      card.className = 'lm-card';
      card.style.zIndex = 10 - depth;
      card.style.transform = `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`;
      card.style.opacity = depth === 2 ? 0.6 : 1;
      card.innerHTML = `
        <div class="lm-photo" style="background-image:url('${p.image}')">
          <div class="lm-badge">${p.sub}</div>
          <div class="lm-stamp lm-like">MATCH</div>
          <div class="lm-stamp lm-nope">PASS</div>
          <div class="lm-info">
            <div class="lm-name-row"><span>${p.name}</span></div>
            <div class="lm-quote">“${p.quote}”</div>
          </div>
        </div>
      `;
      if (depth === 0) makeDraggable(card, p);
      stackWrapEl.appendChild(card);
    });
  }

  function makeDraggable(card, profile) {
    let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false;
    const likeStamp = card.querySelector('.lm-stamp.lm-like');
    const nopeStamp = card.querySelector('.lm-stamp.lm-nope');

    card.addEventListener('pointerdown', e => {
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      card.setPointerCapture(e.pointerId);
      card.style.transition = 'none';
    });
    card.addEventListener('pointermove', e => {
      if (!dragging) return;
      dx = e.clientX - startX; dy = e.clientY - startY;
      const rot = dx / 14;
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
      const ratio = Math.min(Math.abs(dx) / 120, 1);
      likeStamp.style.opacity = dx > 20 ? ratio : 0;
      nopeStamp.style.opacity = dx < -20 ? ratio : 0;
    });
    card.addEventListener('pointerup', () => {
      dragging = false;
      card.style.transition = '';
      if (dx > 110) swipeOut(card, 1, profile);
      else if (dx < -110) swipeOut(card, -1, profile);
      else { card.style.transform = ''; likeStamp.style.opacity = 0; nopeStamp.style.opacity = 0; }
      dx = 0; dy = 0;
    });
  }

  function swipeOut(card, dir, profile) {
    card.style.transform = `translate(${dir * 500}px, -40px) rotate(${dir * 30}deg)`;
    card.style.opacity = '0';
    history.push(index);
    index++;
    if (dir > 0) triggerMatch(profile);
    setTimeout(renderStack, 260);
  }

  function spawnMatchBurst() {
    const layer = document.createElement('div');
    layer.className = 'lm-match-burst';
    document.body.appendChild(layer);
    const emojis = ['💗', '💫', '🩵', '🩷'];
    const count = 30;
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      const startX = 8 + Math.random() * 84;   // vw
      const startY = 15 + Math.random() * 25;  // vh
      const dx = (Math.random() - 0.5) * 80;   // vw drift
      const dy = 45 + Math.random() * 55;      // vh fall
      const rot = (Math.random() - 0.5) * 420;
      const delay = Math.random() * 0.35;
      const dur = 1.1 + Math.random() * 0.7;
      s.style.left = startX + 'vw';
      s.style.top = startY + 'vh';
      s.style.fontSize = (16 + Math.random() * 20) + 'px';
      s.style.setProperty('--dx', dx + 'vw');
      s.style.setProperty('--dy', dy + 'vh');
      s.style.setProperty('--rot', rot + 'deg');
      s.style.animationDelay = delay + 's';
      s.style.animationDuration = dur + 's';
      layer.appendChild(s);
    }
    setTimeout(() => layer.remove(), 2300);
  }

  function triggerMatch(profile) {
    setTimeout(() => {
      const matchOverlay = overlayEl.querySelector('#lm_match_overlay');
      overlayEl.querySelector('#lm_match_text').textContent = `${profile.name}님과의 대화로 돌아갈까요?`;
      overlayEl.querySelector('#lm_my_avatar').src = getUserAvatarUrl();
      overlayEl.querySelector('#lm_match_avatar').src = profile.image;
      overlayEl.dataset.pendingChid = String(profile.chid);
      matchOverlay.classList.add('lm-show');
      spawnMatchBurst();
    }, 200);
  }

  // ---------- 진입점 ----------

  function openLoveyMatch() {
    injectMarkup();
    profiles = buildProfiles();
    index = 0;
    history = [];
    renderStack();
  }

  function addReopenButton() {
    if (document.getElementById('lm_reopen_btn')) return;
    const container = document.getElementById('extensionsMenu') || document.getElementById('rm_extensions_block');
    if (!container) return;
    const btn = document.createElement('div');
    btn.id = 'lm_reopen_btn';
    btn.className = 'list-group-item flex-container flexGap5 interactable';
    btn.title = '최근 대화 매칭 화면 다시 보기';
    btn.innerHTML = `<div class="fa-solid fa-heart extensionsMenuExtensionButton"></div><span>Lovey Match</span>`;
    btn.onclick = openLoveyMatch;
    container.appendChild(btn);
  }

  function init() {
    try {
      const c = ctx();
      const { eventSource, event_types } = c;
      if (eventSource && event_types && event_types.APP_READY) {
        eventSource.on(event_types.APP_READY, () => {
          addReopenButton();
          openLoveyMatch();
        });
        return;
      }
    } catch (e) {
      console.warn('[Lovey Match] getContext/eventSource 사용 불가, 지연 실행으로 대체', e);
    }
    // 폴백: 이벤트를 못 찾으면 잠시 뒤 실행
    setTimeout(() => { addReopenButton(); openLoveyMatch(); }, 1500);
  }

  if (window.jQuery) {
    jQuery(init);
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
