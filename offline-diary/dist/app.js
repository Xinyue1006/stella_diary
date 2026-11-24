import * as storage from './storage.js';
import { mascots } from './mascots.js';
import { startSync } from './sync.js';

const app = document.querySelector('#app');
const header = document.querySelector('#page-header');
const tabbar = document.querySelector('#tabbar');
const phoneBack = document.querySelector('#phone-back');
const phoneSave = document.querySelector('#phone-save');
const phoneLayout = window.matchMedia('(max-width: 760px), (max-width: 950px) and (max-height: 540px) and (pointer: coarse)');
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
  sync: { state: 'pending', message: '正在连接私人日记…', lastSyncedAt: null },
};
let requestSync;
let renderVersion = 0;
let mutationVersion = 0;
let appliedMutation = 0;
let draftTimer = null;
let toastTimer = null;
let today = dayKey();
let swipeStart = null;

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
  cloud: '<path d="M6.5 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.4-1 5 5 0 0 1 .6 10H6.5Z"/>',
  heart: '<path d="M20.3 5.8a4.8 4.8 0 0 0-6.8 0L12 7.3l-1.5-1.5a4.8 4.8 0 1 0-6.8 6.8l7.6 7.3a1 1 0 0 0 1.4 0l7.6-7.3a4.8 4.8 0 0 0 0-6.8Z"/>',
};

const intensityLabels = ['有一点', '有点难受', '很难受'];
const commonActions = ['出去走走', '找人聊聊', '休息一下'];
const comparisons = { less: '比想象中轻一些', same: '和想象中差不多', more: '比想象中难一些', unsure: '还说不清' };

function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return dayKey(date);
}

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
  if (editor.id || editor.detached || editor.closing) return;
  const version = editor.version;
  const snapshot = hasContent(editor.draft) ? copy(editor.draft) : null;
  const write = editor.draftWrite.catch(() => {}).then(async () => {
    if (version <= editor.persistedVersion) return;
    await mutate(() => storage.saveDraft(snapshot, editor.expectedDraft));
    editor.expectedDraft = snapshot;
    editor.persistedVersion = version;
  });
  editor.draftWrite = write;
  try {
    await write;
    if (activeEditor() === editor && editor.version === version && !editor.closing) setDraftStatus('草稿已保存在本机');
  } catch (error) {
    if (activeEditor() === editor && !editor.closing) setDraftStatus('草稿还没存好，先留在这里再试一次。', true);
    throw error;
  }
}

