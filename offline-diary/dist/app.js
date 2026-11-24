import * as storage from './storage.js';
import { mascots } from './mascots.js';

const app = document.querySelector('#app');
const header = document.querySelector('#page-header');
const tabbar = document.querySelector('#tabbar');
const toastElement = document.querySelector('#toast');
const session = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const state = {
  data: null,
  tab: 'today',
  tabTrail: [],
  reviewDate: dayKey(),
  reviewMonth: monthKey(new Date()),
  query: '',
  views: [],
  busy: false,
  loading: true,
  error: '',
  navigation: null,
  dialogOpen: false,
};
let renderVersion = 0;
let mutationVersion = 0;
let appliedMutation = 0;
let draftTimer = null;
let toastTimer = null;
let today = dayKey();

const paths = {
  back: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  edit: '<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M8 15h1M15 15h1"/>',
  flower: '<path d="M12 20v-5M12 18c-4-4-6-1-5 0 1 2 5 2 5 2M12 19c4-4 6-1 5 0-1 2-5 2-5 2"/><path d="M12 4c-4-5-7 2-3 4-6 1-3 7 1 5 1 5 7 3 5-1 5 0 6-6 1-6 0-4-4-5-4-2Z"/><circle cx="12" cy="9" r="2"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
};

function icon(name) {
  return `<svg class="icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.flower}</svg>`;
}

