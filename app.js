'use strict';

const SUPABASE_URL = 'https://flbixbsdexquntyvznma.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gPF-HVbUXEM82T-a90hsng_ILvoRRkY';

// ── SUPABASE CLIENT ──────────────────────────────────────────────────────────

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── STATE ────────────────────────────────────────────────────────────────────

let ME = null;
let MEMBERS = [];
let activeChatId = 'group';
let msgSubscription = null;
let deferredInstall = null;

// ── COLORS ───────────────────────────────────────────────────────────────────

const COLORS = ['purple','orange','coral','teal','blue','green'];
function randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }
function initials(name) {
  return name.trim().split(/\s+/).map(w => w[0].toUpperCase()).slice(0,2).join('');
}

// ── TIME ─────────────────────────────────────────────────────────────────────

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'только что';
  if (diff < 3600000) return Math.floor(diff/60000) + ' мин';
  if (d.toDateString() === now.toDateString()) {
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2,'0');
  }
  return d.getDate() + '.' + String(d.getMonth()+1).padStart(2,'0');
}

// ── DOM HELPERS ──────────────────────────────────────────────────────────────

function el(tag, cls, html='') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function go(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const s = document.getElementById('screen-' + screen);
  if (s) { s.classList.add('active'); }
}

function setTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.getElementById('home-chats').style.display    = tab === 'chats'    ? 'flex' : 'none';
  document.getElementById('home-members').style.display  = tab === 'members'  ? 'flex' : 'none';
  document.getElementById('home-settings').style.display = tab === 'settings' ? 'flex' : 'none';
  if (tab === 'members') renderMembers();
}

// ── AUTH / LOGIN ─────────────────────────────────────────────────────────────

async function checkInvite() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('invite');
  if (!code) return null;

  const { data } = await sb.from('users').select('*').eq('invite_code', code).single();
  return data;
}