function scheduleDraft(editor) {
  cancelDraftTimer();
  if (editor.detached) { setDraftStatus('点保存收好这条记录。另一份草稿会留着。'); return; }
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
  if (['photo', 'todos', 'good-memory'].includes(view.kind)) { finishBack(depth); return; }
  if (view.kind === 'todo') {
    if (view.text !== (view.original?.text ?? '')) {
      const choice = await ask('清单上的这件事还没保存', '要把刚才写的内容放进清单吗？', [
        { value: 'cancel', label: '继续写' }, { value: 'discard', label: '放弃并返回', className: 'quiet' },
        { value: 'save', label: '保存并返回', className: 'primary' },
      ]);
      if (choice === 'save') { await saveTodoView(depth); return; }
      if (choice !== 'discard') return;
    }
    finishBack(depth);
    return;
  }
  if (view.kind === 'anxiety') {
    if (anxietyChanged(view)) {
      const choice = await ask('这条焦虑记录还没保存', '想把刚才写下的内容收好吗？', [
        { value: 'cancel', label: '继续写' },
        { value: 'discard', label: '放弃并返回', className: 'quiet' },
        { value: 'save', label: '保存并返回', className: 'primary' },
      ]);
      if (choice === 'save') { await saveAnxietyView(depth); return; }
      if (choice !== 'discard') return;
    }
    finishBack(depth);
    return;
  }
  if (view.kind === 'countdown') {
    if (view.title !== (view.original?.title ?? '') || view.date !== view.initialDate || view.dayType !== (view.original?.kind ?? 'countdown')) {
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
    if (view.id || view.detached) {
      if (JSON.stringify(view.draft) !== view.initial) {
        const choice = await ask('这次写的内容还没保存', '想把刚才写下的内容收好吗？', [
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
      try {
        await persistDraft(view);
        view.closing = true;
      }
      catch (error) { view.closing = false; setDraftStatus('草稿还没存好，内容仍在这里。', true); throw error; }
      finishBack(depth);
    });
  }
}

function openEditor(id, date, kind) {
  const entry = id && state.data.entries.find((item) => item.id === id);
  if (id && !entry) { toast('这条记录暂时没有找到。', true); return; }
  const savedDraft = state.data.draft;
  const detached = !entry && savedDraft && hasContent(savedDraft) && savedDraft.kind !== kind;
  const draft = entry ? { text: entry.text, occurredAt: entry.occurredAt, photos: copy(entry.photos) }
    : !detached && savedDraft && hasContent(savedDraft) ? copy(savedDraft) : newDraft(date);
  if ((entry ? entry.kind : kind) === 'good') draft.kind = 'good';
  openView({ kind: 'editor', id: entry?.id, originalEntry: entry, detached, expectedDraft: detached ? null : savedDraft, draftWrite: Promise.resolve(), draft, initial: JSON.stringify(draft), timeInput: localDateTime(draft.occurredAt), version: 0, persistedVersion: 0, completed: false, closing: false });
}

function openAnxiety(id, date) {
  const original = id && state.data.anxietyLogs?.find(item => item.id === id);
  if (id && !original) { toast('这条焦虑记录已移除。'); return; }
  const draft = {
    occurredAt: original?.occurredAt ?? newDraft(date).occurredAt,
    intensity: original?.intensity ?? null,
    worry: original?.worry ?? '',
    outcome: original?.outcome ?? '',
    actions: [...(original?.actions ?? [])],
    helpfulActions: [...(original?.helpfulActions ?? [])],
    remindOn: original?.remindOn ?? null,
    comparison: original?.comparison ?? null,
  };
  openView({ kind: 'anxiety', id, original, draft, initial: JSON.stringify(draft), custom: '', choices: [...new Set([...commonActions, ...draft.actions])] });
}

function anxietyChanged(view) {
  return Boolean(view.custom.trim()) || JSON.stringify(view.draft) !== view.initial;
}

function addCustomAction(view) {
  const action = view.custom.trim();
  if (!action) return true;
  if (!view.draft.actions.includes(action)) {
    if (view.draft.actions.length >= 32) { toast('每条记录最多可记 32 种做法。', true); return false; }
    view.draft.actions.push(action);
  }
  if (!view.choices.includes(action)) view.choices.push(action);
  view.custom = '';
  const field = app.querySelector('#anxiety-custom');
  if (field) field.value = '';
  app.querySelector('[data-anxiety-actions]').innerHTML = actionOptions('anxiety-action', view.choices, view.draft.actions);
  updateHelpfulChoices(view);
  return true;
}

async function saveAnxietyView(depth = state.views.length - 1) {
  const view = currentView();
  if (view?.kind !== 'anxiety' || !app.querySelector('#anxiety-form')?.reportValidity()) return;
  if (view.custom.trim() && !addCustomAction(view)) return;
  const snapshot = copy(view.draft);
  if (snapshot.remindOn && snapshot.remindOn <= dayKey() &&
      ((snapshot.outcome.trim() && snapshot.outcome !== view.original?.outcome) ||
       (snapshot.comparison && snapshot.comparison !== view.original?.comparison))) snapshot.remindOn = null;
  await runBusy(async () => {
    await mutate(() => storage.saveAnxietyLog(snapshot, view.id, view.original));
    view.initial = JSON.stringify(view.draft);
    toast('这条焦虑记录已收好。');
    finishBack(depth);
  });
}

async function removeAnxiety(id) {
  const log = state.data.anxietyLogs?.find(item => item.id === id);
  if (!log) return;
  const choice = await ask('删除这条焦虑记录？', '这条记录和它的后续将一起移除。', [
    { value: 'cancel', label: '保留' },
    { value: 'delete', label: '删除记录', className: 'danger' },
  ]);
  if (choice !== 'delete') return;
  await runBusy(async () => { await mutate(() => storage.removeAnxietyLog(id, log)); render(); toast('这条焦虑记录已移除。'); });
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
    try {
      await editor.draftWrite.catch(() => {});
      await mutate(() => storage.saveEntry(snapshot, editor.id, editor.originalEntry, editor.expectedDraft));
    }
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
  const snapshot = { title: view.title.trim(), date: view.date, kind: view.dayType };
  await runBusy(async () => {
    await mutate(() => storage.saveCountdown(snapshot, view.original?.id, view.original));
    toast('这个日子已收好。');
    finishBack(depth);
  });
}

function viewTitle(view) {
  if (view.kind === 'editor') return view.draft.kind === 'good' ? '今天有一点好' : view.id ? '修改记录' : '写下一点';
  if (view.kind === 'todo') return view.original ? '改一件事' : '记一件事';
  return { countdown: '一个想记住的日子', anxiety: '焦虑记录', photo: '照片', todos: '随手清单', 'good-memory': '翻一件好事' }[view.kind];
}

function renderHeader(view) {
  phoneBack.hidden = !view && !state.tabTrail.length && state.tab === 'today';
  phoneBack.dataset.action = view ? 'back' : 'back-tab';
  phoneBack.lastElementChild.textContent = view?.kind === 'photo' ? '返回日记' : '返回';
  const formId = { editor: 'entry-form', countdown: 'countdown-form', anxiety: 'anxiety-form', todo: 'todo-form' }[view?.kind];
  phoneSave.hidden = !formId;
  if (formId) {
    phoneSave.setAttribute('form', formId);
    phoneSave.textContent = view.kind === 'todo' ? '保存' : view.kind === 'countdown' ? '收好这个日子' : view.id ? '保存修改' : '收好这条记录';
  } else {
    phoneSave.removeAttribute('form');
  }
  tabbar.setAttribute('aria-label', view ? '页面操作' : '日记导航');
  header.hidden = !view && state.tab === 'today';
  if (!view) {
    header.innerHTML = state.tab === 'today' ? '' : `<button type="button" class="back-button" data-action="back-tab">${icon('back')}<span>返回</span></button><span class="header-title" aria-hidden="true"></span><div class="header-actions"></div>`;
    return;
  }
  const title = viewTitle(view);
  const back = view.kind === 'photo' ? '返回日记' : '返回';
  header.innerHTML = `<button type="button" class="back-button" data-action="back">${icon('back')}<span>${back}</span></button><h1 class="header-title">${title}</h1><div class="header-actions">${view.kind === 'editor' ? button('保存', 'save-entry', { className: 'quiet', symbol: 'check' }) : ''}</div>`;
}

function entryMarkup(entry, showDate = false) {
  return `<article class="entry-card${entry.kind === 'good' ? ' good-card' : ''}" data-entry-card="${escape(entry.id)}">${entry.kind === 'good' ? '<p class="good-label">今天有一点好</p>' : ''}<div class="entry-meta"><div class="entry-time">${icon('flower')}<time datetime="${escape(entry.occurredAt)}">${showDate ? `${escape(dateLabel(entry.occurredAt, true))} · ` : ''}${escape(timeLabel(entry.occurredAt))}</time></div><div class="entry-tools"><button type="button" class="icon-button" data-action="edit-entry" data-id="${escape(entry.id)}" aria-label="修改 ${escape(timeLabel(entry.occurredAt))} 的记录">${icon('edit')}</button><button type="button" class="icon-button" data-action="delete-entry" data-id="${escape(entry.id)}" aria-label="删除 ${escape(timeLabel(entry.occurredAt))} 的记录">${icon('trash')}</button></div></div>${entry.text ? `<p class="entry-body">${escape(entry.text)}</p>` : ''}${photoStrip(entry.photos)}</article>`;
}

function photoStrip(photos, editable = false) {
  if (!photos.length) return '';
  return `<div class="entry-photos">${photos.map((photo, index) => `<div class="photo-item"><button type="button" class="photo-button" data-action="view-photo" data-photo-id="${escape(photo.id)}" aria-label="查看第 ${index + 1} 张照片"><img class="photo-thumb" data-photo-id="${escape(photo.id)}" alt="日记照片 ${index + 1}" loading="lazy"></button>${editable ? `<button type="button" class="photo-remove" data-action="remove-photo" data-photo-id="${escape(photo.id)}" aria-label="移除第 ${index + 1} 张照片">${icon('close')}</button>` : ''}</div>`).join('')}</div>`;
}

function anxietyMarkup(log, showDate) {
  const id = escape(log.id);
  const time = escape(timeLabel(log.occurredAt));
  const hasFollowup = log.outcome || log.actions.length || log.comparison;
  return `<article class="entry-card anxiety-card" data-anxiety-card="${id}">
    <div class="entry-meta"><div class="entry-time">${icon('heart')}<time datetime="${escape(log.occurredAt)}">${showDate ? escape(dateLabel(log.occurredAt, true)) + ' · ' : ''}${time}</time></div>
      <button type="button" class="icon-button" data-action="delete-anxiety" data-id="${id}" aria-label="删除 ${time} 的焦虑记录">${icon('trash')}</button></div>
    <h3 class="anxiety-level">焦虑<span>${intensityLabels[log.intensity - 1]}</span></h3>
    ${log.worry ? `<p class="entry-body">${escape(log.worry)}</p>` : ''}
    ${log.outcome ? `<div class="anxiety-after"><strong>后来</strong><p class="entry-body">${escape(log.outcome)}</p></div>` : ''}
    ${log.comparison ? `<p class="comparison-note">和当时想的相比：${escape(comparisons[log.comparison])}</p>` : ''}
    ${log.actions.length ? `<ul class="anxiety-methods" aria-label="当时试过的做法">${log.actions.map(action => `<li>${escape(action)}${log.helpfulActions.includes(action) ? '<span>有帮助</span>' : ''}</li>`).join('')}</ul>` : ''}
    ${button(hasFollowup ? '修改这条记录' : '后来怎么样了？', 'edit-anxiety', { className: 'quiet anxiety-followup', attributes: `data-id="${id}"`, symbol: 'edit' })}
  </article>`;
}

function diaryTimeline(date, query = '') {
  const rows = [...state.data.entries, ...(state.data.anxietyLogs ?? [])].filter(item => {
    if (!query) return dayKey(item.occurredAt) === date;
    const terms = 'intensity' in item
      ? ['焦虑', intensityLabels[item.intensity - 1], item.worry, item.outcome, comparisons[item.comparison] ?? '', ...item.actions, ...(item.helpfulActions.length ? ['有帮助'] : [])]
      : [item.text, item.kind === 'good' ? '今天有一点好' : ''];
    return [...terms, dayKey(item.occurredAt)].some(term => term.toLocaleLowerCase().includes(query));
  });
  rows.sort((a, b) => query ? b.occurredAt.localeCompare(a.occurredAt) : a.occurredAt.localeCompare(b.occurredAt));
  return { count: rows.length, html: rows.map(row => 'intensity' in row ? anxietyMarkup(row, Boolean(query)) : entryMarkup(row, Boolean(query))).join('') };
}

function countdownMarkup(item, compact = false) {
  const difference = dateDifference(item.date);
  const anniversary = item.kind === 'anniversary';
  const elapsed = anniversary && difference < 0;
  const unit = difference > 0 ? '天后' : elapsed ? '天' : '天前';
  const title = compact ? escape(item.title) : `<button type="button" class="day-edit" data-action="edit-countdown" data-id="${escape(item.id)}" aria-label="编辑${escape(item.title)}">${escape(item.title)}${icon('edit')}</button>`;
  return `<article class="countdown-card${compact ? ' compact' : ''}${anniversary ? ' anniversary-card' : ''}">
    <span class="countdown-flower">${icon(anniversary ? 'calendar' : 'flower')}</span>
    <div class="countdown-copy"><h3>${title}</h3><p>${escape(parseDay(item.date).toLocaleDateString('zh-CN'))}</p></div>
    <div class="countdown-number">${elapsed ? '<span class="day-since">已过</span>' : ''}<strong>${difference === 0 ? '今天' : Math.abs(difference)}</strong>${difference ? `<span>${unit}</span>` : ''}</div>
    ${!compact ? `<button type="button" class="icon-button" data-action="delete-countdown" data-id="${escape(item.id)}" aria-label="移除${escape(item.title)}">${icon('trash')}</button>` : ''}
  </article>`;
}

function dueFollowupMarkup() {
  const todayKey = dayKey();
  const log = (state.data.anxietyLogs ?? []).filter(item => item.remindOn && item.remindOn <= todayKey)
    .sort((a, b) => a.remindOn.localeCompare(b.remindOn) || a.occurredAt.localeCompare(b.occurredAt))[0];
  if (!log) return '';
  const attributes = `data-id="${escape(log.id)}"`;
  return `<section class="followup-card" data-followup-card="${escape(log.id)}"><div class="followup-heading">
    <img src="${escape(currentMascot().image)}" alt=""><div><p class="eyebrow">${escape(currentMascot().name)}来问问你</p><h2>那件事，后来怎么样了？</h2></div></div>
    <p class="field-help">${escape(dateLabel(log.occurredAt, true))}记下的担心</p>
    ${log.worry ? `<p class="followup-worry">${escape(log.worry)}</p>` : `<p class="followup-worry">那天你选了「${escape(intensityLabels[log.intensity - 1])}」。</p>`}
    <div class="followup-actions">${button('写两句', 'followup-now', { className: 'secondary', attributes })}
    ${button('明天再问', 'snooze-followup', { className: 'quiet', attributes })}
    ${button('收起这次回访', 'dismiss-followup', { className: 'text-action', attributes })}</div></section>`;
}

async function rescheduleFollowup(id, remindOn) {
  const log = state.data.anxietyLogs.find(item => item.id === id);
  if (!log) return;
  await runBusy(async () => {
    await mutate(() => storage.saveAnxietyLog({ remindOn }, id, log));
    render();
    toast(remindOn ? '明天再打开日记时，小猪会来问你。' : '这次回访已收起。');
  });
}

function recallGood() {
  const current = currentView();
  const choices = state.data.entries.filter(entry => entry.kind === 'good' && entry.id !== current?.entryId);
  if (!choices.length) { toast('暂时没有其他小事了。'); return; }
  const entryId = choices[Math.floor(Math.random() * choices.length)].id;
  if (current?.kind === 'good-memory') { current.entryId = entryId; render(); }
  else openView({ kind: 'good-memory', entryId });
}

function renderGoodMemory(view) {
  const entry = state.data.entries.find(item => item.id === view.entryId && item.kind === 'good');
  const hasOthers = state.data.entries.some(item => item.kind === 'good' && item.id !== view.entryId);
  return `<section class="page">${entry ? entryMarkup(entry, true) : '<p>这件小事已移除。</p>'}
    ${hasOthers ? button('再翻一件', 'recall-good', { className: 'quiet recall-good', symbol: 'flower' }) : ''}</section>`;
}

function renderToday() {
  const mascot = currentMascot();
  const timeline = diaryTimeline(dayKey());
  const byDate = [...state.data.countdowns].sort((a, b) => a.date.localeCompare(b.date));
  const nextDay = byDate.find(item => dateDifference(item.date) >= 0) || byDate.reverse().find(item => item.kind === 'anniversary');
  const draft = state.data.draft;
  return `<section class="page page-stack"><div class="page-heading masthead"><div><p class="eyebrow">${escape(dateLabel(new Date(), true))}</p><h1>小猪向阳日记</h1></div><button type="button" class="sync-shortcut" data-action="show-sync" aria-label="查看私人同步状态">${icon('cloud')}<span data-sync-label></span></button></div>
    <section class="hero"><div class="hero-copy"><p class="eyebrow">今天的小伙伴</p><h2>${escape(mascot.name)}</h2><p>文字和照片，记在这里。</p><div class="hero-buttons">
      ${button(draft && !draft.kind ? '继续上次的草稿' : '写一条记录', 'new-entry', { className: 'primary', symbol: 'edit' })}
      ${button('我现在有点焦虑', 'new-anxiety', { className: 'quiet', symbol: 'heart' })}
    </div></div><div class="hero-art"><img class="hero-mascot hero-pig" src="${escape(mascot.image)}" alt="穿着动物服的${escape(mascot.name)}"></div></section>
    <div class="journal-shortcuts">${button(draft?.kind === 'good' ? '继续写今天的一点好' : '今天有一点好', 'new-good', { className: 'good-shortcut', symbol: 'flower' })}${button('随手清单', 'open-todos', { className: 'quiet', symbol: 'check' })}</div>
    ${dueFollowupMarkup()}
    <div class="journal-layout"><div class="journal-main"><div class="section-heading"><h2>今天的小片段</h2>${timeline.count ? `<span class="muted">${timeline.count} 条 · 按发生时间</span>` : ''}</div>${timeline.html || emptyState('今天还没有记录', '点「写一条记录」开始。\n想起以前的事，可以改发生时间补记。')}</div>
    <aside class="journal-aside"><div class="section-heading"><h2>期待与纪念</h2>${button('全部', 'show-countdowns', { className: 'quiet' })}</div>${nextDay ? countdownMarkup(nextDay, true) : `<div class="card gentle-card"><h3>还没有即将到来的日子</h3>${button('加一个日子', 'new-countdown', { className: 'secondary', symbol: 'add' })}</div>`}</aside></div></section>`;
}

function calendarMarkup() {
  const month = parseDay(`${state.reviewMonth}-01`);
  const numberOfDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const padding = (month.getDay() + 6) % 7;
  const counts = new Map();
  for (const entry of [...state.data.entries, ...(state.data.anxietyLogs ?? [])]) { const key = dayKey(entry.occurredAt); counts.set(key, (counts.get(key) || 0) + 1); }
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
  const timeline = diaryTimeline(state.reviewDate, query);
  const empty = () => emptyState(query ? '暂时没有找到' : '这一天还没有记录', query ? '换一个关键词试试看。' : '后来想起来，也可以把它补在这一天。', query ? 'search' : 'calendar');
  return `<div class="section-heading"><h2>${query ? '找到的小片段' : escape(dateLabel(state.reviewDate, true))}</h2><span class="muted">${timeline.count} 条</span></div>${timeline.html || empty()}${query ? '' : `<div class="button-row">${button('补写这一天', 'backfill-entry', { className: 'secondary', symbol: 'edit' })}${button('补记焦虑', 'backfill-anxiety', { className: 'quiet', symbol: 'heart' })}</div>`}`;
}

function renderReview() {
  return `<section class="page page-stack"><div class="page-heading"><div><p class="eyebrow">一页一页，慢慢翻</p><h1>回看</h1><p class="muted">把记得的，慢慢找回来。</p></div></div>${button('随机翻一件好事', 'recall-good', { className: 'quiet recall-good', symbol: 'flower', attributes: state.data.entries.some(entry => entry.kind === 'good') ? '' : 'hidden' })}<label class="search-field">${icon('search')}<span class="sr-only">搜索全部日记</span><input class="field-control" type="search" id="journal-search" value="${escape(state.query)}" placeholder="找一段话，或一件小事" maxlength="200" autocomplete="off"></label><div data-calendar ${state.query.trim() ? 'hidden' : ''}>${calendarMarkup()}</div><div class="page-stack" data-review-results>${reviewResults()}</div></section>`;
}

function renderCountdowns() {
  const countdowns = [...state.data.countdowns].sort((a, b) => {
    const aPast = dateDifference(a.date) < 0;
    const bPast = dateDifference(b.date) < 0;
    if (aPast !== bPast) return aPast ? 1 : -1;
    return aPast ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
  });
  function section(label, days) {
    if (!days.length) return '';
    return `<section class="countdown-list"><h2 class="day-section-heading">${label}</h2>${days.map(item => countdownMarkup(item)).join('')}</section>`;
  }
  const upcoming = section('期待日', countdowns.filter(item => item.kind !== 'anniversary'));
  const anniversaries = section('纪念日', countdowns.filter(item => item.kind === 'anniversary'));
  return `<section class="page page-stack"><div class="page-heading"><div><h1>期待与纪念</h1></div>${button('加一个日子', 'new-countdown', { className: 'primary', symbol: 'add' })}</div>${upcoming || anniversaries ? upcoming + anniversaries : emptyState('还没有特别的日子', '记下下次旅行的倒数，或从初次见面那天开始数日子。', 'calendar')}</section>`;
}

function offlineStatusMarkup() {
  const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  return `<div class="status-line"><span class="status-pill">${installed ? '已从主屏幕打开' : '正在浏览器里预览'}</span><span class="status-pill" data-offline-indicator>${window.diaryOfflineReady ? '离线已就绪' : '正在准备离线'}</span></div>`;
}

const syncLabels = {
  pending: '等待同步', syncing: '同步中', synced: '已同步',
  offline: '离线', signin: '需要登录', error: '同步未完成',
};

function updateSyncStatus(status) {
  state.sync = status;
  for (const label of app.querySelectorAll('[data-sync-label]')) {
    label.textContent = syncLabels[status.state] || syncLabels.pending;
    label.dataset.state = status.state;
  }
  const message = app.querySelector('[data-sync-message]');
  if (message && message.textContent !== status.message) message.textContent = status.message;
  const timestamp = app.querySelector('[data-sync-time]');
  if (timestamp) {
    timestamp.hidden = !status.lastSyncedAt;
    if (status.lastSyncedAt) {
      const date = new Date(status.lastSyncedAt);
      const day = dayKey(date) === dayKey() ? '今天' : date.toLocaleDateString('zh-CN');
      timestamp.textContent = `上次同步于${day} ${timeLabel(date)}`;
    }
  }
  const signin = app.querySelector('[data-sync-signin]');
  if (signin) signin.hidden = status.state !== 'signin';
}

function receiveSyncedDiary(diary) {
  state.data = diary;
  if (['todos', 'good-memory'].includes(currentView()?.kind) && !state.busy && !state.dialogOpen) { render(); return; }
  // Keep any open editor, date picker, photo viewer or search field in place.
  if (currentView() || state.loading || state.error) return;
  if (state.tab === 'review' && app.querySelector('[data-review-results]')) {
    app.querySelector('[data-action="recall-good"]').hidden = !diary.entries.some(entry => entry.kind === 'good');
    app.querySelector('[data-calendar]').innerHTML = calendarMarkup();
    app.querySelector('[data-review-results]').innerHTML = reviewResults();
    void hydratePhotos();
  } else {
    render();
  }
}

function renderSettings() {
  return `<section class="page page-stack">
    <div class="page-heading"><div><p class="eyebrow">只属于你的小角落</p><h1>我的</h1></div></div>
    <section class="settings-card" aria-labelledby="sync-heading">
      <div class="section-heading"><h2 id="sync-heading">私人同步</h2><span class="status-pill" data-sync-label></span></div>
      <p>在电脑和 iPhone 用同一个 ChatGPT 账号打开这本日记。日记、照片、草稿、焦虑记录、随手清单、期待与纪念日和小猪都会自动同步。</p>
      <div class="sync-detail"><p data-sync-message role="status"></p><small class="field-help" data-sync-time hidden></small></div>
      <div class="sync-actions">${button('立即同步', 'sync-now', { className: 'secondary', symbol: 'cloud' })}<a class="button primary" href="/signin-with-chatgpt?return_to=%2F" target="_top" data-sync-signin hidden>登录 ChatGPT</a></div>
    </section>
    <section class="settings-card"><div class="section-heading"><h2>今天让谁陪你？</h2></div><div class="mascot-grid">${mascots.map((mascot) => `<button type="button" class="mascot-card${mascot.id === state.data.mascot ? ' is-selected' : ''}" data-action="select-mascot" data-id="${escape(mascot.id)}" aria-pressed="${mascot.id === state.data.mascot}" style="--mascot-color:${escape(mascot.color)}"><img class="mascot-thumb" src="${escape(mascot.image)}" alt=""><span>${escape(mascot.name)}${mascot.id === state.data.mascot ? icon('check') : ''}</span></button>`).join('')}</div></section>
    <section class="settings-card backup-card"><div class="section-heading"><h2>完整备份</h2></div>
      <p>可以把日记、照片、草稿、焦虑记录、随手清单、期待与纪念日和小猪一起导出到 iCloud Drive。</p>
      <div class="button-row">${button('导出完整备份', 'export-backup', { className: 'primary', symbol: 'download' })}${button('从备份恢复', 'choose-backup', { className: 'secondary', symbol: 'upload' })}</div>
      <input id="backup-file" type="file" accept="application/json,.json" class="sr-only" hidden>
      <p class="field-help">每张照片最多 6 MB。完整备份中的照片合计最多 24 MB，备份文件最多 40 MB。</p>
    </section>
    <section class="settings-card"><div class="section-heading"><h2>放到 iPhone 主屏幕</h2></div>${offlineStatusMarkup()}
      <ol class="install-steps"><li>在 Safari 打开日记，点「分享」，选「添加到主屏幕」。</li><li>从主屏幕上的小猪图标打开一次，保持联网，等上方出现「离线已就绪」。</li><li>之后随时可以断网写，联网再打开日记就会同步。</li></ol>
      <p class="field-help">如果以前在 Safari 写过，先在那里等到「已同步」，再打开主屏幕上的日记。</p>
    </section>
  </section>`;
}

function renderEditor(editor) {
  return `<section class="page editor-view"><form id="entry-form" class="editor-form"><div class="field"><label class="field-label" for="occurred-at">事情发生在</label><input class="field-control" id="occurred-at" name="occurredAt" type="datetime-local" value="${escape(editor.timeInput)}" required step="60"><p class="field-help">现在想起以前的事，也可以改成当时的日期和时间。</p></div><div class="field"><label class="field-label${editor.draft.kind === 'good' ? '' : ' sr-only'}" for="entry-text">${editor.draft.kind === 'good' ? '今天有什么想分享的？' : '日记内容'}</label><textarea class="field-control textarea" id="entry-text" name="text" rows="9" maxlength="50000" placeholder="${editor.draft.kind === 'good' ? '看到的、想到的，都可以讲给小猪听…' : '刚刚发生了什么，或是突然想起了什么…'}">${escape(editor.draft.text)}</textarea></div><div data-editor-photos>${photoStrip(editor.draft.photos, true)}</div><div class="editor-toolbar">${button('加几张照片', 'choose-photo', { className: 'secondary', symbol: 'image' })}<span class="field-help">${editor.draft.photos.length}/12 张</span></div><input id="entry-photos" type="file" accept="image/*" multiple class="sr-only" hidden><div class="editor-footer"><p class="draft-status" data-draft-status role="status">${editor.detached ? '点保存收好这条记录。另一份草稿会留着。' : editor.id ? '修改后，点「保存修改」收好。' : '草稿会自动保存在本机，联网后会同步。'}</p><button type="submit" class="button primary">${icon('check')}<span>${editor.id ? '保存修改' : '收好这条记录'}</span></button></div></form></section>`;
}

function renderCountdownForm(view) {
  const types = [['countdown', '期待日'], ['anniversary', '纪念日']];
  const options = types.map(([value, label]) => `<label><input type="radio" name="day-type" value="${value}"${view.dayType === value ? ' checked' : ''}><span>${label}</span></label>`).join('');
  return `<section class="page editor-view"><form id="countdown-form" class="editor-form">
    <fieldset class="day-type"><legend class="field-label">日子类型</legend><div class="day-types">${options}</div></fieldset>
    <div class="field"><label class="field-label" for="countdown-title">这是什么日子？</label><input class="field-control" id="countdown-title" name="title" placeholder="例如：第一次一起旅行" maxlength="80" value="${escape(view.title)}" required autocomplete="off"></div>
    <div class="field"><label class="field-label" for="countdown-date">它在哪一天？</label><input class="field-control" id="countdown-date" name="date" type="date" min="1900-01-01" max="2200-12-31" value="${escape(view.date)}" required></div>
    <div class="editor-footer"><button type="submit" class="button primary">${icon('check')}<span>收好这个日子</span></button></div></form></section>`;
}

function todoMarkup(item) {
  const id = escape(item.id);
  const label = escape(item.text);
  return `<li class="todo-row${item.done ? ' is-done' : ''}" data-todo-id="${id}">
    <button type="button" class="todo-toggle" role="checkbox" aria-checked="${item.done}" data-action="toggle-todo" data-id="${id}">
      <span class="todo-check" aria-hidden="true">${item.done ? icon('check') : ''}</span><span>${label}</span></button>
    <div class="entry-tools"><button type="button" class="icon-button" data-action="edit-todo" data-id="${id}" aria-label="修改：${label}">${icon('edit')}</button>
      <button type="button" class="icon-button" data-action="delete-todo" data-id="${id}" aria-label="移除：${label}">${icon('trash')}</button></div></li>`;
}

function renderTodos() {
  const todos = state.data.todos ?? [];
  const pending = todos.filter(item => !item.done);
  const done = todos.filter(item => item.done);
  return `<section class="page page-stack todo-page"><div class="section-heading"><p>想做的事，先放在这里。</p>
    ${button('记一件事', 'new-todo', { className: 'secondary', symbol: 'add' })}</div>
    ${pending.length ? `<ul class="todo-list" aria-label="想做的事">${pending.map(todoMarkup).join('')}</ul>` : ''}
    ${done.length ? `<details class="todo-done" ${currentView().showDone ? 'open' : ''}><summary>已经做过的事</summary><ul class="todo-list">${done.map(todoMarkup).join('')}</ul></details>` : ''}</section>`;
}

function renderTodoForm(view) {
  return `<section class="page editor-view"><form id="todo-form" class="editor-form"><div class="field">
    <label for="todo-text">想做什么？</label><textarea id="todo-text" class="field-control" required maxlength="500" rows="3"
      placeholder="比如，哪天想去那家小店看看">${escape(view.text)}</textarea></div>
    <div class="editor-footer"><button type="submit" class="button primary">${icon('check')}<span>保存</span></button></div></form></section>`;
}

async function saveTodoView(depth = state.views.length - 1) {
  const view = currentView();
  if (view?.kind !== 'todo' || !app.querySelector('#todo-form')?.reportValidity()) return;
  const text = view.text.trim();
  if (!text) { toast('写下想做的事就可以保存。', true); return; }
  await runBusy(async () => {
    await mutate(() => storage.saveTodo({ text }, view.original?.id, view.original));
    finishBack(depth);
  });
}

async function changeTodo(action, id) {
  const item = state.data.todos?.find(row => row.id === id);
  if (!item) { render(); return; }
  if (action === 'edit-todo') { openView({ kind: 'todo', original: item, text: item.text }); return; }
  if (action === 'delete-todo') {
    const answer = await ask('从清单移除这件事？', item.text, [
      { value: 'cancel', label: '保留' }, { value: 'delete', label: '移除', className: 'danger' },
    ]);
    if (answer !== 'delete') return;
  }
  await runBusy(async () => {
    await mutate(() => action === 'delete-todo' ? storage.removeTodo(id, item) : storage.saveTodo({ done: !item.done }, id, item));
    render();
  });
}

function renderPhotoViewer(view) {
  return `<section class="page photo-viewer" aria-label="照片预览"><img class="viewer-image" data-photo-id="${escape(view.photo.id)}" alt="日记照片，原图预览"></section>`;
}

function actionOptions(name, choices, selected) {
  return choices.map(action => `<label class="anxiety-option"><input type="checkbox" name="${name}" value="${escape(action)}"${selected.includes(action) ? ' checked' : ''}><span>${escape(action)}</span></label>`).join('');
}

function helpfulChoices(draft) {
  return draft.actions.length ? `<fieldset class="anxiety-group"><legend>哪些做法对你有帮助？</legend>
    <div class="anxiety-options">${actionOptions('anxiety-helpful', draft.actions, draft.helpfulActions)}</div></fieldset>` : '';
}

function updateHelpfulChoices(view) {
  app.querySelector('[data-anxiety-helpful]').innerHTML = helpfulChoices(view.draft);
}

function renderAnxietyForm(view) {
  const { draft, id } = view;
  const mascot = currentMascot();
  const historical = dayKey(draft.occurredAt) !== dayKey();
  const recent = !id && (state.data.anxietyLogs ?? [])
    .filter(log => log.occurredAt <= draft.occurredAt && log.helpfulActions.length)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  const intensities = intensityLabels.map((label, index) => `<label class="anxiety-option"><input type="radio" name="anxiety-intensity" value="${index + 1}" required${draft.intensity === index + 1 ? ' checked' : ''}><span>${label}</span></label>`).join('');
  const comparison = `<fieldset class="anxiety-group"><legend>和当时想的相比，实际怎么样？ <small>选填</small></legend>
    <div class="anxiety-options comparison-options">${Object.entries(comparisons).map(([value, label]) => `<label class="anxiety-option"><input type="radio" name="anxiety-comparison" value="${value}"${draft.comparison === value ? ' checked' : ''}><span>${label}</span></label>`).join('')}</div>
    <button type="button" class="button text-action" data-action="clear-comparison"${draft.comparison ? '' : ' hidden'}>清除选择</button></fieldset>`;
  const scheduled = draft.remindOn && draft.remindOn > dayKey();
  const reminder = `<div class="reminder-field"><label><input type="checkbox" id="anxiety-reminder"${scheduled ? ' checked' : ''}>
    <span>${scheduled && draft.remindOn !== tomorrow() ? escape(dateLabel(draft.remindOn)) + '再问我' : '明天问问我'}</span></label>
    <p class="field-help">到时候打开日记，小猪会来问问你。</p></div>`;
  const worry = `<div class="field"><label for="anxiety-worry">${id ? '当时担心的事' : '心里的担心'} <small>选填</small></label>
    <textarea class="field-control" id="anxiety-worry" rows="3" maxlength="50000" placeholder="${id ? '那时你担心什么？' : '写一句就好，也可以先空着。'}">${escape(draft.worry)}</textarea></div>`;
  const followup = id ? `<div class="field"><label for="anxiety-outcome">后来发生了什么？ <small>选填</small></label>
    <textarea class="field-control" id="anxiety-outcome" rows="3" maxlength="50000" placeholder="事情后来怎么了，你现在有什么感觉？">${escape(draft.outcome)}</textarea></div>
    ${comparison}
    <fieldset class="anxiety-group"><legend>当时试过什么？</legend><div class="anxiety-options" data-anxiety-actions>${actionOptions('anxiety-action', view.choices, draft.actions)}</div>
      <div class="anxiety-custom-row"><label for="anxiety-custom" class="sr-only">其他做法</label><input class="field-control" type="text" id="anxiety-custom" maxlength="120" placeholder="写下其他做法" value="${escape(view.custom)}">
      ${button('添加', 'add-anxiety-action', { className: 'secondary', symbol: 'add' })}</div></fieldset>
    <div data-anxiety-helpful>${helpfulChoices(draft)}</div>` : '';
  return `<section class="page editor-view"><form id="anxiety-form" class="editor-form anxiety-form">
    <div class="anxiety-prompt"><div class="anxiety-portrait" style="--mascot-color:${escape(mascot.color)}"><img src="${escape(mascot.image)}" alt=""></div>
      <div><p class="eyebrow">${escape(mascot.name)}陪你记</p><h2>${id ? '后来怎么样了？' : historical ? '当时最担心什么？' : '现在最担心什么？'}</h2>
      <p class="field-help">${id || historical ? escape(dateLabel(draft.occurredAt, true)) + ' · ' + escape(timeLabel(draft.occurredAt)) : '只选一下感受，也可以保存。'}</p></div></div>
    ${recent ? `<p class="anxiety-suggestion" data-anxiety-suggestion>你之前记过，「${escape(recent.helpfulActions[0])}」对你有帮助。</p>` : ''}
    ${id ? worry + followup : ''}
    <fieldset class="anxiety-group"><legend>${id || historical ? '当时的焦虑有多强？' : '此刻的焦虑有多强？'}</legend><div class="anxiety-options intensity-options">${intensities}</div></fieldset>
    ${id ? '' : worry}
    ${reminder}
    <div class="editor-footer"><button type="submit" class="button primary">${icon('check')}<span>${id ? '保存修改' : '收好这条记录'}</span></button></div>
  </form></section>`;
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
  const title = view ? viewTitle(view) : ({ today: '今天', review: '回看', countdowns: '期待', settings: '我的' })[state.tab];
  document.title = `${title} · 小猪向阳日记`;
  if (view?.kind === 'editor') app.innerHTML = renderEditor(view);
  else if (view?.kind === 'todos') app.innerHTML = renderTodos();
  else if (view?.kind === 'todo') app.innerHTML = renderTodoForm(view);
  else if (view?.kind === 'good-memory') app.innerHTML = renderGoodMemory(view);
  else if (view?.kind === 'anxiety') app.innerHTML = renderAnxietyForm(view);
  else if (view?.kind === 'countdown') app.innerHTML = renderCountdownForm(view);
  else if (view?.kind === 'photo') app.innerHTML = renderPhotoViewer(view);
  else app.innerHTML = ({ today: renderToday, review: renderReview, countdowns: renderCountdowns, settings: renderSettings })[state.tab]();
  updateSyncStatus(state.sync);
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
  const choice = await ask('从备份恢复？', '这份备份会替换本机日记，联网后再与云端已有的记录合并。建议先导出当前备份，保留尚未同步的内容。', [
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
  await runBusy(async () => { await mutate(() => storage.removeEntry(id, entry)); render(); toast('这条记录已移除。'); });
}

async function removeCountdown(id) {
  const item = state.data.countdowns.find((countdown) => countdown.id === id);
  if (!item) return;
  const choice = await ask('移除这个日子？', item.title, [{ value: 'cancel', label: '保留' }, { value: 'delete', label: '移除', className: 'danger' }]);
  if (choice !== 'delete') return;
  await runBusy(async () => { await mutate(() => storage.removeCountdown(id, item)); render(); toast('这个日子已移除。'); });
}

async function handleAction(action, element) {
  if (state.busy || state.navigation || state.dialogOpen) return;
  switch (action) {
    case 'back': await requestBack(); break;
    case 'back-tab': backTab(); break;
    case 'retry-load': await initialize(); break;
    case 'show-sync': setTab('settings'); break;
    case 'sync-now': requestSync?.(); break;
    case 'new-entry': openEditor(); break;
    case 'new-good': openEditor(undefined, undefined, 'good'); break;
    case 'recall-good': recallGood(); break;
    case 'open-todos': openView({ kind: 'todos', showDone: false }); break;
    case 'new-todo': openView({ kind: 'todo', text: '' }); break;
    case 'edit-todo':
    case 'delete-todo':
    case 'toggle-todo': await changeTodo(action, element.dataset.id); break;
    case 'followup-now': openAnxiety(element.dataset.id); break;
    case 'snooze-followup': await rescheduleFollowup(element.dataset.id, tomorrow()); break;
    case 'dismiss-followup': await rescheduleFollowup(element.dataset.id, null); break;
    case 'clear-comparison': {
      const view = currentView();
      if (view?.kind !== 'anxiety') break;
      view.draft.comparison = null;
      for (const input of app.querySelectorAll('[name="anxiety-comparison"]')) input.checked = false;
      element.hidden = true;
      break;
    }
    case 'new-anxiety': openAnxiety(); break;
    case 'backfill-anxiety': openAnxiety(undefined, state.reviewDate); break;
    case 'edit-anxiety': openAnxiety(element.dataset.id); break;
    case 'delete-anxiety': await removeAnxiety(element.dataset.id); break;
    case 'add-anxiety-action':
      if (currentView()?.kind === 'anxiety') addCustomAction(currentView());
      break;
    case 'backfill-entry':
      if (state.data.draft && !state.data.draft.kind && hasContent(state.data.draft)) toast('已打开上次的草稿，改一下发生日期就能补记。');
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
    case 'new-countdown':
    case 'edit-countdown': {
      const original = state.data.countdowns.find(item => item.id === element.dataset.id);
      if (action === 'edit-countdown' && !original) { toast('这个日子已移除。'); break; }
      const date = original?.date ?? dayKey();
      openView({ kind: 'countdown', original, title: original?.title ?? '', date, initialDate: date, dayType: original?.kind ?? 'countdown' });
      break;
    }
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

app.addEventListener('toggle', event => {
  if (event.target.matches('details.todo-done') && event.target.isConnected && currentView()?.kind === 'todos') currentView().showDone = event.target.open;
}, true);

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
  if (view?.kind === 'anxiety') {
    if (target.id === 'anxiety-worry') view.draft.worry = target.value;
    if (target.id === 'anxiety-outcome') view.draft.outcome = target.value;
    if (target.id === 'anxiety-custom') view.custom = target.value;
  } else if (view?.kind === 'todo' && target.id === 'todo-text') {
    view.text = target.value;
  } else if (view?.kind === 'editor') {
    if (target.id === 'entry-text') { view.draft.text = target.value; view.version++; scheduleDraft(view); }
    if (target.id === 'occurred-at') {
      view.timeInput = target.value;
      const parsed = new Date(target.value);
      if (target.value && !Number.isNaN(parsed.getTime())) { view.draft.occurredAt = parsed.toISOString(); view.version++; scheduleDraft(view); }
    }
  } else if (view?.kind === 'countdown') {
    if (target.id === 'countdown-title') view.title = target.value;
    if (target.id === 'countdown-date') view.date = target.value;
    if (target.name === 'day-type' && target.checked) view.dayType = target.value;
  }
});

app.addEventListener('change', (event) => {
  const target = event.target;
  const view = currentView();
  if (view?.kind === 'anxiety') {
    if (target.id === 'anxiety-reminder') view.draft.remindOn = target.checked ? tomorrow() : null;
    if (target.name === 'anxiety-comparison') {
      view.draft.comparison = target.value;
      app.querySelector('[data-action="clear-comparison"]').hidden = false;
    }
    if (target.name === 'anxiety-intensity') view.draft.intensity = Number(target.value);
    if (target.name === 'anxiety-action') {
      const actions = Array.from(app.querySelectorAll('input[name="anxiety-action"]:checked'), input => input.value);
      if (actions.length > 32) { target.checked = false; toast('每条记录最多可记 32 种做法。', true); return; }
      view.draft.actions = actions;
      view.draft.helpfulActions = view.draft.helpfulActions.filter(action => actions.includes(action));
      updateHelpfulChoices(view);
    }
    if (target.name === 'anxiety-helpful') {
      view.draft.helpfulActions = Array.from(app.querySelectorAll('input[name="anxiety-helpful"]:checked'), input => input.value);
    }
  }
  if (target.id === 'entry-photos') { const files = [...target.files]; target.value = ''; void addPhotos(files); }
  if (target.id === 'backup-file') { const file = target.files[0]; target.value = ''; void importDiary(file); }
});

app.addEventListener('submit', (event) => {
  event.preventDefault();
  if (event.target.id === 'entry-form') void saveEditor();
  if (event.target.id === 'anxiety-form') void saveAnxietyView();
  if (event.target.id === 'todo-form') void saveTodoView();
  if (event.target.id === 'countdown-form') void saveCountdownView();
});

function updateKeyboardInset() {
  const viewport = window.visualViewport;
  const gap = viewport && viewport.scale === 1 && phoneLayout.matches
    ? Math.round(innerHeight - viewport.height - viewport.offsetTop) : 0;
  document.documentElement.style.setProperty('--keyboard-inset', (gap > 80 ? gap : 0) + 'px');
}
window.visualViewport?.addEventListener('resize', updateKeyboardInset);
window.visualViewport?.addEventListener('scroll', updateKeyboardInset);
updateKeyboardInset();

// Leave the outer screen edge to Safari's own navigation gestures.
document.addEventListener('touchstart', event => {
  swipeStart = null;
  if (!phoneLayout.matches || phoneBack.hidden || state.busy || state.navigation || state.dialogOpen ||
      event.touches.length !== 1 || (window.visualViewport?.scale ?? 1) > 1.01 ||
      !event.target.closest('#content') ||
      event.target.closest('input, textarea, button, a, label, select, [contenteditable], .entry-photos, dialog') ||
      !window.getSelection()?.isCollapsed) return;
  const touch = event.touches[0];
  const fromRight = innerWidth - touch.clientX;
  if (fromRight < 24 || fromRight > Math.min(150, innerWidth * .4)) return;
  swipeStart = { x: touch.clientX, y: touch.clientY, id: touch.identifier, view: currentView(), tab: state.tab };
}, { passive: true });

document.addEventListener('touchmove', event => {
  if (!swipeStart) return;
  const touch = event.touches[0];
  const left = swipeStart.x - touch.clientX;
  const vertical = Math.abs(touch.clientY - swipeStart.y);
  if (event.touches.length !== 1 || left < -10 || vertical > 32 || (vertical > 10 && vertical > left)) {
    swipeStart = null;
  } else if (event.cancelable && left > 16 && left > vertical * 2) {
    event.preventDefault();
  }
}, { passive: false });

document.addEventListener('touchcancel', () => { swipeStart = null; }, { passive: true });
document.addEventListener('touchend', event => {
  const start = swipeStart;
  swipeStart = null;
  const touch = event.changedTouches[0];
  if (!start || !touch || event.touches.length || touch.identifier !== start.id ||
      start.view !== currentView() || start.tab !== state.tab || (window.visualViewport?.scale ?? 1) > 1.01) return;
  const left = start.x - touch.clientX;
  const vertical = Math.abs(touch.clientY - start.y);
  if (left < 72 || vertical > 32 || left < vertical * 2) return;
  if (event.cancelable) event.preventDefault();
  void handleAction(phoneBack.dataset.action, phoneBack).catch(error => toast(errorMessage(error), true));
}, { passive: false });

window.addEventListener('popstate', (event) => {
  swipeStart = null;
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
  const view = currentView();
  if (view?.kind === 'todo' && view.text !== (view.original?.text ?? '')) { event.preventDefault(); event.returnValue = ''; return; }
  if (view?.kind === 'anxiety' && anxietyChanged(view)) { event.preventDefault(); event.returnValue = ''; return; }
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

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') backgroundSave(); else refreshDay(); });
window.addEventListener('pageshow', refreshDay);
window.addEventListener('pagehide', backgroundSave);
window.addEventListener('diaryofflinechange', () => {
  const indicator = app.querySelector('[data-offline-indicator]');
  if (indicator) indicator.textContent = window.diaryOfflineReady ? '离线已就绪' : '正在准备离线';
});
function refreshDay() {
  const nextDay = dayKey();
  if (today === nextDay) return;
  today = nextDay;
  if (!currentView() && !state.busy && !state.loading && !state.error) render();
}
setInterval(refreshDay, 30000);

async function initialize() {
  state.loading = true;
  state.error = '';
  render();
  try {
    state.data = await storage.loadDiary();
    state.loading = false;
    requestSync ??= startSync({ onStatus: updateSyncStatus, onData: receiveSyncedDiary });
  } catch (error) {
    state.loading = false;
    state.error = `${errorMessage(error)} 原来的资料不会被重置；请重新读取。`;
  }
  render();
}

history.replaceState(historyState(0), '', location.href);
void initialize();
