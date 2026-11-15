import { WEAPONS, WEAPON_LIST } from './weapons.js';
import { CONFIG } from './config.js';

// Cached-value DOM updates only. Element ids (Agent A index.html):
// health-bar health-num armor-wrap armor-bar ammo-mag ammo-reserve
// weapon-name weapon-mode grenade-count timer score phase-label money
// kill-feed radio-log crosshair hitmarker damage-arc prompt buy-menu
// buy-grid buy-money overlay-start overlay-pause round-banner banner-text
// banner-sub overlay-death death-info overlay-match match-info minimap
// Missing ids are guarded: nothing here throws.
const IDMAP = {
  'health-bar': 'healthFill', 'health-num': 'healthNum',
  'armor-wrap': 'armourBar', 'armor-bar': 'armourFill',
  'ammo-mag': 'ammoMag', 'ammo-reserve': 'ammoReserve',
  'weapon-name': 'weaponName', 'weapon-mode': 'fireMode',
  'grenade-count': 'grenadeCount', 'timer': 'timer',
  'phase-label': 'phaseLabel', 'round-label': 'roundLabel', 'money': 'money',
  'kill-feed': 'killFeed', 'radio-log': 'radioLog',
  'crosshair': 'crosshair', 'hitmarker': 'hitmarker',
  'damage-arc': 'damageArc', 'prompt': 'prompt',
  'buy-menu': 'overlayBuy', 'buy-grid': 'buyGrid',
  'buy-money': 'buyMoney', 'overlay-start': 'overlayStart',
  'overlay-pause': 'overlayPause', 'round-banner': 'overlayRound',
  'banner-text': 'roundBannerText', 'banner-sub': 'bannerSub',
  'overlay-death': 'overlayDeath', 'death-info': 'deathText',
  'overlay-match': 'overlayMatch', 'match-info': 'matchText',
  'flash-overlay': 'flashOverlay',
};
function $(id) { return document.getElementById(id); }
function setText(el, v) { if (el && el.textContent !== v) el.textContent = v; }
function setW(el, pct) { if (el) { const s = pct + '%'; if (el.style.width !== s) el.style.width = s; } }
function fmtTimer(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
// Weapon icons: 72x28 side-profile silhouettes, drawn once at buy build.
const ICONS = {
  ar77: [4, 12, 52, 3, 28, 9, 22, 5, 52, 11, 14, 4, 30, 14, 5, 5],
  vex9: [8, 12, 30, 3, 38, 11, 10, 5, 20, 9, 18, 5, 52, 11, 12, 4, 22, 14, 4, 5],
  longbow: [2, 12, 58, 2, 26, 6, 16, 4, 30, 10, 18, 5, 48, 11, 16, 4, 32, 15, 5, 5],
  breacher: [4, 11, 48, 4, 14, 16, 16, 4, 34, 9, 16, 5, 50, 11, 14, 4, 36, 14, 5, 5],
  p9: [20, 10, 30, 4, 24, 14, 6, 9, 32, 14, 8, 2],
  he: [26, 10, 20, 12, 44, 8, 6, 2],
  smoke: [28, 8, 16, 16, 30, 5, 12, 3, 28, 14, 16, 3],
  flash: [30, 8, 12, 16, 30, 12, 12, 2, 32, 5, 8, 3],
  kit: [22, 10, 28, 14, 30, 7, 12, 3, 34, 15, 4, 4],
};
function drawIcon(cv, id) {
  const g = cv.getContext('2d');
  g.fillStyle = '#e9e6df';
  if (id === 'helmet') {
    g.beginPath(); g.arc(36, 20, 11, Math.PI, 0); g.fill();
    g.fillRect(24, 20, 24, 3); return;
  }
  const rs = ICONS[id]; if (!rs) return;
  for (let i = 0; i < rs.length; i += 4) g.fillRect(rs[i], rs[i + 1], rs[i + 2], rs[i + 3]);
  if (id === 'ar77' || id === 'vex9') {
    g.save(); g.translate(id === 'ar77' ? 40 : 28, 14); g.rotate(0.35); g.fillRect(-2, 0, 4, 9); g.restore();
  }
}

export function createHud(state, opts) {
  opts = opts || {};
  const el = {};
  const ids = ['health-bar', 'health-num', 'armor-wrap', 'armor-bar', 'ammo-mag', 'ammo-reserve', 'weapon-name', 'weapon-mode', 'grenade-count', 'timer', 'phase-label', 'round-label', 'money', 'kill-feed', 'radio-log', 'crosshair', 'hitmarker', 'damage-arc', 'prompt', 'buy-menu', 'buy-grid', 'buy-money', 'overlay-start', 'overlay-pause', 'round-banner', 'banner-text', 'banner-sub', 'overlay-death', 'death-info', 'overlay-match', 'match-info', 'flash-overlay'];
  for (let i = 0; i < ids.length; i++) el[ids[i]] = $(IDMAP[ids[i]] || ids[i]);
  const cache = {};
  let eventSeen = 0, hitT = null, arcT = null, bannerT = null;
  const ec = (CONFIG && CONFIG.econ) || {};
  const PRICE = { plating: ec.plating || 650, kit: ec.kit || 400, helmet: ec.helmet || 350 };
  let buyOpen = false, buyBuilt = false, kitHidden = null;

  function phaseText() {
    if (state.phase === 'buy') return 'BUY';
    if (state.phase === 'live') return 'LIVE';
    if (state.phase === 'planted') return 'BOMB PLANTED';
    if (state.phase === 'roundEnd') return 'ROUND END';
    if (state.phase === 'matchEnd') return 'MATCH END';
    return 'MENU';
  }
  function feed() {
    const evs = state.events || [];
    const kills = [], radios = [];
    for (let i = evs.length - 1; i >= 0 && (kills.length < 4 || radios.length < 3); i--) {
      const e = evs[i];
      if (e.kind === 'kill' && kills.length < 4) kills.push(e.text.slice(0, 40));
      else if (e.kind === 'callout' && radios.length < 3) radios.push(e.text.slice(0, 40));
    }
    if (el['kill-feed']) {
      const html = kills.map(t => '<div>' + t + '</div>').join('');
      if (cache.feed !== html) { cache.feed = html; el['kill-feed'].innerHTML = html; }
    }
    if (el['radio-log']) {
      const html = radios.map(t => '<div>' + t + '</div>').join('');
      if (cache.radio !== html) { cache.radio = html; el['radio-log'].innerHTML = html; }
    }
    eventSeen = evs.length;
  }
  function buildBuy() {
    if (!el['buy-grid'] || buyBuilt) return;
    buyBuilt = true;
    const grid = el['buy-grid'];
    for (let i = 0; i < grid.children.length; i++) {
      const it = grid.children[i], id = it.dataset.item;
      if (!WEAPONS[id] || it.querySelector('.wicon')) continue;
      const cv = document.createElement('canvas');
      cv.className = 'wicon'; cv.width = 72; cv.height = 28;
      drawIcon(cv, id); it.insertBefore(cv, it.firstChild);
    }
    const extra = [
      ['smoke', '7 · Smoke', WEAPONS.smoke ? WEAPONS.smoke.price : 300, 'smoke wall · 15 s'],
      ['flash', '8 · Flash', WEAPONS.flash ? WEAPONS.flash.price : 200, 'blind 1.5 s'],
      ['kit', '9 · Defuse Kit', PRICE.kit, 'defuse 10 s → 5 s'],
      ['helmet', '0 · Helmet', PRICE.helmet, 'headshot cap ×2'],
    ];
    for (let i = 0; i < extra.length; i++) {
      const e = extra[i];
      const d = document.createElement('div');
      d.className = 'buyItem'; d.dataset.item = e[0];
      const cv = document.createElement('canvas');
      cv.className = 'wicon'; cv.width = 72; cv.height = 28;
      drawIcon(cv, e[0]); d.appendChild(cv);
      d.insertAdjacentHTML('beforeend', '<b>' + e[1] + '</b><span>$' + e[2] + '</span><small>' + e[3] + '</small>');
      d.addEventListener('click', () => { if (opts.onBuy) opts.onBuy(e[0]); });
      if (e[0] === 'kit' && state.players[0].team !== 'harbour') { d.style.display = 'none'; kitHidden = true; }
      grid.appendChild(d);
    }
  }
  function refreshBuy() {
    if (!buyOpen || !el['buy-grid']) return;
    const p = state.players[0];
    const owned = { p9: true };
    if (p.weapon) owned[p.weapon] = true;
    const hideKit = p.team !== 'harbour';
    if (kitHidden !== hideKit) { kitHidden = hideKit; const k = el['buy-grid'].querySelector('[data-item="kit"]'); if (k) k.style.display = hideKit ? 'none' : ''; }
    const items = el['buy-grid'].children;
    for (let i = 0; i < items.length; i++) {
      const id = items[i].dataset.item, wp = WEAPONS[id];
      const ownedNow = id === 'plating' ? p.armor > 0 : id === 'kit' ? !!p.hasKit : id === 'helmet' ? !!p.helmet : id === 'smoke' ? !!p.hasSmoke : id === 'flash' ? (p.flashCount || 0) > 0 : !!owned[id];
      const price = PRICE[id] !== undefined ? PRICE[id] : (wp ? wp.price : 0);
      items[i].classList.toggle('owned', ownedNow);
      items[i].classList.toggle('cant', p.money < price && !ownedNow);
    }
    setText(el['buy-money'], '$' + p.money);
  }

  const hud = {
    update() {
      const p = state.players[0];
      if (!p) return;
      setW(el['health-bar'], Math.max(0, p.hp));
      setText(el['health-num'], String(Math.max(0, Math.ceil(p.hp))));
      if (el['armor-wrap']) el['armor-wrap'].style.display = p.armor > 0 ? 'block' : 'none';
      setW(el['armor-bar'], Math.max(0, p.armor));
      setText(el['ammo-mag'], String(p.mag));
      setText(el['ammo-reserve'], ' / ' + String(p.reserve));
      setText($('armourNum'), p.armor > 0 ? String(Math.max(0, Math.ceil(p.armor))) : '');
      const wp = WEAPONS[p.weapon];
      setText(el['weapon-name'], wp ? wp.name : p.weapon);
      setText(el['weapon-mode'], wp ? (wp.auto ? 'AUTO' : 'SEMI') : '');
      setText(el['grenade-count'], 'HE ' + (p.hasHE ? 1 : 0) + ' · SMK ' + (p.hasSmoke ? 1 : 0) + ' · FLS ' + (p.flashCount || 0));
      setText(el['timer'], fmtTimer(state.phaseTime));
      if (el.timer) el.timer.classList.toggle('low', state.phaseTime < 10 && (state.phase === 'live' || state.phase === 'planted'));
      setText($('scoreTide'), String(state.score.tide));
      setText($('scoreHarbour'), String(state.score.harbour));
      setText(el['round-label'], 'ROUND ' + state.round + ' OF 9');
      setText(el['phase-label'], phaseText());
      setText(el.money, '$' + p.money);
      if (el.crosshair && opts.getSpread) {
        const gap = Math.round(4 + Math.min(48, opts.getSpread() * 900));
        if (cache.gap !== gap) {
          cache.gap = gap;
          el.crosshair.style.setProperty('--gap', gap + 'px');
        }
      }
      if (hitT && performance.now() - hitT > 90 && el.hitmarker) { el.hitmarker.className = ''; el.hitmarker.style.display = 'none'; hitT = null; }
      if (arcT && performance.now() - arcT > 1000 && el['damage-arc']) { el['damage-arc'].style.display = 'none'; arcT = null; }
      if (bannerT && performance.now() - bannerT > 5000 && el['round-banner']) { el['round-banner'].style.display = 'none'; bannerT = null; }
      if (el['overlay-start']) el['overlay-start'].style.display = state.phase === 'menu' ? 'flex' : 'none';
      if (el['flash-overlay']) {
        const fb = state.flashBlind;
        let o = 0;
        if (fb && state.time < fb.until) o = fb.strength * (fb.until - state.time) / ((fb.until - fb.start) || 1);
        if (cache.flash !== o) { cache.flash = o; el['flash-overlay'].style.opacity = String(Math.max(0, Math.min(1, o))); }
      }
      if ((state.events || []).length !== eventSeen) feed();
      refreshBuy();
    },
    showBuy(open) {
      buyOpen = open;
      if (open) buildBuy();
      if (el['buy-menu']) el['buy-menu'].style.display = open ? 'flex' : 'none';
      if (open) refreshBuy();
    },
    showBanner(text, sub) {
      if (!el['round-banner']) return;
      setText(el['banner-text'], text);
      setText(el['banner-sub'], sub || '');
      el['round-banner'].style.display = 'flex';
      bannerT = performance.now();
    },
    showDeath(info) {
      if (el['overlay-death']) el['overlay-death'].style.display = 'flex';
      setText(el['death-info'], info || '');
    },
    hideDeath() { if (el['overlay-death']) el['overlay-death'].style.display = 'none'; },
    showMatch(winner) {
      if (el['overlay-match']) el['overlay-match'].style.display = 'flex';
    },
    prompt(text) {
      if (!el.prompt) return;
      if (text) { el.prompt.style.display = 'block'; setText($('promptText'), text); }
      else el.prompt.style.display = 'none';
    },
    hitmark(kind) {
      if (!el.hitmarker) return;
      el.hitmarker.className = kind === 'kill' ? 'kill' : kind === 'headshot' ? 'headshot' : 'hit';
      el.hitmarker.style.display = 'block';
      hitT = performance.now();
    },
    damageFrom(angleDeg) {
      if (!el['damage-arc']) return;
      el['damage-arc'].style.transform = 'rotate(' + Math.round(angleDeg) + 'deg)';
      el['damage-arc'].style.display = 'block';
      el['damage-arc'].style.opacity = '1';
      arcT = performance.now();
    },
    setPaused(paused) { if (el['overlay-pause']) el['overlay-pause'].style.display = paused ? 'flex' : 'none'; },
    isBuyOpen() { return buyOpen; },
    showSpectate(text) {
      const b = $('spectateBar'); if (!b) return;
      setText(b, text || ''); b.style.display = 'block';
    },
    hideSpectate() { const b = $('spectateBar'); if (b) b.style.display = 'none'; },
    showScoreboard() {
      const m = el['match-info']; if (!m) return;
      const w = state.matchWinner === 'tide' ? 'TIDE' : 'HARBOUR';
      const rows = state.players.slice().sort((a, b) => b.kills - a.kills);
      let h = '<div>' + w + ' WINS ' + state.score.tide + ' — ' + state.score.harbour + ' · ' + (state.roundReason || '') + '</div><table>';
      for (let i = 0; i < rows.length; i++) { const p = rows[i];
        h += '<tr' + (p.id === state.lastMvp ? ' class="mvp"' : '') + '><td>' + p.name + '</td><td>' + (p.team === 'tide' ? 'TIDE' : 'HARBOUR') + '</td><td>' + p.kills + '</td><td>' + p.deaths + '</td><td>$' + p.money + '</td></tr>'; }
      h += '</table>';
      const mv = state.lastMvp >= 0 ? state.players[state.lastMvp] : null;
      if (mv) h += '<div>★ MVP — ' + mv.name + ' · ' + mv.kills + ' kills</div>';
      m.innerHTML = h;
    },
  };
  return hud;
}