async function login() {
  const name = document.getElementById('login-name').value.trim();
  if (!name) return;

  const params = new URLSearchParams(window.location.search);
  const code = params.get('invite');

  const color = randomColor();
  const id = 'user_' + Date.now();
  const ini = initials(name);

  let approved = false;

  // Проверяем — есть ли уже пользователи (первый = админ, сразу approved)
  const { data: existing } = await sb.from('users').select('id').limit(1);
  if (!existing || existing.length === 0) {
    approved = true; // первый пользователь — администратор
  } else if (code) {
    // проверяем инвайт
    const { data: inv } = await sb.from('users').select('*').eq('invite_code', code).single();
    if (inv && !inv.approved) {
      // это зарезервированный слот — обновляем
      await sb.from('users').update({ name, initials: ini, color, approved: true, invite_code: null })
        .eq('invite_code', code);
      ME = { id: inv.id, name, initials: ini, color, approved: true };
      localStorage.setItem('me', JSON.stringify(ME));
      startApp();
      return;
    }
  }

  const { data: user, error } = await sb.from('users').insert({
    id, name, initials: ini, color, approved, online: true
  }).select().single();

  if (error) { alert('Ошибка: ' + error.message); return; }

  ME = user;
  localStorage.setItem('me', JSON.stringify(ME));

  if (!approved) {
    go('pending');
    // Подписываемся на одобрение
    sb.channel('approval').on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${ME.id}` },
      payload => {
        if (payload.new.approved) {
          ME.approved = true;
          localStorage.setItem('me', JSON.stringify(ME));
          startApp();
        }
      }
    ).subscribe();
    return;
  }

  startApp();
}

// ── INVITE ───────────────────────────────────────────────────────────────────

async function createInvite() {
  const code = Math.random().toString(36).slice(2, 10);
  const id = 'invite_' + Date.now();
  await sb.from('users').insert({
    id, name: 'Ожидает...', initials: '?', color: 'gray',
    approved: false, invite_code: code, online: false
  });
  const link = window.location.origin + window.location.pathname + '?invite=' + code;
  document.getElementById('invite-link').value = link;
  document.getElementById('invite-box').style.display = 'block';
}

function copyInvite() {
  const inp = document.getElementById('invite-link');
  inp.select();
  navigator.clipboard.writeText(inp.value).then(() => {
    document.getElementById('copy-btn').textContent = '✓ Скопировано';
    setTimeout(() => document.getElementById('copy-btn').textContent = 'Копировать', 2000);
  });
}

// ── APP START ─────────────────────────────────────────────────────────────────

async function startApp() {
  go('home');
  setTab('chats');
  await loadMembers();
  await loadMessages(activeChatId);
  subscribeMessages();
  subscribeMembers();
  updateOnline(true);

  // Показать имя в настройках
  document.getElementById('my-name').textContent = ME.name;
  document.getElementById('my-av').textContent = ME.initials;
  document.getElementById('my-av').className = `av av-${ME.color} lg`;

  // Показать кнопку приглашения только админу (первому пользователю)
  const { data } = await sb.from('users').select('id').order('created_at').limit(1).single();
  if (data && data.id === ME.id) {
    document.getElementById('invite-section').style.display = 'block';
  }
}

// ── MEMBERS ───────────────────────────────────────────────────────────────────

async function loadMembers() {
  const { data } = await sb.from('users').select('*').eq('approved', true);
  MEMBERS = data || [];
  renderChatList();
}

function subscribeMembers() {
  sb.channel('members').on('postgres_changes',
    { event: '*', schema: 'public', table: 'users' },
    () => loadMembers()
  ).subscribe();
}

function updateOnline(online) {
  if (!ME) return;
  sb.from('users').update({ online, last_seen: new Date().toISOString() })
    .eq('id', ME.id).then(() => {});
}

function renderMembers() {
  const wrap = document.getElementById('members-list');
  wrap.innerHTML = '';
  MEMBERS.filter(m => m.id !== ME?.id).forEach(m => {
    const row = el('div', 'member-row');
    const avWrap = el('div', 'av-wrap');
    const av = el('div', `av av-${m.color} lg`, m.initials);
    avWrap.appendChild(av);
    if (m.online) avWrap.appendChild(el('div', 'online-dot'));
    const info = el('div', 'chat-info');
    const seen = m.online ? '<span style="color:var(--green)">онлайн</span>'
      : formatTime(m.last_seen);
    info.innerHTML = `<div class="chat-name">${m.name}</div>
      <div class="chat-preview">${seen}</div>`;
    const btn = el('button', 'back-btn');
    btn.setAttribute('aria-label', 'Написать');
    btn.style.color = 'var(--green)';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    btn.onclick = () => openChat(m.id);
    row.appendChild(avWrap);
    row.appendChild(info);
    row.appendChild(btn);
    wrap.appendChild(row);
  });
}

// ── CHAT LIST ─────────────────────────────────────────────────────────────────

function renderChatList() {
  const wrap = document.getElementById('chat-list');
  wrap.innerHTML = '';

  // Общий чат
  const groupRow = el('div', 'chat-row');
  groupRow.onclick = () => openChat('group');
  groupRow.innerHTML = `
    <div class="av av-teal">👨‍👩‍👧</div>
    <div class="chat-info">
      <div class="chat-name">Общий чат</div>
      <div class="chat-preview">${MEMBERS.length} участников</div>
    </div>`;
  wrap.appendChild(groupRow);

  // Личные чаты
  MEMBERS.filter(m => m.id !== ME?.id).forEach(m => {
    const row = el('div', 'chat-row');
    row.onclick = () => openChat(m.id);
    row.innerHTML = `
      <div class="av av-${m.color}">${m.initials}</div>
      <div class="chat-info">
        <div class="chat-name">${m.name}</div>
        <div class="chat-preview" style="color:${m.online ? 'var(--green)' : 'var(--text2)'}">
          ${m.online ? 'онлайн' : formatTime(m.last_seen)}
        </div>
      </div>`;
    wrap.appendChild(row);
  });
}

// ── MESSAGES ──────────────────────────────────────────────────────────────────

function chatId(userId) {
  if (userId === 'group') return 'group';
  return [ME.id, userId].sort().join('_');
}

async function openChat(userId) {
  activeChatId = userId;
  const isGroup = userId === 'group';
  const member = MEMBERS.find(m => m.id === userId);

  // Topbar
  const tb = document.getElementById('chat-topbar');
  const name = isGroup ? 'Общий чат' : (member?.name || '');
  const sub = isGroup ? `${MEMBERS.length} участников`
    : (member?.online ? '<span style="color:var(--green)">онлайн</span>' : formatTime(member?.last_seen));
  const avHtml = isGroup
    ? `<div class="av av-teal">👨‍👩‍👧</div>`
    : `<div class="av av-${member?.color}">${member?.initials}</div>`;

  tb.innerHTML = `
    <button class="back-btn" onclick="go('home')" aria-label="Назад">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    ${avHtml}
    <div style="flex:1"><div class="topbar-title">${name}</div><div class="topbar-sub">${sub}</div></div>`;

  go('chat');
  await loadMessages(userId);

  if (msgSubscription) { sb.removeChannel(msgSubscription); }
  subscribeMessages();
}

async function loadMessages(userId) {
  const cid = chatId(userId);
  const { data } = await sb.from('messages').select('*')
    .eq('chat_id', cid).order('created_at');
  renderMessages(data || []);
}

function subscribeMessages() {
  const cid = chatId(activeChatId);
  msgSubscription = sb.channel('msgs_' + cid).on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${cid}` },
    payload => appendMessage(payload.new)
  ).subscribe();
}

