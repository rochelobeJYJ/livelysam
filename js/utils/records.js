(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};

  const STORE_NAME = 'records';
  const CHANGE_EVENT = 'livelysam:recordsChanged';
  const MIGRATION_KEY = 'records_legacy_migrated_v2';
  const GOOGLE_SYNC_DELETE_QUEUE_KEY = 'googleWorkspaceDeleteQueue';

  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
  const CALENDAR_SOURCE_ORDER = { schedule: 0, task: 1, countdown: 2 };
  const FALLBACK_BOOKMARK_ICON = '🔖';
  const BOOKMARK_ICON_PRESETS = [
    '🔖', '⭐', '📌', '🌐', '🔎', '📚', '🏫', '📝',
    '✅', '📅', '⏰', '📎', '💡', '💻', '🧠', '📊',
    '📁', '☁️', '🏠', '🏢', '💬', '📧', '🎬', '🎵',
    '📰', '🛒', '💳', '🗺️', '🚗', '🔧', '⚙️', '❤️'
  ];

  const COLORS = [
    { value: 'blue', label: '파랑', bg: '#E3F2FD', fg: '#1565C0' },
    { value: 'mint', label: '민트', bg: '#E8F5E9', fg: '#2E7D32' },
    { value: 'coral', label: '코랄', bg: '#FFF3E0', fg: '#E65100' },
    { value: 'purple', label: '보라', bg: '#F3E5F5', fg: '#7B1FA2' },
    { value: 'gray', label: '회색', bg: '#F1F3F5', fg: '#495057' },
    { value: 'yellow', label: '노랑', bg: '#FFF9C4', fg: '#8D6E00' },
    { value: 'pink', label: '분홍', bg: '#F8BBD0', fg: '#AD1457' },
    { value: 'green', label: '초록', bg: '#C8E6C9', fg: '#1B5E20' },
    { value: 'orange', label: '주황', bg: '#FFE0B2', fg: '#E65100' }
  ];

  let records = [];
  let initialized = false;
  let initPromise = null;

  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  const nowIso = () => new Date().toISOString();
  const uniq = (values) => [...new Set((values || []).filter(Boolean))];
  const text = (value) => String(value || '').trim();
  const todayStr = () => LS.Helpers.formatDate(new Date(), 'YYYY-MM-DD');

  function normalizeDate(value) {
    const trimmed = text(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
  }

  function normalizeTime(value) {
    const trimmed = text(value);
    return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : '';
  }

  function normalizeCategory(value) {
    return text(value).slice(0, 40);
  }

  function normalizeTags(value) {
    const raw = Array.isArray(value) ? value : String(value || '').split(/[,#\n]/g);
    return uniq(raw.map((item) => text(item))).slice(0, 12);
  }

  function normalizeColor(value) {
    return COLORS.some((item) => item.value === value) ? value : 'blue';
  }

  function normalizeUrl(value) {
    const trimmed = text(value);
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  function normalizeRepeat(rule = {}) {
    return {
      enabled: Boolean(rule?.enabled),
      frequency: ['daily', 'weekly', 'monthly', 'yearly'].includes(rule?.frequency) ? rule.frequency : 'weekly',
      interval: Math.max(1, parseInt(rule?.interval, 10) || 1),
      weekdays: uniq((rule?.weekdays || []).map((value) => parseInt(value, 10)))
        .filter((value) => value >= 1 && value <= 7)
        .sort((a, b) => a - b),
      until: normalizeDate(rule?.until)
    };
  }

  function normalizeGoogleSyncFacetState(raw = {}, facetName = 'calendar') {
    const containerKey = facetName === 'calendar' ? 'calendarId' : 'tasklistId';
    return {
      enabled: Boolean(raw?.enabled),
      remoteId: text(raw?.remoteId),
      [containerKey]: text(raw?.[containerKey] || raw?.containerId),
      remoteUpdatedAt: text(raw?.remoteUpdatedAt),
      lastSyncedAt: text(raw?.lastSyncedAt),
      lastSignature: text(raw?.lastSignature),
      link: normalizeUrl(raw?.link),
      etag: text(raw?.etag),
      readOnly: Boolean(raw?.readOnly)
    };
  }

  function normalizeSyncState(raw = {}) {
    return {
      google: {
        calendar: normalizeGoogleSyncFacetState(raw?.google?.calendar || raw?.calendar, 'calendar'),
        task: normalizeGoogleSyncFacetState(raw?.google?.task || raw?.google?.tasks || raw?.task, 'task')
      }
    };
  }

  function normalizeGoogleSyncDeleteItem(item) {
    return {
      id: text(item?.id),
      provider: 'google',
      kind: item?.kind === 'task' ? 'task' : 'calendar',
      remoteId: text(item?.remoteId),
      containerId: text(item?.containerId),
      recordId: text(item?.recordId),
      queuedAt: text(item?.queuedAt || nowIso())
    };
  }

  function getGoogleSyncDeleteQueue() {
    const items = LS.Storage.get(GOOGLE_SYNC_DELETE_QUEUE_KEY, []);
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => normalizeGoogleSyncDeleteItem(item))
      .filter((item) => item.remoteId);
  }

  function setGoogleSyncDeleteQueue(items) {
    const queue = [];
    const seen = new Set();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const normalized = normalizeGoogleSyncDeleteItem(item);
      if (!normalized.remoteId || seen.has(normalized.id)) return;
      seen.add(normalized.id);
      queue.push(normalized);
    });
    LS.Storage.set(GOOGLE_SYNC_DELETE_QUEUE_KEY, queue);
  }

  function queueGoogleSyncDeletion(kind, syncState, recordId = '') {
    if (!syncState?.remoteId || syncState?.readOnly) return;

    const containerId = text(kind === 'task' ? syncState.tasklistId : syncState.calendarId);
    const queue = getGoogleSyncDeleteQueue();
    queue.unshift({
      id: `${kind}:${containerId}:${syncState.remoteId}`,
      provider: 'google',
      kind,
      remoteId: text(syncState.remoteId),
      containerId,
      recordId: text(recordId),
      queuedAt: nowIso()
    });
    setGoogleSyncDeleteQueue(queue);
  }

  function queueRemovedGoogleSync(previous, next) {
    if (!previous) return;

    const previousCalendar = previous.sync?.google?.calendar;
    const nextCalendar = next?.sync?.google?.calendar;
    if (
      previous.schedule?.enabled
      && previousCalendar?.remoteId
      && (
        !next?.schedule?.enabled
        || previousCalendar.remoteId !== text(nextCalendar?.remoteId)
        || previousCalendar.calendarId !== text(nextCalendar?.calendarId)
      )
    ) {
      queueGoogleSyncDeletion('calendar', previousCalendar, previous.id);
    }

    const previousTask = previous.sync?.google?.task;
    const nextTask = next?.sync?.google?.task;
    if (
      previous.task?.enabled
      && previousTask?.remoteId
      && (
        !next?.task?.enabled
        || previousTask.remoteId !== text(nextTask?.remoteId)
        || previousTask.tasklistId !== text(nextTask?.tasklistId)
      )
    ) {
      queueGoogleSyncDeletion('task', previousTask, previous.id);
    }
  }

  function parseWeekdayText(value) {
    return uniq(
      String(value || '')
        .split(/[^0-9]+/g)
        .map((item) => parseInt(item, 10))
    ).filter((item) => item >= 1 && item <= 7).sort((a, b) => a - b);
  }

  function titleFromBody(body) {
    const firstLine = String(body || '')
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .find(Boolean);
    if (!firstLine) return '';
    return firstLine.length > 36 ? `${firstLine.slice(0, 36)}...` : firstLine;
  }

  function titleFromUrl(url) {
    try {
      return new URL(url).hostname.replace(/^www\./i, '');
    } catch {
      return '';
    }
  }

  function checklistLines(body) {
    return String(body || '')
      .split(/\r?\n/g)
      .map((line, lineIndex) => {
        const match = line.match(/^\s*-\s*\[( |x|X)\]\s*(.+?)\s*$/);
        if (!match) return null;
        return {
          lineIndex,
          done: match[1].toLowerCase() === 'x',
          text: match[2].trim()
        };
      })
      .filter(Boolean);
  }

  function weekdayMon(date) {
    return date.getDay() === 0 ? 7 : date.getDay();
  }

  function matchesRepeat(baseDateStr, repeat, targetDateStr) {
    if (!baseDateStr || !targetDateStr) return false;
    if (baseDateStr === targetDateStr) return true;
    if (!repeat?.enabled) return false;

    const base = new Date(`${baseDateStr}T00:00:00`);
    const target = new Date(`${targetDateStr}T00:00:00`);
    if (Number.isNaN(base.getTime()) || Number.isNaN(target.getTime())) return false;
    if (target < base) return false;

    if (repeat.until) {
      const until = new Date(`${repeat.until}T00:00:00`);
      if (!Number.isNaN(until.getTime()) && target > until) {
        return false;
      }
    }

    const diffDays = Math.floor((target - base) / 86400000);
    const interval = Math.max(1, parseInt(repeat.interval, 10) || 1);

    if (repeat.frequency === 'daily') {
      return diffDays % interval === 0;
    }

    if (repeat.frequency === 'weekly') {
      const weekdays = repeat.weekdays?.length ? repeat.weekdays : [weekdayMon(base)];
      return Math.floor(diffDays / 7) % interval === 0 && weekdays.includes(weekdayMon(target));
    }

    if (repeat.frequency === 'monthly') {
      const monthDiff = ((target.getFullYear() - base.getFullYear()) * 12) + (target.getMonth() - base.getMonth());
      return monthDiff % interval === 0 && target.getDate() === base.getDate();
    }

    if (repeat.frequency === 'yearly') {
      return (target.getFullYear() - base.getFullYear()) % interval === 0
        && target.getMonth() === base.getMonth()
        && target.getDate() === base.getDate();
    }

    return false;
  }

  function getColorMeta(value) {
    return COLORS.find((item) => item.value === normalizeColor(value)) || COLORS[0];
  }

  function getDisplayTitle(record, fallback = '제목 없음') {
    return text(record?.title)
      || titleFromBody(record?.body)
      || (record?.bookmark?.enabled ? titleFromUrl(record.bookmark.url) : '')
      || fallback;
  }

  function getDisplayBody(record) {
    const body = text(record?.body);
    return body && body !== text(record?.title) ? body : '';
  }

  function getFacetLabels(record, exclude = []) {
    const excluded = new Set(exclude || []);
    const labels = [];
    if (record.note?.enabled && !excluded.has('note')) labels.push('메모');
    if (record.task?.enabled && !excluded.has('task')) labels.push('할 일');
    if (record.schedule?.enabled && !excluded.has('schedule')) labels.push('일정');
    if (record.countdown?.enabled && !excluded.has('countdown')) labels.push('D-Day');
    if (record.bookmark?.enabled && !excluded.has('bookmark')) labels.push('북마크');
    return labels;
  }

  function hasFacet(record) {
    return Boolean(
      record.note?.enabled
      || record.task?.enabled
      || record.schedule?.enabled
      || record.countdown?.enabled
      || record.bookmark?.enabled
    );
  }

  function visibleRecords(includeArchived = false) {
    return includeArchived ? records : records.filter((record) => !record.archivedAt);
  }

  function sortByUpdated(a, b) {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  }

  function sortTasks(a, b) {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    if ((a.task.status === 'done') !== (b.task.status === 'done')) {
      return a.task.status === 'done' ? 1 : -1;
    }

    const priorityA = PRIORITY_ORDER[a.task.priority] ?? 1;
    const priorityB = PRIORITY_ORDER[b.task.priority] ?? 1;
    if (priorityA !== priorityB) return priorityA - priorityB;

    if (a.task.dueDate && b.task.dueDate) return a.task.dueDate.localeCompare(b.task.dueDate);
    if (a.task.dueDate) return -1;
    if (b.task.dueDate) return 1;
    return sortByUpdated(a, b);
  }

  function sortCountdowns(a, b) {
    const today = new Date(`${todayStr()}T00:00:00`);
    const diffA = Math.abs(new Date(`${a.countdown.targetDate}T00:00:00`) - today);
    const diffB = Math.abs(new Date(`${b.countdown.targetDate}T00:00:00`) - today);
    if (diffA !== diffB) return diffA - diffB;
    return sortByUpdated(a, b);
  }

  function createRecord(seed = {}) {
    const createdAt = seed.createdAt || nowIso();
    const updatedAt = seed.updatedAt || createdAt;
    const scheduleStart = normalizeTime(seed.schedule?.startTime);
    const scheduleEnd = normalizeTime(seed.schedule?.endTime);

    return {
      id: seed.id || LS.Helpers.generateId(),
      title: text(seed.title),
      body: text(seed.body),
      color: normalizeColor(seed.color),
      pinned: Boolean(seed.pinned),
      archivedAt: seed.archivedAt ? String(seed.archivedAt) : null,
      category: normalizeCategory(seed.category),
      tags: normalizeTags(seed.tags),
      legacyRefs: uniq(seed.legacyRefs),
      note: {
        enabled: Boolean(seed.note?.enabled)
      },
      task: {
        enabled: Boolean(seed.task?.enabled),
        status: seed.task?.status === 'done' ? 'done' : 'open',
        priority: PRIORITY_ORDER[seed.task?.priority] !== undefined ? seed.task.priority : 'medium',
        syncSchedule: Boolean(seed.task?.syncSchedule),
        dueDate: normalizeDate(seed.task?.dueDate),
        completedAt: seed.task?.status === 'done' ? (seed.task?.completedAt || updatedAt) : null,
        startTime: normalizeTime(seed.task?.startTime),
        endTime: normalizeTime(seed.task?.endTime),
        repeat: normalizeRepeat(seed.task?.repeat)
      },
      schedule: {
        enabled: Boolean(seed.schedule?.enabled),
        date: normalizeDate(seed.schedule?.date),
        startTime: scheduleStart,
        endTime: scheduleEnd,
        allDay: seed.schedule?.allDay !== undefined ? Boolean(seed.schedule.allDay) : !(scheduleStart || scheduleEnd),
        repeat: normalizeRepeat(seed.schedule?.repeat)
      },
      countdown: {
        enabled: Boolean(seed.countdown?.enabled),
        targetDate: normalizeDate(seed.countdown?.targetDate),
        group: normalizeCategory(seed.countdown?.group)
      },
      bookmark: {
        enabled: Boolean(seed.bookmark?.enabled),
        url: normalizeUrl(seed.bookmark?.url),
        icon: text(seed.bookmark?.icon).slice(0, 4) || FALLBACK_BOOKMARK_ICON,
        openMode: seed.bookmark?.openMode === 'same' ? 'same' : 'new'
      },
      sync: normalizeSyncState(seed.sync),
      createdAt,
      updatedAt
    };
  }

  function dispatchChange() {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { records: clone(records) } }));
  }

  function calendarEntries(dateStr) {
    const items = [];

    visibleRecords(false).forEach((record) => {
      if (record.schedule.enabled && matchesRepeat(record.schedule.date, record.schedule.repeat, dateStr)) {
        items.push({
          id: `${record.id}:schedule:${dateStr}`,
          recordId: record.id,
          facet: 'schedule',
          source: 'schedule',
          name: getDisplayTitle(record, '일정'),
          description: getDisplayBody(record),
          color: record.color,
          date: dateStr,
          startTime: record.schedule.allDay ? '' : record.schedule.startTime,
          endTime: record.schedule.allDay ? '' : record.schedule.endTime,
          allDay: record.schedule.allDay,
          record
        });
      }

      if (record.task.enabled && matchesRepeat(record.task.dueDate, record.task.repeat, dateStr)) {
        items.push({
          id: `${record.id}:task:${dateStr}`,
          recordId: record.id,
          facet: 'task',
          source: 'task',
          name: getDisplayTitle(record, '할 일'),
          description: getDisplayBody(record),
          color: record.color,
          date: dateStr,
          startTime: record.task.startTime,
          endTime: record.task.endTime,
          done: record.task.status === 'done',
          priority: record.task.priority,
          record
        });
      }

      if (record.countdown.enabled && record.countdown.targetDate === dateStr) {
        items.push({
          id: `${record.id}:countdown`,
          recordId: record.id,
          facet: 'countdown',
          source: 'countdown',
          name: getDisplayTitle(record, 'D-Day'),
          description: getDisplayBody(record),
          color: record.color,
          date: dateStr,
          record
        });
      }
    });

    return items.sort((a, b) => {
      const sourceDiff = (CALENDAR_SOURCE_ORDER[a.source] ?? 9) - (CALENDAR_SOURCE_ORDER[b.source] ?? 9);
      if (sourceDiff !== 0) return sourceDiff;

      const timeA = a.startTime ? LS.Helpers.timeToMinutes(a.startTime) : 9999;
      const timeB = b.startTime ? LS.Helpers.timeToMinutes(b.startTime) : 9999;
      if (timeA !== timeB) return timeA - timeB;

      return getDisplayTitle(a.record).localeCompare(getDisplayTitle(b.record), 'ko');
    });
  }

  async function loadStore() {
    try {
      const items = await LS.Storage.dbGetAll(STORE_NAME);
      return Array.isArray(items) ? items.map((item) => createRecord(item)) : [];
    } catch {
      return [];
    }
  }

  async function readLegacyStore(storeName, fallbackKey = '') {
    try {
      const items = await LS.Storage.dbGetAll(storeName);
      if (Array.isArray(items) && items.length) return items;
    } catch {}
    return fallbackKey ? LS.Storage.get(fallbackKey, []) : [];
  }

  async function migrateLegacy() {
    if (LS.Storage.get(MIGRATION_KEY, false)) return;

    const existingRefs = new Set(records.flatMap((record) => record.legacyRefs || []));
    const inserts = [];

    const memos = await readLegacyStore('memos', 'memos_fallback');
    memos.forEach((memo) => {
      const ref = `memo:${memo.id}`;
      const content = text(memo?.content);
      if (!memo?.id || !content || existingRefs.has(ref)) return;

      inserts.push(createRecord({
        title: titleFromBody(content),
        body: content,
        color: memo.color,
        pinned: Boolean(memo.pinned),
        note: { enabled: true },
        legacyRefs: [ref],
        createdAt: memo.createdAt || nowIso(),
        updatedAt: memo.updatedAt || memo.createdAt || nowIso()
      }));
      existingRefs.add(ref);
    });

    const todos = await readLegacyStore('todos', 'todos_fallback');
    todos.forEach((todo) => {
      const ref = `todo:${todo.id}`;
      const title = text(todo?.text);
      if (!todo?.id || !title || existingRefs.has(ref)) return;

      inserts.push(createRecord({
        title,
        task: {
          enabled: true,
          status: todo.done ? 'done' : 'open',
          priority: todo.priority || 'medium',
          dueDate: todo.dueDate || '',
          completedAt: todo.done ? (todo.updatedAt || nowIso()) : null
        },
        legacyRefs: [ref],
        createdAt: todo.createdAt || nowIso(),
        updatedAt: todo.updatedAt || todo.createdAt || nowIso()
      }));
      existingRefs.add(ref);
    });

    (LS.Storage.get('customScheduleEvents', []) || []).forEach((event) => {
      const ref = `schedule:${event.id}`;
      const title = text(event?.name);
      if (!event?.id || !title || existingRefs.has(ref)) return;

      inserts.push(createRecord({
        title,
        body: text(event.description),
        color: event.color || 'blue',
        schedule: {
          enabled: true,
          date: event.date || '',
          startTime: event.startTime || '',
          endTime: event.endTime || '',
          allDay: !(event.startTime || event.endTime)
        },
        legacyRefs: [ref],
        createdAt: event.createdAt || nowIso(),
        updatedAt: event.updatedAt || event.createdAt || nowIso()
      }));
      existingRefs.add(ref);
    });

    (LS.Storage.get('dday_items', []) || []).forEach((item) => {
      const ref = `countdown:${item.id}`;
      const title = text(item?.name);
      if (!item?.id || !title || !normalizeDate(item.date) || existingRefs.has(ref)) return;

      inserts.push(createRecord({
        title,
        countdown: { enabled: true, targetDate: item.date },
        legacyRefs: [ref],
        createdAt: item.createdAt || nowIso(),
        updatedAt: item.createdAt || nowIso()
      }));
      existingRefs.add(ref);
    });

    const bookmarks = await readLegacyStore('bookmarks', 'bookmarks_fallback');
    bookmarks.forEach((bookmark) => {
      const ref = `bookmark:${bookmark.id}`;
      const url = normalizeUrl(bookmark?.url);
      if (!bookmark?.id || !url || existingRefs.has(ref)) return;

      inserts.push(createRecord({
        title: text(bookmark.name) || titleFromUrl(url),
        color: 'gray',
        category: '링크',
        bookmark: {
          enabled: true,
          url,
          icon: text(bookmark.icon).slice(0, 4) || FALLBACK_BOOKMARK_ICON,
          openMode: 'new'
        },
        legacyRefs: [ref],
        createdAt: bookmark.createdAt || nowIso(),
        updatedAt: bookmark.updatedAt || bookmark.createdAt || nowIso()
      }));
      existingRefs.add(ref);
    });

    for (const record of inserts) {
      await LS.Storage.dbPut(STORE_NAME, record);
    }

    LS.Storage.set(MIGRATION_KEY, true);
  }

  async function persist(record) {
    const normalized = createRecord(record);
    const previous = records.find((item) => item.id === normalized.id) || null;
    queueRemovedGoogleSync(previous, normalized);

    if (!hasFacet(normalized)) {
      await LS.Storage.dbDelete(STORE_NAME, normalized.id);
      records = records.filter((item) => item.id !== normalized.id);
      dispatchChange();
      return null;
    }

    await LS.Storage.dbPut(STORE_NAME, normalized);
    const index = records.findIndex((item) => item.id === normalized.id);
    if (index >= 0) records[index] = normalized;
    else records.push(normalized);

    dispatchChange();
    return clone(normalized);
  }

  async function persistMany(items, options = {}) {
    const normalizedItems = Array.isArray(items) ? items.map((item) => createRecord(item)) : [];
    const touched = [];

    for (const normalized of normalizedItems) {
      const previous = records.find((item) => item.id === normalized.id) || null;
      queueRemovedGoogleSync(previous, normalized);

      if (!hasFacet(normalized)) {
        await LS.Storage.dbDelete(STORE_NAME, normalized.id);
        records = records.filter((item) => item.id !== normalized.id);
        continue;
      }

      await LS.Storage.dbPut(STORE_NAME, normalized);
      const index = records.findIndex((item) => item.id === normalized.id);
      if (index >= 0) records[index] = normalized;
      else records.push(normalized);
      touched.push(clone(normalized));
    }

    if (options.dispatch !== false) {
      dispatchChange();
    }

    return touched;
  }

  async function updateRecord(recordId, patchOrUpdater) {
    const found = records.find((record) => record.id === recordId);
    if (!found) return null;

    const draft = createRecord(clone(found));
    const next = typeof patchOrUpdater === 'function'
      ? patchOrUpdater(draft)
      : { ...draft, ...patchOrUpdater };

    if (!next) return null;
    next.updatedAt = nowIso();
    return persist(next);
  }

  function createDraftForMode(record, mode, options = {}) {
    const draft = createRecord(record || {});
    const presetDate = normalizeDate(options.presetDate);

    if (mode === 'note') {
      draft.note.enabled = true;
      return draft;
    }

    if (mode === 'task') {
      draft.task.enabled = true;
      if (draft.schedule.enabled) draft.task.syncSchedule = true;
      if (!draft.task.dueDate) draft.task.dueDate = draft.schedule.date || draft.countdown.targetDate || presetDate;
      if (!draft.task.startTime) draft.task.startTime = draft.schedule.startTime;
      if (!draft.task.endTime) draft.task.endTime = draft.schedule.endTime;
      if (!draft.task.repeat.enabled && draft.schedule.repeat.enabled) {
        draft.task.repeat = normalizeRepeat(draft.schedule.repeat);
      }
      return draft;
    }

    if (mode === 'schedule') {
      draft.schedule.enabled = true;
      if (draft.task.enabled) draft.task.syncSchedule = true;
      if (!draft.schedule.date) draft.schedule.date = draft.task.dueDate || draft.countdown.targetDate || presetDate;
      if (!draft.schedule.startTime) draft.schedule.startTime = draft.task.startTime;
      if (!draft.schedule.endTime) draft.schedule.endTime = draft.task.endTime;
      if (!draft.schedule.repeat.enabled && draft.task.repeat.enabled) {
        draft.schedule.repeat = normalizeRepeat(draft.task.repeat);
      }
      draft.schedule.allDay = draft.schedule.allDay !== false
        ? !(draft.schedule.startTime || draft.schedule.endTime)
        : false;
      return draft;
    }

    if (mode === 'countdown') {
      draft.countdown.enabled = true;
      if (!draft.countdown.targetDate) draft.countdown.targetDate = draft.schedule.date || draft.task.dueDate || presetDate;
      return draft;
    }

    if (mode === 'bookmark') {
      draft.bookmark.enabled = true;
      if (!draft.category) draft.category = '링크';
      if (!draft.bookmark.icon) draft.bookmark.icon = FALLBACK_BOOKMARK_ICON;
    }

    return draft;
  }

  function applyTaskScheduleSync(record, sourceMode) {
    if (!record?.task?.enabled || !record?.schedule?.enabled || !record.task.syncSchedule) {
      return record;
    }

    if (sourceMode === 'task') {
      record.schedule.date = record.task.dueDate || record.schedule.date;
      record.schedule.startTime = normalizeTime(record.task.startTime);
      record.schedule.endTime = normalizeTime(record.task.endTime);
      record.schedule.allDay = !(record.schedule.startTime || record.schedule.endTime);
      record.schedule.repeat = normalizeRepeat(record.task.repeat);
      return record;
    }

    if (sourceMode === 'schedule') {
      record.task.dueDate = record.schedule.date || record.task.dueDate;
      record.task.startTime = record.schedule.allDay ? '' : normalizeTime(record.schedule.startTime);
      record.task.endTime = record.schedule.allDay ? '' : normalizeTime(record.schedule.endTime);
      record.task.repeat = normalizeRepeat(record.schedule.repeat);
      return record;
    }

    return record;
  }

  function cloneDateOnly(dateLike) {
    const date = new Date(dateLike);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDateDays(dateLike, days) {
    const next = cloneDateOnly(dateLike);
    next.setDate(next.getDate() + days);
    return next;
  }

  function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function stripTokenOnce(source, token) {
    const textValue = String(source || '').trim();
    const target = String(token || '').trim();
    if (!textValue || !target) return textValue;
    return textValue.replace(new RegExp(escapeRegex(target), 'i'), ' ').replace(/\s+/g, ' ').trim();
  }

  function parseKoreanTime(hourText, minuteText, meridiemText) {
    let hour = parseInt(hourText, 10);
    let minute = parseInt(minuteText || '0', 10);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
    if (minute < 0 || minute > 59) minute = 0;

    const meridiem = String(meridiemText || '').replace(/\s+/g, '');
    if (meridiem === '오후' && hour < 12) hour += 12;
    if (meridiem === '오전' && hour === 12) hour = 0;
    if (meridiem === '' && hour === 24) hour = 0;
    if (hour < 0 || hour > 23) return '';

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  function parseQuickTime(textValue) {
    const periodMatch = String(textValue || '').match(/([1-9]\d?)\s*교시/);
    if (periodMatch) {
      const periodNo = parseInt(periodMatch[1], 10);
      const period = LS.Config.getPeriods().find((item) => item.period === periodNo && (item.type === 'class' || item.type === 'afterSchool'));
      if (period) {
        return {
          token: periodMatch[0],
          startTime: period.start,
          endTime: period.end
        };
      }
    }

    const timeMatch = String(textValue || '').match(/(오전|오후)?\s*(\d{1,2})(?::|시)\s*(\d{1,2})?\s*(?:분)?/);
    if (!timeMatch) return null;

    const startTime = parseKoreanTime(timeMatch[2], timeMatch[3], timeMatch[1]);
    if (!startTime) return null;

    return {
      token: timeMatch[0],
      startTime,
      endTime: ''
    };
  }

  function parseQuickDate(textValue) {
    const base = cloneDateOnly(new Date());
    const source = String(textValue || '');

    const explicitDateMatch = source.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
    if (explicitDateMatch) {
      const target = new Date(
        parseInt(explicitDateMatch[1], 10),
        parseInt(explicitDateMatch[2], 10) - 1,
        parseInt(explicitDateMatch[3], 10)
      );
      if (!Number.isNaN(target.getTime())) {
        return { token: explicitDateMatch[0], dateStr: LS.Helpers.formatDate(target, 'YYYY-MM-DD') };
      }
    }

    const monthDayMatch = source.match(/(\d{1,2})[./](\d{1,2})(?!\d)/);
    if (monthDayMatch) {
      const month = parseInt(monthDayMatch[1], 10);
      const day = parseInt(monthDayMatch[2], 10);
      let year = base.getFullYear();
      let target = new Date(year, month - 1, day);
      if (!Number.isNaN(target.getTime()) && target < base) {
        year += 1;
        target = new Date(year, month - 1, day);
      }
      if (!Number.isNaN(target.getTime())) {
        return { token: monthDayMatch[0], dateStr: LS.Helpers.formatDate(target, 'YYYY-MM-DD') };
      }
    }

    const relativeMap = [
      { token: '오늘', offset: 0 },
      { token: '내일', offset: 1 },
      { token: '모레', offset: 2 }
    ];
    for (const item of relativeMap) {
      if (source.includes(item.token)) {
        return { token: item.token, dateStr: LS.Helpers.formatDate(addDateDays(base, item.offset), 'YYYY-MM-DD') };
      }
    }

    const weekdayMatch = source.match(/(다음\s*주\s*)?([월화수목금토일])요일?(까지)?/);
    if (weekdayMatch) {
      const weekdayMap = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
      const targetDay = weekdayMap[weekdayMatch[2]];
      let diff = (targetDay - base.getDay() + 7) % 7;
      if (weekdayMatch[1]) {
        diff += diff === 0 ? 7 : 7;
      } else if (!weekdayMatch[3] && diff === 0) {
        diff = 7;
      }

      return {
        token: weekdayMatch[0],
        dateStr: LS.Helpers.formatDate(addDateDays(base, diff), 'YYYY-MM-DD'),
        isDeadline: Boolean(weekdayMatch[3])
      };
    }

    return null;
  }

  function parseCountdownOffset(textValue) {
    const match = String(textValue || '').match(/D\s*-\s*(\d{1,3})/i);
    if (!match) return null;
    const days = parseInt(match[1], 10);
    if (!Number.isFinite(days)) return null;
    return {
      token: match[0],
      dateStr: LS.Helpers.formatDate(addDateDays(new Date(), days), 'YYYY-MM-DD')
    };
  }

  function parseQuickMode(rawMode, input) {
    if (rawMode && rawMode !== 'auto') return { mode: rawMode, text: String(input || '').trim() };

    let textValue = String(input || '').trim();
    const prefixMatchers = [
      { mode: 'note', regex: /^(메모|memo)\s*[:\-]?\s*/i },
      { mode: 'task', regex: /^(할일|할 일|todo|task)\s*[:\-]?\s*/i },
      { mode: 'schedule', regex: /^(일정|schedule)\s*[:\-]?\s*/i },
      { mode: 'countdown', regex: /^(디데이|d-day|dday)\s*[:\-]?\s*/i },
      { mode: 'bookmark', regex: /^(북마크|링크|bookmark)\s*[:\-]?\s*/i }
    ];

    for (const matcher of prefixMatchers) {
      const matched = textValue.match(matcher.regex);
      if (matched) {
        textValue = textValue.slice(matched[0].length).trim();
        return { mode: matcher.mode, text: textValue };
      }
    }

    if (/(https?:\/\/|www\.)/i.test(textValue)) {
      return { mode: 'bookmark', text: textValue };
    }

    if (/D\s*-\s*\d+/i.test(textValue) || /디데이/i.test(textValue)) {
      return { mode: 'countdown', text: textValue };
    }

    if (/까지/.test(textValue)) {
      return { mode: 'task', text: textValue };
    }

    if (parseQuickDate(textValue) || parseQuickTime(textValue)) {
      return { mode: 'schedule', text: textValue };
    }

    return { mode: 'note', text: textValue };
  }

  function buildQuickAddRecord(rawInput, rawMode) {
    const parsedMode = parseQuickMode(rawMode, rawInput);
    let working = parsedMode.text;
    const dateInfo = parseQuickDate(working);
    const timeInfo = parseQuickTime(working);
    const countdownInfo = parseCountdownOffset(working);
    const urlMatch = String(working || '').match(/(?:https?:\/\/|www\.)\S+/i);

    if (dateInfo?.token) working = stripTokenOnce(working, dateInfo.token);
    if (timeInfo?.token) working = stripTokenOnce(working, timeInfo.token);
    if (countdownInfo?.token) working = stripTokenOnce(working, countdownInfo.token);
    if (urlMatch?.[0]) working = stripTokenOnce(working, urlMatch[0]);
    working = working.replace(/\s+까지$/, '').replace(/^까지\s+/, '').trim();

    const title = text(working) || text(parsedMode.text);
    const mode = parsedMode.mode;

    if (mode === 'bookmark') {
      const url = normalizeUrl(urlMatch?.[0] || text(parsedMode.text));
      if (!url) return null;
      return {
        mode,
        summary: `${title || titleFromUrl(url)} 링크 추가`,
        record: createRecord({
          title: title || titleFromUrl(url),
          color: 'gray',
          category: '링크',
          bookmark: {
            enabled: true,
            url,
            icon: FALLBACK_BOOKMARK_ICON,
            openMode: 'new'
          }
        })
      };
    }

    if (mode === 'countdown') {
      const targetDate = countdownInfo?.dateStr || dateInfo?.dateStr;
      if (!targetDate) return null;
      return {
        mode,
        summary: `${title || 'D-Day'} 디데이 추가`,
        record: createRecord({
          title: title || 'D-Day',
          color: 'purple',
          countdown: {
            enabled: true,
            targetDate
          }
        })
      };
    }

    if (mode === 'task') {
      const dueDate = dateInfo?.dateStr || '';
      return {
        mode,
        summary: `${title || '할 일'} 할 일 추가`,
        record: createRecord({
          title: title || '할 일',
          color: 'blue',
          task: {
            enabled: true,
            dueDate,
            startTime: timeInfo?.startTime || '',
            endTime: timeInfo?.endTime || ''
          }
        })
      };
    }

    if (mode === 'schedule') {
      const scheduleDate = dateInfo?.dateStr || todayStr();
      const hasTime = Boolean(timeInfo?.startTime || timeInfo?.endTime);
      return {
        mode,
        summary: `${title || '일정'} 일정 추가`,
        record: createRecord({
          title: title || '일정',
          color: 'blue',
          schedule: {
            enabled: true,
            date: scheduleDate,
            allDay: !hasTime,
            startTime: timeInfo?.startTime || '',
            endTime: timeInfo?.endTime || ''
          }
        })
      };
    }

    return {
      mode: 'note',
      summary: `${titleFromBody(parsedMode.text) || '메모'} 메모 추가`,
      record: createRecord({
        title: titleFromBody(parsedMode.text),
        body: parsedMode.text,
        color: 'yellow',
        note: { enabled: true }
      })
    };
  }

  async function editPrompt(mode, record) {
    const repeat = mode === 'task' ? record.task.repeat : record.schedule.repeat;
    const bookmarkFields = [
      {
        id: 'bookmarkEnabled',
        type: 'select',
        label: '북마크 연결',
        value: record.bookmark?.enabled ? '1' : '0',
        options: [
          { value: '0', text: '아니오' },
          { value: '1', text: '예' }
        ]
      },
      {
        id: 'bookmarkUrl',
        type: 'url',
        label: '링크 주소',
        value: record.bookmark?.url || '',
        placeholder: 'https://example.com'
      },
      {
        id: 'bookmarkIcon',
        type: 'text',
        label: '링크 아이콘',
        value: record.bookmark?.icon || FALLBACK_BOOKMARK_ICON,
        placeholder: FALLBACK_BOOKMARK_ICON
      },
      {
        id: 'bookmarkIconPreset',
        type: 'icon-grid',
        label: '추천 아이콘',
        targetId: 'bookmarkIcon',
        value: record.bookmark?.icon || FALLBACK_BOOKMARK_ICON,
        options: BOOKMARK_ICON_PRESETS,
        help: '추천 아이콘을 누르거나 위 입력칸에서 직접 수정할 수 있습니다.'
      },
      {
        id: 'bookmarkOpenMode',
        type: 'select',
        label: '링크 열기',
        value: record.bookmark?.openMode === 'same' ? 'same' : 'new',
        options: [
          { value: 'new', text: '새 창' },
          { value: 'same', text: '현재 창' }
        ]
      }
    ];

    const common = [
      { id: 'title', type: 'text', label: '제목', value: record.title, placeholder: '제목을 입력하세요' },
      { id: 'body', type: 'textarea', label: '설명/메모', value: record.body, rows: 4 },
      { id: 'category', type: 'text', label: '카테고리', value: record.category, placeholder: '예: 수업, 개인, 행정' },
      { id: 'tags', type: 'text', label: '태그', value: (record.tags || []).join(', '), placeholder: '쉼표로 구분' },
      {
        id: 'color',
        type: 'select',
        label: '색상',
        value: record.color,
        options: COLORS.map((item) => ({ value: item.value, text: item.label }))
      },
      {
        id: 'pinned',
        type: 'select',
        label: '상단 고정',
        value: record.pinned ? '1' : '0',
        options: [
          { value: '0', text: '아니오' },
          { value: '1', text: '예' }
        ]
      }
    ];

    const taskQuickFields = [
      { id: 'title', type: 'text', label: '할 일', value: record.title, placeholder: '예: 수행평가 점검하기' },
      { id: 'dueDate', type: 'date', label: '마감일', value: record.task.dueDate },
      {
        id: 'priority',
        type: 'select',
        label: '우선순위',
        value: record.task.priority,
        options: [
          { value: 'high', text: '높음' },
          { value: 'medium', text: '보통' },
          { value: 'low', text: '낮음' }
        ]
      },
      { id: 'body', type: 'textarea', label: '메모 (선택)', value: record.body, rows: 2, placeholder: '필요한 내용만 간단히 적어 주세요.' }
    ];

    const scheduleQuickFields = [
      { id: 'title', type: 'text', label: '일정 이름', value: record.title, placeholder: '예: 학부모 상담' },
      { id: 'date', type: 'date', label: '날짜', value: record.schedule.date },
      {
        id: 'allDay',
        type: 'select',
        label: '종일 일정',
        value: record.schedule.allDay ? '1' : '0',
        options: [
          { value: '1', text: '예' },
          { value: '0', text: '아니오' }
        ]
      },
      { id: 'startTime', type: 'time', label: '시작 시간', value: record.schedule.startTime },
      { id: 'endTime', type: 'time', label: '종료 시간', value: record.schedule.endTime },
      { id: 'body', type: 'textarea', label: '메모 (선택)', value: record.body, rows: 2, placeholder: '필요한 내용만 간단히 적어 주세요.' }
    ];

    const repeatFields = [
      {
        id: 'repeatEnabled',
        type: 'select',
        label: '반복 사용',
        value: repeat.enabled ? '1' : '0',
        options: [
          { value: '0', text: '아니오' },
          { value: '1', text: '예' }
        ]
      },
      {
        id: 'repeatFrequency',
        type: 'select',
        label: '반복 주기',
        value: repeat.frequency,
        options: [
          { value: 'daily', text: '매일' },
          { value: 'weekly', text: '매주' },
          { value: 'monthly', text: '매월' },
          { value: 'yearly', text: '매년' }
        ]
      },
      {
        id: 'repeatInterval',
        type: 'number',
        label: '반복 간격',
        value: repeat.interval || 1,
        min: 1,
        step: 1
      },
      {
        id: 'repeatWeekdays',
        type: 'text',
        label: '반복 요일',
        value: (repeat.weekdays || []).join(','),
        placeholder: '주간 반복일 때만 사용. 예: 1,3,5'
      },
      {
        id: 'repeatUntil',
        type: 'date',
        label: '반복 종료일',
        value: repeat.until
      }
    ];

    const syncField = {
      id: 'syncSchedule',
      type: 'select',
      label: '할 일/일정 자동 동기화',
      value: record.task?.syncSchedule ? '1' : '0',
      options: [
        { value: '0', text: '아니오' },
        { value: '1', text: '예' }
      ]
    };

    const fieldMap = {
      note: [
        ...common,
        ...bookmarkFields
      ],
      task: [
        ...common,
        ...bookmarkFields,
        {
          id: 'priority',
          type: 'select',
          label: '우선순위',
          value: record.task.priority,
          options: [
            { value: 'high', text: '높음' },
            { value: 'medium', text: '보통' },
            { value: 'low', text: '낮음' }
          ]
        },
        { id: 'dueDate', type: 'date', label: '마감일', value: record.task.dueDate },
        { id: 'startTime', type: 'time', label: '시작 시간', value: record.task.startTime },
        { id: 'endTime', type: 'time', label: '종료 시간', value: record.task.endTime },
        {
          id: 'done',
          type: 'select',
          label: '완료 여부',
          value: record.task.status === 'done' ? '1' : '0',
          options: [
            { value: '0', text: '미완료' },
            { value: '1', text: '완료' }
          ]
        },
        syncField,
        ...repeatFields
      ],
      schedule: [
        ...common,
        ...bookmarkFields,
        { id: 'date', type: 'date', label: '일정 날짜', value: record.schedule.date },
        {
          id: 'allDay',
          type: 'select',
          label: '종일 일정',
          value: record.schedule.allDay ? '1' : '0',
          options: [
            { value: '1', text: '예' },
            { value: '0', text: '아니오' }
          ]
        },
        { id: 'startTime', type: 'time', label: '시작 시간', value: record.schedule.startTime },
        { id: 'endTime', type: 'time', label: '종료 시간', value: record.schedule.endTime },
        syncField,
        ...repeatFields
      ],
      countdown: [
        ...common,
        ...bookmarkFields,
        { id: 'targetDate', type: 'date', label: '기준 날짜', value: record.countdown.targetDate },
        { id: 'group', type: 'text', label: '묶음', value: record.countdown.group, placeholder: '예: 시험, 행사' }
      ],
      bookmark: [
        { id: 'title', type: 'text', label: '이름', value: record.title || titleFromUrl(record.bookmark.url), placeholder: '사이트 이름' },
        { id: 'url', type: 'url', label: '주소', value: record.bookmark.url, placeholder: 'https://example.com' },
        { id: 'icon', type: 'text', label: '아이콘', value: record.bookmark.icon || FALLBACK_BOOKMARK_ICON, placeholder: FALLBACK_BOOKMARK_ICON },
        {
          id: 'iconPreset',
          type: 'icon-grid',
          label: '추천 아이콘',
          targetId: 'icon',
          value: record.bookmark.icon || FALLBACK_BOOKMARK_ICON,
          options: BOOKMARK_ICON_PRESETS,
          help: '추천 아이콘을 누르거나 위 입력칸에서 직접 수정할 수 있습니다.'
        },
        {
          id: 'openMode',
          type: 'select',
          label: '열기 방식',
          value: record.bookmark.openMode,
          options: [
            { value: 'new', text: '새 창' },
            { value: 'same', text: '현재 창' }
          ]
        },
        ...common.slice(2)
      ]
    };

    const titleMap = {
      note: '메모 편집',
      task: '할 일 편집',
      schedule: '일정 편집',
      countdown: 'D-Day 편집',
      bookmark: '북마크 편집'
    };

    const promptFields = mode === 'task'
      ? taskQuickFields
      : mode === 'schedule'
        ? scheduleQuickFields
        : fieldMap[mode] || common;

    const result = await LS.Helpers.promptModal(titleMap[mode] || '항목 편집', promptFields, {
      confirmText: '저장'
    });

    if (!result) return null;

    const hasField = (fieldId) => Object.prototype.hasOwnProperty.call(result, fieldId);
    const hasBodyField = hasField('body');
    const resolvedBody = hasBodyField ? text(result.body) : text(record.body);

    const next = createRecord({
      ...record,
      title: text(result.title) || titleFromBody(resolvedBody) || (mode === 'bookmark' ? titleFromUrl(result.url) : ''),
      body: resolvedBody,
      category: hasField('category') ? normalizeCategory(result.category) : record.category,
      tags: hasField('tags') ? normalizeTags(result.tags) : record.tags,
      color: hasField('color') ? normalizeColor(result.color) : record.color,
      pinned: hasField('pinned') ? result.pinned === '1' : record.pinned,
      updatedAt: nowIso()
    });

    if (mode !== 'bookmark' && hasField('bookmarkEnabled')) {
      const bookmarkEnabled = result.bookmarkEnabled === '1';
      next.bookmark = {
        enabled: bookmarkEnabled,
        url: bookmarkEnabled ? normalizeUrl(result.bookmarkUrl) : '',
        icon: bookmarkEnabled ? (text(result.bookmarkIcon).slice(0, 4) || FALLBACK_BOOKMARK_ICON) : FALLBACK_BOOKMARK_ICON,
        openMode: bookmarkEnabled && result.bookmarkOpenMode === 'same' ? 'same' : 'new'
      };
    }

    if (mode === 'note') {
      next.note.enabled = true;
    }

    if (mode === 'task') {
      next.task = {
        ...next.task,
        enabled: true,
        priority: hasField('priority')
          ? (['high', 'medium', 'low'].includes(result.priority) ? result.priority : 'medium')
          : next.task.priority,
        syncSchedule: hasField('syncSchedule') ? result.syncSchedule === '1' : next.task.syncSchedule,
        dueDate: hasField('dueDate') ? normalizeDate(result.dueDate) : next.task.dueDate,
        startTime: hasField('startTime') ? normalizeTime(result.startTime) : next.task.startTime,
        endTime: hasField('endTime') ? normalizeTime(result.endTime) : next.task.endTime,
        status: hasField('done') ? (result.done === '1' ? 'done' : 'open') : next.task.status,
        completedAt: hasField('done')
          ? (result.done === '1' ? (record.task.completedAt || nowIso()) : null)
          : next.task.completedAt,
        repeat: hasField('repeatEnabled')
          ? normalizeRepeat({
              enabled: result.repeatEnabled === '1',
              frequency: result.repeatFrequency,
              interval: result.repeatInterval,
              weekdays: parseWeekdayText(result.repeatWeekdays),
              until: result.repeatUntil
            })
          : next.task.repeat
      };
    }

    if (mode === 'schedule') {
      const resolvedStartTime = hasField('startTime') ? normalizeTime(result.startTime) : next.schedule.startTime;
      const resolvedEndTime = hasField('endTime') ? normalizeTime(result.endTime) : next.schedule.endTime;
      const hasExplicitTime = Boolean(resolvedStartTime || resolvedEndTime);
      const isAllDay = hasExplicitTime ? false : (hasField('allDay') ? result.allDay !== '0' : next.schedule.allDay);
      if (hasField('syncSchedule')) {
        next.task.syncSchedule = result.syncSchedule === '1';
      }
      next.schedule = {
        ...next.schedule,
        enabled: true,
        date: hasField('date') ? normalizeDate(result.date) : next.schedule.date,
        allDay: isAllDay,
        startTime: isAllDay
          ? ''
          : resolvedStartTime,
        endTime: isAllDay
          ? ''
          : resolvedEndTime,
        repeat: hasField('repeatEnabled')
          ? normalizeRepeat({
              enabled: result.repeatEnabled === '1',
              frequency: result.repeatFrequency,
              interval: result.repeatInterval,
              weekdays: parseWeekdayText(result.repeatWeekdays),
              until: result.repeatUntil
            })
          : next.schedule.repeat
      };
    }

    if (mode === 'countdown') {
      next.countdown = {
        ...next.countdown,
        enabled: true,
        targetDate: normalizeDate(result.targetDate),
        group: normalizeCategory(result.group)
      };
    }

    if (mode === 'bookmark') {
      next.bookmark = {
        enabled: true,
        url: normalizeUrl(result.url),
        icon: text(result.icon).slice(0, 4) || FALLBACK_BOOKMARK_ICON,
        openMode: result.openMode === 'same' ? 'same' : 'new'
      };
      next.category = normalizeCategory(result.category || '링크');
      next.title = text(result.title) || titleFromUrl(result.url);
    }

    if ((mode === 'task' || mode === 'schedule') && next.task.syncSchedule) {
      applyTaskScheduleSync(next, mode);
    }

    return next;
  }

  LS.Records = {
    async init() {
      if (initialized) return;
      if (initPromise) return initPromise;

      initPromise = (async () => {
        records = await loadStore();
        await migrateLegacy();
        records = await loadStore();
        initialized = true;
        dispatchChange();
      })();

      try {
        await initPromise;
      } finally {
        initPromise = null;
      }
    },

    getColorOptions() {
      return clone(COLORS);
    },

    getColorMeta(value) {
      return getColorMeta(value);
    },

    getDisplayTitle(record, fallback) {
      return getDisplayTitle(record, fallback);
    },

    getDisplayBody(record) {
      return getDisplayBody(record);
    },

    getFacetLabels(record, exclude = []) {
      return getFacetLabels(record, exclude);
    },

    getTagLabels(record) {
      return (record.tags || []).map((tag) => `#${tag}`);
    },

    getChecklistItems(record) {
      return checklistLines(record?.body).map((item, index) => ({
        index,
        text: item.text,
        done: item.done
      }));
    },

    listAll(options = {}) {
      return clone(visibleRecords(Boolean(options.includeArchived)).sort(sortByUpdated));
    },

    listArchived() {
      return clone(records.filter((record) => record.archivedAt).sort(sortByUpdated));
    },

    listNotes(options = {}) {
      return clone(
        visibleRecords(Boolean(options.includeArchived))
          .filter((record) => record.note.enabled)
          .sort(sortByUpdated)
      );
    },

    listTasks(options = {}) {
      return clone(
        visibleRecords(Boolean(options.includeArchived))
          .filter((record) => record.task.enabled)
          .sort(sortTasks)
      );
    },

    listSchedules(options = {}) {
      return clone(
        visibleRecords(Boolean(options.includeArchived))
          .filter((record) => record.schedule.enabled && record.schedule.date)
          .sort((a, b) => {
            if (a.schedule.date !== b.schedule.date) return a.schedule.date.localeCompare(b.schedule.date);
            return sortByUpdated(a, b);
          })
      );
    },

    listCountdowns(options = {}) {
      return clone(
        visibleRecords(Boolean(options.includeArchived))
          .filter((record) => record.countdown.enabled && record.countdown.targetDate)
          .sort(sortCountdowns)
      );
    },

    listBookmarks(options = {}) {
      return clone(
        visibleRecords(Boolean(options.includeArchived))
          .filter((record) => record.bookmark.enabled && record.bookmark.url)
          .sort(sortByUpdated)
      );
    },

    search(query, options = {}) {
      const q = text(query).toLowerCase();
      const facets = Array.isArray(options.facets) ? new Set(options.facets) : null;

      return clone(
        records.filter((record) => {
          if (options.archived === false && record.archivedAt) return false;
          if (options.archived === true && !record.archivedAt) return false;

          if (facets && facets.size) {
            const matchedFacet = (
              (facets.has('note') && record.note.enabled)
              || (facets.has('task') && record.task.enabled)
              || (facets.has('schedule') && record.schedule.enabled)
              || (facets.has('countdown') && record.countdown.enabled)
              || (facets.has('bookmark') && record.bookmark.enabled)
            );
            if (!matchedFacet) return false;
          }

          if (!q) return true;

          return [
            getDisplayTitle(record),
            getDisplayBody(record),
            record.category,
            ...(record.tags || []),
            record.bookmark?.url || '',
            record.countdown?.group || ''
          ].join('\n').toLowerCase().includes(q);
        }).sort(sortByUpdated)
      );
    },

    getCalendarEntries(dateStr) {
      return clone(calendarEntries(dateStr));
    },

    getById(recordId) {
      const found = records.find((record) => record.id === recordId);
      return found ? clone(found) : null;
    },

    hasBookmark(recordOrId) {
      const record = typeof recordOrId === 'string'
        ? records.find((item) => item.id === recordOrId)
        : recordOrId;
      return Boolean(record?.bookmark?.enabled && record?.bookmark?.url);
    },

    getBookmarkInfo(recordOrId) {
      const record = typeof recordOrId === 'string'
        ? records.find((item) => item.id === recordOrId)
        : recordOrId;
      if (!record?.bookmark?.enabled || !record.bookmark.url) return null;
      return clone(record.bookmark);
    },

    openBookmark(recordOrId) {
      const bookmark = this.getBookmarkInfo(recordOrId);
      if (!bookmark) return false;
      const rawUrl = String(bookmark.url || '').trim();
      if (!/^https?:\/\//i.test(rawUrl)) {
        return false;
      }
      try {
        new URL(rawUrl);
      } catch {
        return false;
      }
      window.open(rawUrl, bookmark.openMode === 'same' ? '_self' : '_blank', 'noopener,noreferrer');
      return true;
    },

    async saveRecord(record) {
      await this.init();
      return persist({ ...createRecord(record), updatedAt: nowIso() });
    },

    async saveMany(items, options = {}) {
      await this.init();
      const prepared = (Array.isArray(items) ? items : []).map((item) => ({
        ...createRecord(item),
        updatedAt: item?.updatedAt || nowIso()
      }));
      return persistMany(prepared, options);
    },

    async updateRecord(recordId, patchOrUpdater) {
      await this.init();
      return updateRecord(recordId, patchOrUpdater);
    },

    async deleteRecord(recordId) {
      await this.init();
      const existing = records.find((record) => record.id === recordId);
      if (existing) {
        queueRemovedGoogleSync(existing, null);
      }
      records = records.filter((record) => record.id !== recordId);
      await LS.Storage.dbDelete(STORE_NAME, recordId);
      dispatchChange();
    },

    async removeFacet(recordId, facetName) {
      await this.init();
      return updateRecord(recordId, (record) => {
        if (facetName === 'note') record.note = { enabled: false };
        if (facetName === 'task') {
          record.task = {
            enabled: false,
            status: 'open',
            priority: 'medium',
            syncSchedule: false,
            dueDate: '',
            completedAt: null,
            startTime: '',
            endTime: '',
            repeat: normalizeRepeat()
          };
        }
        if (facetName === 'schedule') {
          record.schedule = {
            enabled: false,
            date: '',
            startTime: '',
            endTime: '',
            allDay: true,
            repeat: normalizeRepeat()
          };
        }
        if (facetName === 'countdown') {
          record.countdown = {
            enabled: false,
            targetDate: '',
            group: ''
          };
        }
        if (facetName === 'bookmark') {
          record.bookmark = {
            enabled: false,
            url: '',
            icon: FALLBACK_BOOKMARK_ICON,
            openMode: 'new'
          };
        }
        return record;
      });
    },

    async togglePinned(recordId) {
      await this.init();
      return updateRecord(recordId, (record) => {
        record.pinned = !record.pinned;
        return record;
      });
    },

    async toggleArchive(recordId) {
      await this.init();
      return updateRecord(recordId, (record) => {
        record.archivedAt = record.archivedAt ? null : nowIso();
        return record;
      });
    },

    async setColor(recordId, color) {
      await this.init();
      return updateRecord(recordId, (record) => {
        record.color = normalizeColor(color);
        return record;
      });
    },

    async toggleTaskComplete(recordId) {
      await this.init();
      return updateRecord(recordId, (record) => {
        if (!record.task?.enabled) return null;
        const nextDone = record.task.status !== 'done';
        record.task.status = nextDone ? 'done' : 'open';
        record.task.completedAt = nextDone ? nowIso() : null;
        if (record.task.syncSchedule && record.schedule?.enabled) {
          applyTaskScheduleSync(record, 'task');
        }
        return record;
      });
    },

    async toggleChecklistItem(recordId, itemIndex) {
      await this.init();
      return updateRecord(recordId, (record) => {
        const lines = String(record.body || '').split(/\r?\n/g);
        let foundIndex = -1;

        record.body = lines.map((line) => {
          const match = line.match(/^(\s*-\s*\[)( |x|X)(\]\s*)(.+?)\s*$/);
          if (!match) return line;

          foundIndex += 1;
          if (foundIndex !== itemIndex) return line;

          const nextDone = match[2].toLowerCase() !== 'x';
          return `${match[1]}${nextDone ? 'x' : ' '}${match[3]}${match[4]}`;
        }).join('\n');

        return record;
      });
    },

    async archivePastCountdowns() {
      await this.init();

      const targets = records.filter((record) => (
        record.countdown?.enabled
        && record.countdown.targetDate
        && record.countdown.targetDate < todayStr()
        && !record.archivedAt
      ));

      for (const record of targets) {
        await updateRecord(record.id, (draft) => {
          draft.archivedAt = nowIso();
          return draft;
        });
      }

      return targets.length;
    },

    async convertRecord(recordId, mode, options = {}) {
      return this.openRecordEditor({ recordId, mode, ...options });
    },

    async quickAddFromText(input, options = {}) {
      await this.init();

      const rawInput = text(input);
      if (!rawInput) {
        LS.Helpers.showToast('빠른 추가 내용을 입력해 주세요.', 'warning', 2800);
        return null;
      }

      const payload = buildQuickAddRecord(rawInput, options.mode || 'auto');
      if (!payload?.record) {
        LS.Helpers.showToast('입력 내용을 해석하지 못했습니다. 날짜나 링크 형식을 다시 확인해 주세요.', 'warning', 3200);
        return null;
      }

      const saved = await this.saveRecord(payload.record);
      if (!saved) {
        LS.Helpers.showToast('빠른 추가 저장에 실패했습니다.', 'error', 2800);
        return null;
      }

      return {
        mode: payload.mode,
        summary: payload.summary,
        record: saved
      };
    },

    async openRecordEditor(options = {}) {
      await this.init();

      const mode = options.mode || 'note';
      const sourceRecord = options.recordId
        ? this.getById(options.recordId)
        : createRecord({
            color: mode === 'bookmark' ? 'gray' : mode === 'note' ? 'yellow' : 'blue',
            category: mode === 'bookmark' ? '링크' : '',
            note: { enabled: mode === 'note' },
            task: { enabled: mode === 'task', syncSchedule: false },
            schedule: { enabled: mode === 'schedule', allDay: true },
            countdown: { enabled: mode === 'countdown' },
            bookmark: { enabled: mode === 'bookmark', icon: FALLBACK_BOOKMARK_ICON, openMode: 'new' }
          });

      const draft = createDraftForMode(sourceRecord, mode, options);
      const next = await editPrompt(mode, draft);
      if (!next) return null;

      if (mode === 'note' && !next.title && !next.body) {
        LS.Helpers.showToast('메모 내용이나 제목을 입력해 주세요.', 'warning', 3200);
        return null;
      }

      if (mode === 'schedule' && !next.schedule.date) {
        LS.Helpers.showToast('일정 날짜를 입력해 주세요.', 'warning', 3200);
        return null;
      }

      if (mode === 'countdown' && !next.countdown.targetDate) {
        LS.Helpers.showToast('기준 날짜를 입력해 주세요.', 'warning', 3200);
        return null;
      }

      if (mode === 'bookmark' && !next.bookmark.url) {
        LS.Helpers.showToast('북마크 주소를 입력해 주세요.', 'warning', 3200);
        return null;
      }

      if (mode !== 'bookmark' && next.bookmark.enabled && !next.bookmark.url) {
        LS.Helpers.showToast('연결할 링크 주소를 입력해 주세요.', 'warning', 3200);
        return null;
      }

      if ((mode === 'task' || mode === 'schedule' || mode === 'countdown') && !next.title) {
        LS.Helpers.showToast('제목을 입력해 주세요.', 'warning', 3200);
        return null;
      }

      return this.saveRecord(next);
    },

    getGoogleSyncDeleteQueue() {
      return clone(getGoogleSyncDeleteQueue());
    },

    setGoogleSyncDeleteQueue(items) {
      setGoogleSyncDeleteQueue(items);
    }
  };
})();