function escape(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function dayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDay(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function monthKey(value) {
  return dayKey(value).slice(0, 7);
}

function dateLabel(value, withYear = false) {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDay(value) : new Date(value);
  return date.toLocaleDateString('zh-CN', { ...(withYear ? { year: 'numeric' } : {}), month: 'long', day: 'numeric', weekday: 'long' });
}

function timeLabel(value) {
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function localDateTime(value) {
  const date = new Date(value);
  return `${dayKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function dateDifference(value) {
  const target = parseDay(value);
  const now = new Date();
  return Math.round((Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

function currentView() {
  return state.views.at(-1);
}

function activeEditor() {
  return state.views.find((view) => view.kind === 'editor');
}

function currentMascot() {
  return mascots.find((mascot) => mascot.id === state.data?.mascot) || mascots[0];
}

function hasContent(draft) {
  return Boolean(draft.text.trim() || draft.photos.length);
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function button(text, action, { className = 'secondary', symbol = '', attributes = '' } = {}) {
  return `<button type="button" class="button ${className}" data-action="${action}" ${attributes}>${symbol ? icon(symbol) : ''}<span>${escape(text)}</span></button>`;
}

function emptyState(title, detail, symbol = 'flower') {
  return `<div class="empty-state"><span class="empty-icon">${icon(symbol)}</span><h3>${escape(title)}</h3><p>${escape(detail).replace(/\n/g, '<br>')}</p></div>`;
}

function toast(message, error = false) {
  clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.hidden = false;
  toastElement.classList.toggle('error', error);
  toastTimer = setTimeout(() => { toastElement.hidden = true; }, error ? 6500 : 4200);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : '暂时没有完成，请再试一次。';
}

async function mutate(operation) {
  const sequence = ++mutationVersion;
  const next = await operation();
  if (sequence >= appliedMutation) {
    state.data = next;
    appliedMutation = sequence;
  }
  return next;
}

function updateBusy() {
  document.documentElement.classList.toggle('is-busy', state.busy);
  app.setAttribute('aria-busy', String(state.busy));
  for (const element of document.querySelectorAll('#app button, #app input, #app textarea, #page-header button, #tabbar button')) {
    if (state.busy) {
      if (!element.hasAttribute('data-was-disabled')) element.dataset.wasDisabled = String(element.disabled);
      element.disabled = true;
    } else if (element.hasAttribute('data-was-disabled')) {
      element.disabled = element.dataset.wasDisabled === 'true';
      delete element.dataset.wasDisabled;
    }
  }
}

async function runBusy(operation) {
  if (state.busy || state.navigation || state.dialogOpen) return;
  state.busy = true;
  updateBusy();
  try { return await operation(); }
  catch (error) { toast(errorMessage(error), true); }
  finally { state.busy = false; updateBusy(); }
}

function setDraftStatus(message, error = false) {
  const element = document.querySelector('[data-draft-status]');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('error', error);
}

function cancelDraftTimer() {
  clearTimeout(draftTimer);
  draftTimer = null;
}

async function persistDraft(editor) {
  if (editor.id || editor.closing) return;
  const version = editor.version;
  const snapshot = copy(editor.draft);
  try {
    await mutate(() => storage.saveDraft(hasContent(snapshot) ? snapshot : null));
    editor.persistedVersion = Math.max(editor.persistedVersion, version);
    if (activeEditor() === editor && editor.version === version && !editor.closing) setDraftStatus('草稿已保存在本机');
  } catch (error) {
    if (activeEditor() === editor && !editor.closing) setDraftStatus('草稿还没存好，先留在这里再试一次。', true);
    throw error;
  }
}

function scheduleDraft(editor) {
  cancelDraftTimer();
  if (editor.id) { setDraftStatus('修改后，点「保存修改」收好。'); return; }
  setDraftStatus('正在保存草稿…');
  draftTimer = setTimeout(() => { draftTimer = null; void persistDraft(editor).catch(() => {}); }, 600);
}

function newDraft(date) {
  const now = new Date();
  if (date) {
    const target = parseDay(date);
    now.setFullYear(target.getFullYear(), target.getMonth(), target.getDate());
  }
  return { text: '', occurredAt: now.toISOString(), photos: [] };
}

function historyState(depth = state.views.length) {
  return { diarySession: session, depth, tab: state.tab, tabTrail: [...state.tabTrail] };
}

function openView(view) {
  if (state.busy || state.navigation || state.dialogOpen) return;
  state.views.push(view);
  history.pushState(historyState(), '', location.href);
  render();
  window.scrollTo({ top: 0 });
}

function finishBack(depth = state.views.length - 1) {
  if (state.navigation) return;
  state.navigation = { depth };
  history.back();
}

async function ask(title, message, choices) {
  if (state.dialogOpen) return 'cancel';
  state.dialogOpen = true;
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog';
  dialog.setAttribute('aria-labelledby', 'confirmation-title');
  dialog.setAttribute('aria-describedby', 'confirmation-message');
  dialog.innerHTML = `<div class="dialog-body"><h2 class="dialog-title" id="confirmation-title">${escape(title)}</h2><p class="dialog-message" id="confirmation-message">${escape(message)}</p></div><div class="dialog-actions">${choices.map((choice) => `<button type="button" class="button ${choice.className || 'secondary'}" data-choice="${choice.value}">${escape(choice.label)}</button>`).join('')}</div>`;
  document.body.append(dialog);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      state.dialogOpen = false;
      resolve(value);
    };
    dialog.addEventListener('click', (event) => {
      const target = event.target.closest('[data-choice]');
      if (target) finish(target.dataset.choice);
    });
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish('cancel'); });
    dialog.showModal();
  });
}

async function requestBack(depth = state.views.length - 1) {
  if (state.busy || state.navigation || state.dialogOpen) return;
  const view = currentView();
  if (!view) return;
  document.activeElement?.blur();
  if (view.kind === 'photo') { finishBack(depth); return; }
  if (view.kind === 'countdown') {
    if (view.title.trim() || view.date !== view.initialDate) {
      const choice = await ask('这个日子还没保存', '可以继续填写，或保存后返回。', [
        { value: 'cancel', label: '继续填写' },
        { value: 'discard', label: '放弃并返回', className: 'quiet' },
        { value: 'save', label: '保存并返回', className: 'primary' },
      ]);
      if (choice === 'save') { await saveCountdownView(depth); return; }
      if (choice !== 'discard') return;
    }
    finishBack(depth);
    return;
  }
  if (view.kind === 'editor') {
    if (view.id) {
      if (JSON.stringify(view.draft) !== view.initial) {
        const choice = await ask('修改还没保存', '可以保存这次修改后返回，或保留原来的记录。', [
          { value: 'cancel', label: '继续写' },
          { value: 'discard', label: '放弃修改并返回', className: 'quiet' },
          { value: 'save', label: '保存并返回', className: 'primary' },
        ]);
        if (choice === 'save') { await saveEditor(depth); return; }
        if (choice !== 'discard') return;
      }
      finishBack(depth);
      return;
    }
    await runBusy(async () => {
      cancelDraftTimer();
      view.closing = true;
      const snapshot = copy(view.draft);
      try {
        await mutate(() => storage.saveDraft(hasContent(snapshot) ? snapshot : null));
        view.persistedVersion = view.version;
      }
      catch (error) { view.closing = false; setDraftStatus('草稿还没存好，内容仍在这里。', true); throw error; }
      finishBack(depth);
    });
  }
}

function openEditor(id, date) {
  const entry = id && state.data.entries.find((item) => item.id === id);
  if (id && !entry) { toast('这条记录暂时没有找到。', true); return; }
  const savedDraft = state.data.draft;
  const draft = entry ? { text: entry.text, occurredAt: entry.occurredAt, photos: copy(entry.photos) } : savedDraft && hasContent(savedDraft) ? copy(savedDraft) : newDraft(date);
  openView({ kind: 'editor', id: entry?.id, draft, initial: JSON.stringify(draft), timeInput: localDateTime(draft.occurredAt), version: 0, persistedVersion: 0, completed: false, closing: false });
}

async function saveEditor(depth = state.views.length - 1) {
  const editor = currentView();
  if (editor?.kind !== 'editor') return;
  const form = document.querySelector('#entry-form');
  if (!form?.reportValidity()) return;
  if (!hasContent(editor.draft)) { toast('写一句话或加一张照片，就可以保存。'); return; }
  const snapshot = copy(editor.draft);
  await runBusy(async () => {
    cancelDraftTimer();
    editor.closing = true;
    try { await mutate(() => storage.saveEntry(snapshot, editor.id)); }
    catch (error) { editor.closing = false; setDraftStatus('这次还没保存好，内容仍在这里。', true); throw error; }
    editor.completed = true;
    state.reviewDate = dayKey(snapshot.occurredAt);
    state.reviewMonth = state.reviewDate.slice(0, 7);
    state.query = '';
    if (state.reviewDate !== dayKey()) state.tab = 'review';
    toast('这条记录已收好。');
    finishBack(depth);
  });
}

async function saveCountdownView(depth = state.views.length - 1) {
  const view = currentView();
  if (view?.kind !== 'countdown') return;
  const form = document.querySelector('#countdown-form');
  if (!form?.reportValidity()) return;
  const snapshot = { title: view.title.trim(), date: view.date };
  await runBusy(async () => {
    await mutate(() => storage.saveCountdown(snapshot));
    toast('这个日子已收好。');
    finishBack(depth);
  });
}

function renderHeader(view) {
  header.hidden = !view && state.tab === 'today';
  if (!view) {
    header.innerHTML = state.tab === 'today' ? '' : `<button type="button" class="back-button" data-action="back-tab">${icon('back')}<span>返回</span></button><span class="header-title" aria-hidden="true"></span><div class="header-actions"></div>`;
    return;
  }
  const title = view.kind === 'editor' ? view.id ? '修改记录' : '写下一点' : view.kind === 'countdown' ? '一个想记住的日子' : '照片';
  const back = view.kind === 'photo' ? '返回日记' : '返回';
  header.innerHTML = `<button type="button" class="back-button" data-action="back">${icon('back')}<span>${back}</span></button><h1 class="header-title">${title}</h1><div class="header-actions">${view.kind === 'editor' ? button('保存', 'save-entry', { className: 'quiet', symbol: 'check' }) : ''}</div>`;
}

function entryMarkup(entry, showDate = false) {
  return `<article class="entry-card" data-entry-card="${escape(entry.id)}"><div class="entry-meta"><div class="entry-time">${icon('flower')}<time datetime="${escape(entry.occurredAt)}">${showDate ? `${escape(dateLabel(entry.occurredAt, true))} · ` : ''}${escape(timeLabel(entry.occurredAt))}</time></div><div class="entry-tools"><button type="button" class="icon-button" data-action="edit-entry" data-id="${escape(entry.id)}" aria-label="修改 ${escape(timeLabel(entry.occurredAt))} 的记录">${icon('edit')}</button><button type="button" class="icon-button" data-action="delete-entry" data-id="${escape(entry.id)}" aria-label="删除 ${escape(timeLabel(entry.occurredAt))} 的记录">${icon('trash')}</button></div></div>${entry.text ? `<p class="entry-body">${escape(entry.text)}</p>` : ''}${photoStrip(entry.photos)}</article>`;
}

function photoStrip(photos, editable = false) {
  if (!photos.length) return '';
  return `<div class="entry-photos">${photos.map((photo, index) => `<div class="photo-item"><button type="button" class="photo-button" data-action="view-photo" data-photo-id="${escape(photo.id)}" aria-label="查看第 ${index + 1} 张照片"><img class="photo-thumb" data-photo-id="${escape(photo.id)}" alt="日记照片 ${index + 1}" loading="lazy"></button>${editable ? `<button type="button" class="photo-remove" data-action="remove-photo" data-photo-id="${escape(photo.id)}" aria-label="移除第 ${index + 1} 张照片">${icon('close')}</button>` : ''}</div>`).join('')}</div>`;
}

function countdownMarkup(item, compact = false) {
  const difference = dateDifference(item.date);
  return `<article class="countdown-card${compact ? ' compact' : ''}"><span class="countdown-flower">${icon('flower')}</span><div class="countdown-copy"><h3>${escape(item.title)}</h3><p>${escape(parseDay(item.date).toLocaleDateString('zh-CN'))}</p></div><div class="countdown-number"><strong>${difference === 0 ? '今天' : Math.abs(difference)}</strong>${difference ? `<span>${difference > 0 ? '天后' : '天前'}</span>` : ''}</div>${!compact ? `<button type="button" class="icon-button" data-action="delete-countdown" data-id="${escape(item.id)}" aria-label="移除${escape(item.title)}">${icon('trash')}</button>` : ''}</article>`;
}

function renderToday() {
  const mascot = currentMascot();
  const entries = state.data.entries.filter((entry) => dayKey(entry.occurredAt) === dayKey()).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const nextDay = [...state.data.countdowns].filter((item) => dateDifference(item.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  const draft = state.data.draft && hasContent(state.data.draft);
  return `<section class="page page-stack"><div class="page-heading masthead"><div><p class="eyebrow">${escape(dateLabel(new Date(), true))}</p><h1>小猪向阳日记</h1></div></div><section class="hero"><div class="hero-copy"><p class="eyebrow">今天的小伙伴</p><h2>${escape(mascot.name)}</h2><p>文字和照片，记在这里。</p>${button(draft ? '继续上次的草稿' : '写一条记录', 'new-entry', { className: 'primary', symbol: 'edit' })}</div><div class="hero-art"><img class="hero-mascot hero-pig" src="${escape(mascot.image)}" alt="穿着动物服的${escape(mascot.name)}"></div></section><div class="journal-layout"><div class="journal-main"><div class="section-heading"><h2>今天的小片段</h2>${entries.length ? `<span class="muted">${entries.length} 条 · 按发生时间</span>` : ''}</div>${entries.length ? entries.map((entry) => entryMarkup(entry)).join('') : emptyState('今天还没有记录', '点「写一条记录」开始。\n想起以前的事，可以改发生时间补记。')}</div><aside class="journal-aside"><div class="section-heading"><h2>期待的日子</h2>${button('全部', 'show-countdowns', { className: 'quiet' })}</div>${nextDay ? countdownMarkup(nextDay, true) : `<div class="card gentle-card"><h3>还没有期待日</h3>${button('加一个日子', 'new-countdown', { className: 'secondary', symbol: 'add' })}</div>`}</aside></div></section>`;
}

function calendarMarkup() {
  const month = parseDay(`${state.reviewMonth}-01`);
  const numberOfDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const padding = (month.getDay() + 6) % 7;
  const counts = new Map();
  for (const entry of state.data.entries) { const key = dayKey(entry.occurredAt); counts.set(key, (counts.get(key) || 0) + 1); }
  const cells = Array.from({ length: Math.ceil((padding + numberOfDays) / 7) * 7 }, (_, index) => {
    const day = index - padding + 1;
    if (day < 1 || day > numberOfDays) return '<span class="calendar-day calendar-blank" aria-hidden="true"></span>';
    const key = dayKey(new Date(month.getFullYear(), month.getMonth(), day, 12));
    const count = counts.get(key) || 0;
    return `<button type="button" class="calendar-day${key === state.reviewDate ? ' is-selected' : ''}${key === dayKey() ? ' is-today' : ''}${count ? ' has-entries' : ''}" data-action="select-date" data-date="${key}" aria-pressed="${key === state.reviewDate}" aria-label="${escape(dateLabel(key, true))}，${count} 条记录"><span>${day}</span>${count ? '<i aria-hidden="true"></i>' : ''}</button>`;
  }).join('');
  return `<section class="calendar" aria-label="日记日历"><div class="calendar-head"><button type="button" class="icon-button" data-action="previous-month" aria-label="上个月">${icon('back')}</button><h2 class="month-label">${month.getFullYear()} 年 ${month.getMonth() + 1} 月</h2><button type="button" class="icon-button" data-action="next-month" aria-label="下个月">${icon('next')}</button></div><div class="calendar-grid">${['一', '二', '三', '四', '五', '六', '日'].map((label) => `<span class="calendar-weekday">${label}</span>`).join('')}${cells}</div><div class="calendar-footer">${button('回到今天', 'review-today', { className: 'quiet' })}</div></section>`;
}

function reviewResults() {
  const query = state.query.trim().toLocaleLowerCase();
  const entries = query ? state.data.entries.filter((entry) => entry.text.toLocaleLowerCase().includes(query)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)) : state.data.entries.filter((entry) => dayKey(entry.occurredAt) === state.reviewDate).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return `<div class="section-heading"><h2>${query ? '找到的小片段' : escape(dateLabel(state.reviewDate, true))}</h2><span class="muted">${entries.length} 条</span></div>${entries.length ? entries.map((entry) => entryMarkup(entry, Boolean(query))).join('') : emptyState(query ? '暂时没有找到' : '这一天还没有记录', query ? '换一个关键词试试看。' : '后来想起来，也可以把它补在这一天。', query ? 'search' : 'calendar')}${query ? '' : button('补写这一天', 'backfill-entry', { className: 'secondary', symbol: 'edit' })}`;
}

function renderReview() {
  return `<section class="page page-stack"><div class="page-heading"><div><p class="eyebrow">一页一页，慢慢翻</p><h1>回看</h1><p class="muted">把记得的，慢慢找回来。</p></div></div><label class="search-field">${icon('search')}<span class="sr-only">搜索全部日记</span><input class="field-control" type="search" id="journal-search" value="${escape(state.query)}" placeholder="找一段话，或一件小事" maxlength="200" autocomplete="off"></label><div data-calendar ${state.query.trim() ? 'hidden' : ''}>${calendarMarkup()}</div><div class="page-stack" data-review-results>${reviewResults()}</div></section>`;
}

function renderCountdowns() {
  const countdowns = [...state.data.countdowns].sort((a, b) => {
    const aPast = dateDifference(a.date) < 0;
    const bPast = dateDifference(b.date) < 0;
    if (aPast !== bPast) return aPast ? 1 : -1;
    return aPast ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
  });
  return `<section class="page page-stack"><div class="page-heading"><div><p class="eyebrow">让日子，有一点盼头</p><h1>期待的日子</h1><p class="muted">一些想期待，也想记住的日子。</p></div>${button('加一个日子', 'new-countdown', { className: 'primary', symbol: 'add' })}</div>${countdowns.length ? `<div class="countdown-list">${countdowns.map((item) => countdownMarkup(item)).join('')}</div>` : emptyState('有期待的时候，再放进来', '旅行、生日，或任何对你有意义的日子。\n已经过去的日子，也可以记住。', 'calendar')}</section>`;
}

function offlineStatusMarkup() {
  const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  return `<div class="status-line"><span class="status-pill">${installed ? '已从主屏幕打开' : '正在浏览器里预览'}</span><span class="status-pill" data-offline-indicator>${window.diaryOfflineReady ? '离线已就绪' : '正在准备离线'}</span></div>`;
}

function renderSettings() {
  return `<section class="page page-stack"><div class="page-heading"><div><p class="eyebrow">只属于你的小角落</p><h1>我的</h1><p class="muted">陪伴的样子，由你来选。</p></div></div><section class="settings-card"><div class="section-heading"><h2>今天让谁陪你？</h2></div><div class="mascot-grid">${mascots.map((mascot) => `<button type="button" class="mascot-card${mascot.id === state.data.mascot ? ' is-selected' : ''}" data-action="select-mascot" data-id="${escape(mascot.id)}" aria-pressed="${mascot.id === state.data.mascot}" style="--mascot-color:${escape(mascot.color)}"><img class="mascot-thumb" src="${escape(mascot.image)}" alt=""><span>${escape(mascot.name)}${mascot.id === state.data.mascot ? icon('check') : ''}</span></button>`).join('')}</div></section><section class="settings-card backup-card"><div class="section-heading"><h2>把回忆收好</h2></div><p>日记和照片保存在这台手机的本机空间。导出一份备份，就可以放进自己的 iCloud Drive。</p><div class="notice"><strong>文字、照片、期待日和草稿一起备份</strong><p>点「导出备份」，在分享菜单选「存储到文件」，再选 iCloud Drive。这里是手动备份，不会自动同步。</p></div><div class="button-row">${button('导出完整备份', 'export-backup', { className: 'primary', symbol: 'download' })}${button('从备份恢复', 'choose-backup', { className: 'secondary', symbol: 'upload' })}</div><input id="backup-file" type="file" accept="application/json,.json" class="sr-only" hidden><p class="field-help">这一版每张照片最多 6 MB，完整备份中的照片合计最多 24 MB，备份文件最多 40 MB。先用少量照片体验。</p></section><section class="settings-card"><div class="section-heading"><h2>放到 iPhone 主屏幕</h2></div>${offlineStatusMarkup()}<ol class="install-steps"><li>在 Safari 打开日记，点「分享」，选「添加到主屏幕」。</li><li>从主屏幕上的小猪图标打开一次，保持联网，等上方出现「离线已就绪」。</li><li>之后便可以断网打开、写日记和回看本机照片。</li></ol><p class="field-help">建议先添加到主屏幕，再开始日常记录。Safari 和主屏幕 App 的保存空间可能分开；如果之前已经写过，先导出备份，再到主屏幕 App 里恢复并核对。</p><p class="field-help">如果清除了网站资料、卸载或换手机，需要用你保存的备份恢复。记得偶尔给回忆留一份副本。</p></section><div class="quiet-note">${icon('flower')}<p>想起来就写，想歇一歇也可以。<br>这里会为你留着位置。</p></div></section>`;
}

function renderEditor(editor) {
  return `<section class="page editor-view"><form id="entry-form" class="editor-form"><div class="field"><label class="field-label" for="occurred-at">事情发生在</label><input class="field-control" id="occurred-at" name="occurredAt" type="datetime-local" value="${escape(editor.timeInput)}" required step="60"><p class="field-help">现在想起以前的事，也可以改成当时的日期和时间。</p></div><div class="field"><label class="field-label sr-only" for="entry-text">日记内容</label><textarea class="field-control textarea" id="entry-text" name="text" rows="9" maxlength="50000" placeholder="刚刚发生了什么，或是突然想起了什么…">${escape(editor.draft.text)}</textarea></div><div data-editor-photos>${photoStrip(editor.draft.photos, true)}</div><div class="editor-toolbar">${button('加几张照片', 'choose-photo', { className: 'secondary', symbol: 'image' })}<span class="field-help">${editor.draft.photos.length}/12 张</span></div><input id="entry-photos" type="file" accept="image/*" multiple class="sr-only" hidden><div class="editor-footer"><p class="draft-status" data-draft-status role="status">${editor.id ? '修改后，点「保存修改」收好。' : '草稿会自动保存在本机；返回时也会先收好草稿。'}</p><button type="submit" class="button primary">${icon('check')}<span>${editor.id ? '保存修改' : '收好这条记录'}</span></button></div></form></section>`;
}

function renderCountdownForm(view) {
  return `<section class="page editor-view"><form id="countdown-form" class="editor-form"><div class="field"><label class="field-label" for="countdown-title">这是什么日子？</label><input class="field-control" id="countdown-title" name="title" placeholder="例如：一起去看海" maxlength="80" value="${escape(view.title)}" required autocomplete="off"></div><div class="field"><label class="field-label" for="countdown-date">它在哪一天？</label><input class="field-control" id="countdown-date" name="date" type="date" value="${escape(view.date)}" required></div><p class="field-help">未来的日子会显示还有几天，过去的日子也可以记住。</p><div class="editor-footer"><button type="submit" class="button primary">${icon('check')}<span>收好这个日子</span></button></div></form></section>`;
}

function renderPhotoViewer(view) {
  return `<section class="page photo-viewer" aria-label="照片预览"><img class="viewer-image" data-photo-id="${escape(view.photo.id)}" alt="日记照片，原图预览"></section>`;
}

function findPhoto(id) {
  const editor = activeEditor();
  if (editor) {
    const photo = editor.draft.photos.find((item) => item.id === id);
    if (photo) return photo;
  }
  for (const entry of state.data?.entries || []) {
    const photo = entry.photos.find((item) => item.id === id);
    if (photo) return photo;
  }
  return currentView()?.kind === 'photo' && currentView().photo.id === id ? currentView().photo : null;
}

async function hydratePhotos() {
  const version = renderVersion;
  const elements = [...app.querySelectorAll('img[data-photo-id]')];
  await Promise.allSettled(elements.map(async (element) => {
    const photo = findPhoto(element.dataset.photoId);
    if (!photo) return;
    try {
      const url = await storage.photoUrl(photo);
      if (version === renderVersion && element.isConnected) element.src = url;
    } catch {
      if (version === renderVersion && element.isConnected) element.alt = '这张照片暂时无法读取';
    }
  }));
}

function render() {
  renderVersion++;
  const view = currentView();
  renderHeader(view);
  tabbar.hidden = Boolean(view);
  document.body.classList.toggle('subview-open', Boolean(view));
  for (const tab of tabbar.querySelectorAll('[data-tab]')) {
    if (tab.dataset.tab === state.tab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
    tab.disabled = state.loading || Boolean(state.error);
  }
  if (state.loading) {
    app.innerHTML = '<section class="page"><div class="empty-state"><span class="loading-flower" aria-hidden="true">🌻</span><h1>正在打开你的小日记…</h1></div></section>';
    return;
  }
  if (state.error) {
    app.innerHTML = `<section class="page">${emptyState('暂时没能打开日记', state.error)}${button('重新读取', 'retry-load', { className: 'primary' })}</section>`;
    return;
  }
  const title = view ? view.kind === 'editor' ? '写日记' : view.kind === 'photo' ? '照片' : '加一个日子' : ({ today: '今天', review: '回看', countdowns: '期待', settings: '我的' })[state.tab];
  document.title = `${title} · 小猪向阳日记`;
  if (view?.kind === 'editor') app.innerHTML = renderEditor(view);
  else if (view?.kind === 'countdown') app.innerHTML = renderCountdownForm(view);
  else if (view?.kind === 'photo') app.innerHTML = renderPhotoViewer(view);
  else app.innerHTML = ({ today: renderToday, review: renderReview, countdowns: renderCountdowns, settings: renderSettings })[state.tab]();
  updateBusy();
  void hydratePhotos();
}

function setTab(tab) {
  if (!['today', 'review', 'countdowns', 'settings'].includes(tab) || state.busy || state.navigation || state.dialogOpen || currentView()) return;
  if (state.tab === tab) return;
  state.tabTrail.push(state.tab);
  state.tab = tab;
  history.pushState(historyState(0), '', location.href);
  render();
  window.scrollTo({ top: 0 });
}

function backTab() {
  if (state.busy || state.navigation || state.dialogOpen || currentView()) return;
  if (state.tabTrail.length) {
    state.navigation = { tabBack: true };
    history.back();
    return;
  }
  state.tab = 'today';
  state.tabTrail = [];
  history.replaceState(historyState(0), '', location.href);
  render();
  window.scrollTo({ top: 0 });
}

async function exportDiary() {
  await runBusy(async () => {
    const blob = await storage.exportBackup();
    const filename = `sunflower-diary-${dayKey()}.json`;
    const file = new File([blob], filename, { type: 'application/json' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: '小猪向阳日记备份' }); return; }
      catch (error) { if (error.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('备份文件已生成，请完成下载或存储到文件。');
  });
}

async function importDiary(file) {
  if (!file) return;
  const choice = await ask('从备份恢复？', '恢复会替换当前的日记、照片、期待日和草稿。建议先导出一份当前备份。', [
    { value: 'cancel', label: '先不恢复' },
    { value: 'restore', label: '恢复这份备份', className: 'primary' },
  ]);
  if (choice !== 'restore') return;
  await runBusy(async () => {
    await mutate(() => storage.importBackup(file));
    render();
    toast('备份已恢复，可以回看核对一下。');
  });
}

async function addPhotos(files) {
  const editor = currentView();
  if (editor?.kind !== 'editor' || !files.length) return;
  const remaining = 12 - editor.draft.photos.length;
  if (!remaining) { toast('这一条已放了 12 张照片，可以再写一条。'); return; }
  const selected = [...files].slice(0, remaining);
  await runBusy(async () => {
    const photos = [];
    const failures = [];
    for (const file of selected) {
      try { photos.push(await storage.addPhoto(file)); }
      catch (error) { failures.push(errorMessage(error)); }
    }
    if (photos.length) {
      editor.draft.photos.push(...photos);
      editor.version++;
      render();
      scheduleDraft(editor);
    }
    if (failures.length) toast(failures[0], true);
    else if (files.length > remaining) toast('这一条最多 12 张照片，其余照片可以放进下一条。');
  });
}

async function removeEntry(id) {
  const entry = state.data.entries.find((item) => item.id === id);
  if (!entry) return;
  const choice = await ask('删除这条记录？', '删除后，这条记录将不再显示。已导出的备份不会改变。', [
    { value: 'cancel', label: '保留' },
    { value: 'delete', label: '删除记录', className: 'danger' },
  ]);
  if (choice !== 'delete') return;
  await runBusy(async () => { await mutate(() => storage.removeEntry(id)); render(); toast('这条记录已移除。'); });
}

async function removeCountdown(id) {
  const item = state.data.countdowns.find((countdown) => countdown.id === id);
  if (!item) return;
  const choice = await ask('移除这个日子？', item.title, [{ value: 'cancel', label: '保留' }, { value: 'delete', label: '移除', className: 'danger' }]);
  if (choice !== 'delete') return;
  await runBusy(async () => { await mutate(() => storage.removeCountdown(id)); render(); toast('这个日子已移除。'); });
}

async function handleAction(action, element) {
  if (state.busy || state.navigation || state.dialogOpen) return;
  switch (action) {
    case 'back': await requestBack(); break;
    case 'back-tab': backTab(); break;
    case 'retry-load': await initialize(); break;
    case 'new-entry': openEditor(); break;
    case 'backfill-entry':
      if (state.data.draft && hasContent(state.data.draft)) toast('已打开上次的草稿，改一下发生日期就能补记。');
      openEditor(undefined, state.reviewDate);
      break;
    case 'edit-entry': openEditor(element.dataset.id); break;
    case 'delete-entry': await removeEntry(element.dataset.id); break;
    case 'save-entry': await saveEditor(); break;
    case 'choose-photo': document.querySelector('#entry-photos')?.click(); break;
    case 'remove-photo': {
      const editor = currentView();
      if (editor?.kind !== 'editor') break;
      editor.draft.photos = editor.draft.photos.filter((photo) => photo.id !== element.dataset.photoId);
      editor.version++;
      render();
      scheduleDraft(editor);
      break;
    }
    case 'view-photo': {
      const photo = findPhoto(element.dataset.photoId);
      if (photo) openView({ kind: 'photo', photo });
      break;
    }
    case 'new-countdown': openView({ kind: 'countdown', title: '', date: dayKey(), initialDate: dayKey() }); break;
    case 'delete-countdown': await removeCountdown(element.dataset.id); break;
    case 'show-countdowns': setTab('countdowns'); break;
    case 'select-mascot':
      await runBusy(async () => { await mutate(() => storage.selectMascot(element.dataset.id)); render(); toast(`${currentMascot().name}来陪你啦。`); });
      break;
    case 'select-date': state.reviewDate = element.dataset.date; render(); break;
    case 'review-today': state.reviewDate = dayKey(); state.reviewMonth = monthKey(new Date()); state.query = ''; render(); break;
    case 'previous-month':
    case 'next-month': {
      const month = parseDay(`${state.reviewMonth}-01`);
      month.setMonth(month.getMonth() + (action === 'next-month' ? 1 : -1));
      state.reviewMonth = monthKey(month);
      render();
      break;
    }
    case 'export-backup': await exportDiary(); break;
    case 'choose-backup': document.querySelector('#backup-file')?.click(); break;
  }
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button[data-action],button[data-tab]');
  if (!target || target.disabled) return;
  if (target.dataset.tab) setTab(target.dataset.tab);
  else void handleAction(target.dataset.action, target).catch((error) => toast(errorMessage(error), true));
});

app.addEventListener('input', (event) => {
  if (state.busy || state.navigation || state.dialogOpen) return;
  const target = event.target;
  if (target.id === 'journal-search') {
    state.query = target.value;
    const calendar = app.querySelector('[data-calendar]');
    if (calendar) calendar.hidden = Boolean(state.query.trim());
    app.querySelector('[data-review-results]').innerHTML = reviewResults();
    void hydratePhotos();
    return;
  }
  const view = currentView();
  if (view?.kind === 'editor') {
    if (target.id === 'entry-text') { view.draft.text = target.value; view.version++; scheduleDraft(view); }
    if (target.id === 'occurred-at') {
      view.timeInput = target.value;
      const parsed = new Date(target.value);
      if (target.value && !Number.isNaN(parsed.getTime())) { view.draft.occurredAt = parsed.toISOString(); view.version++; scheduleDraft(view); }
    }
  } else if (view?.kind === 'countdown') {
    if (target.id === 'countdown-title') view.title = target.value;
    if (target.id === 'countdown-date') view.date = target.value;
  }
});

app.addEventListener('change', (event) => {
  const target = event.target;
  if (target.id === 'entry-photos') { const files = [...target.files]; target.value = ''; void addPhotos(files); }
  if (target.id === 'backup-file') { const file = target.files[0]; target.value = ''; void importDiary(file); }
});

app.addEventListener('submit', (event) => {
  event.preventDefault();
  if (event.target.id === 'entry-form') void saveEditor();
  if (event.target.id === 'countdown-form') void saveCountdownView();
});

window.addEventListener('popstate', (event) => {
  const depth = event.state?.diarySession === session ? Math.max(0, event.state.depth || 0) : 0;
  const targetTab = ['today', 'review', 'countdowns', 'settings'].includes(event.state?.tab) ? event.state.tab : 'today';
  const targetTrail = Array.isArray(event.state?.tabTrail) ? event.state.tabTrail.filter((tab) => ['today', 'review', 'countdowns', 'settings'].includes(tab)) : [];
  if (state.navigation?.tabBack) {
    state.tab = targetTab;
    state.tabTrail = targetTrail;
    state.navigation = null;
    render();
    window.scrollTo({ top: 0 });
    return;
  }
  if (state.navigation) {
    state.views.length = Math.min(state.navigation.depth, state.views.length);
    if (!activeEditor()) cancelDraftTimer();
    state.navigation = null;
    history.replaceState(historyState(), '', location.href);
    render();
    window.scrollTo({ top: 0 });
    return;
  }
  if (!state.views.length && depth === 0) {
    state.tab = targetTab;
    state.tabTrail = targetTrail;
    render();
    window.scrollTo({ top: 0 });
    return;
  }
  if (depth >= state.views.length) return;
  // Restore this in-app history entry before awaiting a draft write or a choice.
  // A canceled confirmation therefore keeps both the editor and its Back route.
  history.pushState(historyState(), '', location.href);
  void requestBack(depth).catch((error) => toast(errorMessage(error), true));
});

window.addEventListener('beforeunload', (event) => {
  const editor = activeEditor();
  if (!editor || editor.completed) return;
  const unsaved = editor.id ? JSON.stringify(editor.draft) !== editor.initial : hasContent(editor.draft) && editor.version > editor.persistedVersion;
  if (unsaved) { event.preventDefault(); event.returnValue = ''; }
});

function backgroundSave() {
  const editor = activeEditor();
  if (!editor || editor.id || editor.closing || state.busy) return;
  cancelDraftTimer();
  void persistDraft(editor).catch(() => {});
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') backgroundSave(); });
window.addEventListener('pagehide', backgroundSave);
window.addEventListener('diaryofflinechange', () => {
  const indicator = app.querySelector('[data-offline-indicator]');
  if (indicator) indicator.textContent = window.diaryOfflineReady ? '离线已就绪' : '正在准备离线';
});
setInterval(() => {
  const nextDay = dayKey();
  if (today === nextDay) return;
  today = nextDay;
  if (!currentView() && !state.busy && !state.loading && !state.error) render();
}, 30000);

async function initialize() {
  state.loading = true;
  state.error = '';
  render();
  try {
    state.data = await storage.loadDiary();
    state.loading = false;
  } catch (error) {
    state.loading = false;
    state.error = `${errorMessage(error)} 原来的资料不会被重置；请重新读取。`;
  }
  render();
}

history.replaceState(historyState(0), '', location.href);
void initialize();
