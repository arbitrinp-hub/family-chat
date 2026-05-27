'use strict';

// ── DATA ────────────────────────────────────────────────────────────────────

const ME = { id: 'me', name: 'Я', initials: 'Я', color: 'green' };

const MEMBERS = [
  { id: 'mama',   name: 'Мама',    initials: 'МА', color: 'purple', online: true,  seen: 'онлайн' },
  { id: 'papa',   name: 'Папа',    initials: 'ПА', color: 'orange', online: false, seen: '30 мин назад' },
  { id: 'sestra', name: 'Сестра',  initials: 'СЕ', color: 'coral',  online: true,  seen: 'онлайн' },
  { id: 'brat',   name: 'Брат',    initials: 'БР', color: 'blue',   online: false, seen: 'вчера' },
  { id: 'babush', name: 'Бабушка', initials: 'Б',  color: 'teal',   online: false, seen: '3 ч назад' },
];

const CHATS = [
  {
    id: 'group', name: 'Общий чат', emoji: '👨‍👩‍👧', isGroup: true,
    unread: 3, pinned: true,
    messages: [
      { id: 1, text: 'Ужин в 19:00, все дома? 🍽️', from: 'mama', time: '19:42' },
      { id: 2, text: 'Да, уже еду!',                from: 'papa', time: '19:44' },
      { id: 3, text: 'Задержусь на 10 минут 😅',    from: 'sestra', time: '19:45' },
      { id: 4, text: 'Я дома, жду всех!',           from: 'me',   time: '19:46' },
    ]
  },
  {
    id: 'mama', name: 'Мама', memberId: 'mama', isGroup: false,
    unread: 0, pinned: false,
    messages: [
      { id: 1, text: 'Мам, купи торт к ужину?', from: 'me',   time: '18:10' },
      { id: 2, text: 'Хорошо, привезу 🍰',       from: 'mama', time: '18:15' },
    ]
  },
  {
    id: 'papa', name: 'Папа', memberId: 'papa', isGroup: false,
    unread: 0, pinned: false,
    messages: [
      { id: 1, text: 'Выезжаю, буду через 30 мин', from: 'papa', time: '17:50' },
      { id: 2, text: 'Хорошо, ждём! 👍',           from: 'me',   time: '17:51' },
    ]
  },
  {
    id: 'sestra', name: 'Сестра', memberId: 'sestra', isGroup: false,
    unread: 1, pinned: false,
    messages: [
      { id: 1, text: 'Посмотри какое видео 😂', from: 'sestra', time: 'Вчера' },
    ]
  },
];

// ── STATE ────────────────────────────────────────────────────────────────────

let activeScreen = 'home';
let activeChatId = null;
let activeTab = 'chats';
let deferredInstall = null;

// ── HELPERS ──────────────────────────────────────────────────────────────────

function member(id) { return MEMBERS.find(m => m.id === id); }
function chat(id)   { return CHATS.find(c => c.id === id); }

function now() {
  const d = new Date();
  return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
}

function avatarEl(m, size = '') {
  const div = document.createElement('div');
  div.className = `av av-${m.color}${size ? ' ' + size : ''}`;
  div.textContent = m.emoji || m.initials;
  return div;
}

function el(tag, cls, html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

// ── SCREENS ──────────────────────────────────────────────────────────────────

function go(screen, opts = {}) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const s = document.getElementById('screen-' + screen);
  if (!s) return;
  s.classList.add('active');
  if (screen === 'chat' || screen === 'members') s.classList.add('slide-in');
  activeScreen = screen;
  if (opts.chatId) {
    activeChatId = opts.chatId;
    renderChat(opts.chatId);
  }
}

// ── CHAT LIST ─────────────────────────────────────────────────────────────────

function renderChatList() {
  const pinned = CHATS.filter(c => c.pinned);
  const rest   = CHATS.filter(c => !c.pinned);
  const wrap = document.getElementById('chat-list');
  wrap.innerHTML = '';

  function addRow(c) {
    const last = c.messages[c.messages.length - 1];
    const fromMember = last.from !== 'me' ? member(last.from) : null;
    const preview = fromMember ? `${fromMember.name}: ${last.text}` : last.text;

    const row = el('div', 'chat-row');
    row.onclick = () => go('chat', { chatId: c.id });

    const avContainer = document.createElement('div');
    if (c.isGroup) {
      const av = el('div', 'av av-teal');
      av.textContent = c.emoji;
      avContainer.appendChild(av);
    } else {
      const m = member(c.memberId);
      avContainer.appendChild(avatarEl(m));
    }

    const info = el('div', 'chat-info');
    info.innerHTML = `<div class="chat-name">${c.name}</div>
      <div class="chat-preview">${preview}</div>`;

    const meta = el('div', 'chat-meta');
    meta.innerHTML = `<span class="chat-time">${last.time}</span>`;
    if (c.unread > 0) {
      const b = el('span', 'badge', String(c.unread));
      meta.appendChild(b);
    }

    row.appendChild(avContainer);
    row.appendChild(info);
    row.appendChild(meta);
    wrap.appendChild(row);
  }

  if (pinned.length) {
    wrap.appendChild(el('div', 'section-hdr', 'Закреплённые'));
    pinned.forEach(addRow);
  }
  wrap.appendChild(el('div', 'section-hdr', 'Личные'));
  rest.forEach(addRow);
}