function renderMessages(msgs) {
  const wrap = document.getElementById('msg-list');
  wrap.innerHTML = '';
  msgs.forEach(m => appendMessage(m, false));
  wrap.scrollTop = wrap.scrollHeight;
}

function appendMessage(msg, scroll = true) {
  const wrap = document.getElementById('msg-list');
  const isOut = msg.from_id === ME?.id;
  const sender = MEMBERS.find(m => m.id === msg.from_id);
  const isGroup = activeChatId === 'group';

  const row = el('div', `msg ${isOut ? 'out' : 'in'}`);

  if (!isOut && isGroup && sender) {
    row.appendChild(el('div', `av av-${sender.color} sm`, sender.initials));
  }

  const bwrap = el('div');
  if (!isOut && isGroup && sender) {
    bwrap.innerHTML = `<div class="msg-sender">${sender.name}</div>`;
  }

  if (msg.file_url) {
    const bubble = el('div', 'bubble');
    if (msg.file_type?.startsWith('image/')) {
      bubble.innerHTML = `<img src="${msg.file_url}" style="max-width:200px;max-height:200px;border-radius:8px;display:block" onclick="window.open('${msg.file_url}')"/>`;
    } else if (msg.file_type?.startsWith('video/')) {
      bubble.innerHTML = `<video src="${msg.file_url}" controls style="max-width:200px;border-radius:8px;display:block"></video>`;
    } else {
      bubble.innerHTML = `<a href="${msg.file_url}" target="_blank" style="color:inherit">📎 ${msg.file_name}</a>`;
    }
    bwrap.appendChild(bubble);
  } else {
    bwrap.appendChild(el('div', 'bubble', msg.text));
  }

  row.appendChild(bwrap);
  row.appendChild(el('span', 'msg-time', formatTime(msg.created_at)));
  wrap.appendChild(row);
  if (scroll) wrap.scrollTop = wrap.scrollHeight;
}

async function sendMessage() {
  const inp = document.getElementById('chat-input');
  const text = inp.value.trim();
  if (!text || !ME) return;
  inp.value = '';
  const cid = chatId(activeChatId);
  await sb.from('messages').insert({ chat_id: cid, from_id: ME.id, text });
}

// ── FILE UPLOAD ───────────────────────────────────────────────────────────────

async function uploadFile(file) {
  const ext = file.name.split('.').pop();
  const path = `${ME.id}/${Date.now()}.${ext}`;
  const { data, error } = await sb.storage.from('media').upload(path, file);
  if (error) { alert('Ошибка загрузки: ' + error.message); return; }
  const { data: urlData } = sb.storage.from('media').getPublicUrl(path);
  const cid = chatId(activeChatId);
  await sb.from('messages').insert({
    chat_id: cid, from_id: ME.id,
    file_url: urlData.publicUrl,
    file_type: file.type,
    file_name: file.name
  });
}

function onFileSelect(e) {
  const file = e.target.files[0];
  if (file) uploadFile(file);
  e.target.value = '';
}

// ── INSTALL ───────────────────────────────────────────────────────────────────

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  document.getElementById('install-banner').style.display = 'flex';
});

function installApp() {
  if (deferredInstall) {
    deferredInstall.prompt();
    deferredInstall.userChoice.then(() => {
      document.getElementById('install-banner').style.display = 'none';
    });
  }
}

function checkIOSInstall() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS && !window.navigator.standalone) {
    const banner = document.getElementById('install-banner');
    banner.querySelector('span').textContent = 'Safari → Поделиться → На экран "Домой"';
    banner.style.display = 'flex';
    banner.querySelector('button').textContent = '✕';
    banner.querySelector('button').onclick = () => banner.style.display = 'none';
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // Проверяем инвайт в URL
  const inviteUser = await checkInvite();
  if (inviteUser && !inviteUser.approved) {
    document.getElementById('login-title').textContent = 'Вас пригласили в семейный чат!';
  }

  // Проверяем сохранённую сессию
  const saved = localStorage.getItem('me');
  if (saved) {
    ME = JSON.parse(saved);
    const { data } = await sb.from('users').select('*').eq('id', ME.id).single();
    if (data?.approved) {
      ME = data;
      startApp();
      return;
    } else if (data && !data.approved) {
      go('pending');
      return;
    }
  }

  go('login');
  checkIOSInstall();

  window.addEventListener('beforeunload', () => updateOnline(false));
});
