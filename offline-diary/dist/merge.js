export function emptyDiary() {
  return { schemaVersion: 1, entries: [], countdowns: [], mascot: 'dinosaur', draft: null };
}

export function same(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every(key => Object.hasOwn(right, key) && same(left[key], right[key]));
}

// The same conflict must receive the same ID after a lost response or a retry.
// Verify equality before reusing an ID, including in the event of a hash collision.
function copyId(kind, value) {
  let hash = 2166136261;
  for (const character of JSON.stringify(value)) {
    hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
  }
  return `kept_${kind}_${(hash >>> 0).toString(36)}`;
}

function keepCopy(records, value, kind) {
  const prefix = copyId(kind, value);
  let id = prefix;
  let suffix = 0;
  while (records.has(id)) {
    if (same(records.get(id), { ...value, id })) return;
    id = `${prefix}_${++suffix}`;
  }
  records.set(id, { ...value, id });
}

function mergeRecords(base, local, remote, kind) {
  const byId = rows => new Map(rows.map(row => [row.id, row]));
  const original = byId(base);
  const ours = byId(local);
  const theirs = byId(remote);
  const result = new Map();
  const copies = [];
  // Cloud ordering first avoids reshuffling entries on every two-device visit.
  for (const id of new Set([...theirs.keys(), ...ours.keys()])) {
    const before = original.get(id);
    const left = ours.get(id);
    const right = theirs.get(id);
    let selected;
    if (same(left, right) || same(right, before)) selected = left;
    else if (same(left, before)) selected = right;
    else {
      // Concurrent deletion and edit: retain the edited content.
      selected = right || left;
      if (left && right) copies.push(left);
    }
    if (selected) result.set(id, selected);
  }
  for (const value of copies) keepCopy(result, value, kind);
  return result;
}

function entryContent(entry) {
  return { text: entry.text, occurredAt: entry.occurredAt, photos: entry.photos };
}

function keepDraft(entries, draft) {
  if (!draft || (!draft.text.trim() && !draft.photos.length)) return;
  if ([...entries.values()].some(entry => same(entryContent(entry), entryContent(draft)))) return;
  keepCopy(entries, { ...draft, createdAt: draft.occurredAt, updatedAt: draft.occurredAt }, 'draft');
}

export function preserveDraft(diary, draft) {
  const entries = new Map(diary.entries.map(entry => [entry.id, entry]));
  keepDraft(entries, draft);
  return { ...diary, entries: [...entries.values()] };
}

export function mergeDiary(base, local, remote) {
  const entries = mergeRecords(base.entries, local.entries, remote.entries, 'entry');
  const countdowns = mergeRecords(base.countdowns, local.countdowns, remote.countdowns, 'countdown');
  let draft;
  if (same(local.draft, remote.draft) || same(remote.draft, base.draft)) draft = local.draft;
  else if (same(local.draft, base.draft)) draft = remote.draft;
  else {
    draft = local.draft || remote.draft;
    if (local.draft && remote.draft) keepDraft(entries, remote.draft);
  }
  return {
    schemaVersion: 1,
    entries: [...entries.values()],
    countdowns: [...countdowns.values()],
    mascot: local.mascot === base.mascot ? remote.mascot : local.mascot,
    draft
  };
}