// ── CHAT VIEW ─────────────────────────────────────────────────────────────────

function renderChat(chatId) {
  const c = chat(chatId);
  if (!c) return;

  c.unread = 0;
  renderChatList();

  // topbar
  const tb = document.getElementById('chat-topbar');
  const avDiv = document.createElement('div');
  if (c.isGroup) {
    const av = el('div', 'av av-teal');
    av.textContent = c.emoji;
    avDiv.appendChild(av);
  } else {
    avDiv.appendChild(avatarEl(member(c.memberId)));
  }

  const sub = c.isGroup
    ? `${MEMBERS.length} участников`
    : (member(c.memberId).online ? '<span style="color:var(--green)">онлайн</span>' : member(c.memberId).seen);

  tb.innerHTML = `
    <button class="back-btn" onclick="go('home')" aria-label="Назад">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px"><polyline points="15 18 9 12 15 6"/></svg>
    </button>`;
  tb.appendChild(avDiv);
  tb.innerHTML += `<div style="flex:1"><div class="topbar-title">${c.name}</div><div class="topbar-sub">${sub}</div></div>`;

  // messages
  renderMessages(chatId);

  // focus input
  setTimeout(() => {
    const inp = document.getElementById('chat-input');
    if (inp) inp.focus();
  }, 300);
}

function renderMessages(chatId) {
  const c = chat(chatId);
  const wrap = document.getElementById('msg-list');
  wrap.innerHTML = '';

  c.messages.forEach(msg => {
    const isOut = msg.from === 'me';
    const row = el('div', `msg ${isOut ? 'out' : 'in'}`);

    if (!isOut && c.isGroup) {
      const m = member(msg.from);
      if (m) row.appendChild(avatarEl(m, 'sm'));
    }

    const bwrap = el('div');
    if (!isOut && c.isGroup && member(msg.from)) {
      bwrap.innerHTML = `<div class="msg-sender">${member(msg.from).name}</div>`;
    }
    const bubble = el('div', 'bubble', msg.text);
    bwrap.appendChild(bubble);
    row.appendChild(bwrap);

    const t = el('span', 'msg-time', msg.time);
    row.appendChild(t);

    wrap.appendChild(row);
  });

  wrap.scrollTop = wrap.scrollHeight;
}

function sendMessage() {
  const inp = document.getElementById('chat-input');
  const text = inp.value.trim();
  if (!text || !activeChatId) return;

  const c = chat(activeChatId);
  c.messages.push({ id: Date.now(), text, from: 'me', time: now() });
  inp.value = '';

  renderMessages(activeChatId);
  renderChatList();
}

// ── MEMBERS ───────────────────────────────────────────────────────────────────

function renderMembers() {
  const wrap = document.getElementById('members-list');
  wrap.innerHTML = '';

  MEMBERS.forEach(m => {
    const row = el('div', 'member-row');

    const avWrap = el('div', 'av-wrap');
    avWrap.appendChild(avatarEl(m, 'lg'));
    if (m.online) {
      avWrap.appendChild(el('div', 'online-dot'));
    }

    const info = el('div', 'chat-info');
    info.innerHTML = `<div class="chat-name">${m.name}</div>
      <div class="chat-preview" style="color:${m.online ? 'var(--green)' : 'var(--text3)'}">${m.seen}</div>`;

    const btn = el('button', 'back-btn');
    btn.setAttribute('aria-label', 'Написать');
    btn.style.color = 'var(--green)';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    btn.onclick = () => {
      const c = CHATS.find(ch => ch.memberId === m.id);
      if (c) go('chat', { chatId: c.id });
    };

    row.appendChild(avWrap);
    row.appendChild(info);
    row.appendChild(btn);
    wrap.appendChild(row);
  });
}

// ── TABS ──────────────────────────────────────────────────────────────────────

function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });

  const home = document.getElementById('screen-home');
  const membersSection = document.getElementById('home-members');
  const chatsSection   = document.getElementById('home-chats');
  const settingsSection = document.getElementById('home-settings');

  [membersSection, chatsSection, settingsSection].forEach(s => s.style.display = 'none');

  if (tab === 'chats')    { chatsSection.style.display = 'flex'; }
  if (tab === 'members')  { membersSection.style.display = 'flex'; renderMembers(); }
  if (tab === 'settings') { settingsSection.style.display = 'flex'; }
}

// ── INSTALL BANNER ────────────────────────────────────────────────────────────

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  const banner = document.getElementById('install-banner');
  banner.style.display = 'flex';
});

function installApp() {
  if (deferredInstall) {
    deferredInstall.prompt();
    deferredInstall.userChoice.then(() => {
      document.getElementById('install-banner').style.display = 'none';
    });
  }
}

// iOS install hint
function checkIOSInstall() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone;
  if (isIOS && !isStandalone) {
    const banner = document.getElementById('install-banner');
    banner.querySelector('span').textContent = 'Нажми «Поделиться» → «На экран Домой» для установки';
    banner.style.display = 'flex';
    banner.querySelector('button').textContent = '✕';
    banner.querySelector('button').onclick = () => banner.style.display = 'none';
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }

  // enter key to send
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  renderChatList();
  go('home');
  setTab('chats');
  checkIOSInstall();
});
