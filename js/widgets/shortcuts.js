(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};

  const STORAGE_KEY = 'shortcutItems';

  function getBridgeQueryParam(key) {
    const helper = LS.Helpers?.getRuntimeQueryParam;
    if (typeof helper === 'function') {
      return helper(key, '');
    }
    try {
      return new URLSearchParams(window.location.search || '').get(key) || '';
    } catch {
      return '';
    }
  }

  function resolveBridgePort() {
    const candidate = String(getBridgeQueryParam('bridgePort') || '').trim();
    return /^\d{2,5}$/.test(candidate) ? candidate : '58671';
  }

  function buildBridgeHeaders(headers = {}) {
    const token = String(getBridgeQueryParam('livelySamToken') || '').trim();
    if (!token) return { ...(headers || {}) };
    return {
      ...(headers || {}),
      'X-LivelySam-Token': token
    };
  }

  const BRIDGE_ORIGIN = `http://127.0.0.1:${resolveBridgePort()}`;
  const SHELL_OPEN_URL = `${BRIDGE_ORIGIN}/__livelysam__/shell/open`;
  const SHELL_INSPECT_URL = `${BRIDGE_ORIGIN}/__livelysam__/shell/inspect`;
  const ICON_SCALES = new Set(['small', 'medium', 'large']);
  const DROP_WAIT_MS = 1200;
  const BRIDGE_REQUEST_TIMEOUT_MS = 7000;
  const DROP_TEXT_TYPES = [
    'text/uri-list',
    'text/plain',
    'text',
    'url',
    'URL',
    'DownloadURL',
    'downloadurl',
    'text/html'
  ];
  const ACCENT_META = {
    sky: { label: '하늘' },
    mint: { label: '민트' },
    amber: { label: '골드' },
    rose: { label: '로즈' },
    violet: { label: '보라' },
    slate: { label: '그레이' }
  };
  const ICON_OPTIONS = [
    { value: '📁', label: '폴더' },
    { value: '🗂️', label: '정리 폴더' },
    { value: '📄', label: '문서' },
    { value: '📕', label: 'PDF' },
    { value: '📊', label: '표' },
    { value: '🖼️', label: '이미지' },
    { value: '🎵', label: '오디오' },
    { value: '🎬', label: '비디오' },
    { value: '⚙️', label: '실행 파일' },
    { value: '⭐', label: '즐겨찾기' }
  ];

  function toText(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const normalized = String(value).trim();
    return normalized || fallback;
  }

  function escapeHtml(value) {
    return LS.Helpers.escapeHtml(String(value || ''));
  }

  function normalizeScale(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ICON_SCALES.has(normalized) ? normalized : 'medium';
  }

  function normalizeAccent(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ACCENT_META[normalized] ? normalized : 'sky';
  }

  function normalizeKind(value, fallback = 'file') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'folder') return 'folder';
    if (normalized === 'file') return 'file';
    return fallback === 'folder' ? 'folder' : 'file';
  }

  function isFileUri(value) {
    return /^file:\/\//i.test(String(value || '').trim());
  }

  function isWindowsAbsolutePath(value) {
    const normalized = String(value || '').trim();
    return /^[a-z]:[\\/]/i.test(normalized) || /^\\\\/.test(normalized);
  }

  function hasInvalidWindowsPathChars(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return false;
    const withoutDrive = normalized.replace(/^[a-z]:/i, '');
    return /[?*"<>|]/.test(withoutDrive);
  }

  function normalizeTargetText(value) {
    let normalized = toText(value);
    if (!normalized) return '';

    normalized = normalized.replace(/\u0000/g, '').replace(/^['"]+|['"]+$/g, '').trim();
    if (!normalized) return '';

    if (isFileUri(normalized)) {
      try {
        const parsed = new URL(normalized);
        let pathname = decodeURIComponent(parsed.pathname || '');
        if (/^\/[a-z]:/i.test(pathname)) {
          pathname = pathname.slice(1);
        }
        if (parsed.host) {
          pathname = `\\\\${parsed.host}${pathname.replace(/\//g, '\\')}`;
        }
        normalized = pathname;
      } catch {
        return normalized;
      }
    }

    if (/^[a-z]:\//i.test(normalized)) {
      normalized = normalized.replace(/\//g, '\\');
    }

    if (isWindowsAbsolutePath(normalized) && hasInvalidWindowsPathChars(normalized)) {
      return '';
    }

    return normalized.trim();
  }

  function getDisplayNameFromTarget(target) {
    const normalized = normalizeTargetText(target).replace(/[\\/]+$/, '');
    if (!normalized) return '';
    const parts = normalized.split(/[\\/]/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : normalized;
  }

  function getFileExtension(target) {
    const name = getDisplayNameFromTarget(target);
    const match = name.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : '';
  }

  function guessKindFromTarget(target) {
    const normalized = normalizeTargetText(target);
    if (!normalized) return 'file';
    if (/[\\/]$/.test(normalized)) return 'folder';
    return getFileExtension(normalized) ? 'file' : 'folder';
  }

  function getDefaultIcon(kind, target) {
    if (kind === 'folder') return '📁';

    const extension = getFileExtension(target);
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(extension)) return '🖼️';
    if (['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'].includes(extension)) return '🎵';
    if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm'].includes(extension)) return '🎬';
    if (['xlsx', 'xls', 'csv', 'tsv'].includes(extension)) return '📊';
    if (['doc', 'docx', 'hwp', 'hwpx', 'txt', 'md', 'rtf'].includes(extension)) return '📄';
    if (['pdf'].includes(extension)) return '📕';
    if (['exe', 'lnk', 'bat', 'cmd', 'ps1', 'url'].includes(extension)) return '⚙️';
    if (['zip', '7z', 'rar', 'tar', 'gz'].includes(extension)) return '🗂️';
    return '📄';
  }

  function dedupeKey(target) {
    return normalizeTargetText(target).toLowerCase();
  }

  function normalizePathKey(target) {
    const normalized = normalizeTargetText(target);
    if (!normalized) return '';

    if (/^[a-z]:[\\/]?$/i.test(normalized)) {
      return `${normalized.slice(0, 2).toLowerCase()}\\`;
    }

    const uncRootMatch = normalized.match(/^(\\\\[^\\]+\\[^\\]+)[\\\/]*$/);
    if (uncRootMatch) {
      return `${uncRootMatch[1].toLowerCase()}\\`;
    }

    return normalized.replace(/[\\/]+$/, '').toLowerCase();
  }

  function isAncestorTarget(ancestorTarget, descendantTarget) {
    const ancestorKey = normalizePathKey(ancestorTarget);
    const descendantKey = normalizePathKey(descendantTarget);
    if (!ancestorKey || !descendantKey || ancestorKey === descendantKey) {
      return false;
    }

    const prefix = ancestorKey.endsWith('\\') ? ancestorKey : `${ancestorKey}\\`;
    return descendantKey.startsWith(prefix);
  }

  function pruneNestedDropShortcuts(shortcuts) {
    const candidates = Array.isArray(shortcuts) ? shortcuts.filter(Boolean) : [];
    if (candidates.length < 2) {
      return candidates;
    }

    return candidates.filter((candidate) => {
      if (normalizeKind(candidate.kind) !== 'folder') {
        return true;
      }

      const nestedChild = candidates.find((other) => (
        other
        && other !== candidate
        && isAncestorTarget(candidate.target, other.target)
      ));

      if (!nestedChild) {
        return true;
      }

      console.warn(
        '[Shortcuts] dropped ancestor folder candidate ignored:',
        candidate.target,
        'child=',
        nestedChild.target
      );
      return false;
    });
  }

  function parseDownloadUrl(value) {
    const raw = toText(value);
    if (!raw) return [];
    const parts = raw.split(':');
    if (parts.length < 3) return [];
    return [parts.slice(2).join(':')];
  }

  function parseTextForTargets(rawValue) {
    const raw = String(rawValue || '');
    if (!raw.trim()) return [];

    const matches = [];
    raw.split(/[\r\n\u0000]+/).forEach((line) => {
      const candidate = normalizeTargetText(line);
      if (isFileUri(candidate) || isWindowsAbsolutePath(candidate)) {
        matches.push(candidate);
      }
    });

    const fileUris = raw.match(/file:\/\/\/[^\s"'<>]+/gi) || [];
    const windowsPaths = raw.match(/(?:[a-z]:\\|\\\\)[^\r\n<>"]+/gi) || [];
    matches.push(...fileUris);
    matches.push(...windowsPaths);

    return matches;
  }

  function parseHtmlForTargets(rawHtml) {
    const html = toText(rawHtml);
    if (!html) return [];

    const results = [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      doc.querySelectorAll('[href], [src]').forEach((node) => {
        const href = node.getAttribute('href');
        const src = node.getAttribute('src');
        if (href) results.push(href);
        if (src) results.push(src);
      });
    } catch {
      // ignore parse failures
    }

    const fileUris = html.match(/file:\/\/\/[^\s"'<>]+/gi) || [];
    results.push(...fileUris);
    return results;
  }

  async function requestBridgeJson(url, body, options = {}) {
    const timeoutMs = Number(options.timeoutMs) > 0
      ? Number(options.timeoutMs)
      : BRIDGE_REQUEST_TIMEOUT_MS;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timeoutId = 0;

    try {
      const response = await Promise.race([
        fetch(url, {
          method: 'POST',
          headers: buildBridgeHeaders({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify(body || {}),
          ...(controller ? { signal: controller.signal } : {})
        }),
        new Promise((_, reject) => {
          timeoutId = window.setTimeout(() => {
            try {
              controller?.abort();
            } catch {
              // noop
            }
            const error = new Error(`로컬 실행 브리지 응답이 없습니다. (${timeoutMs}ms)`);
            error.name = 'TimeoutError';
            reject(error);
          }, timeoutMs);
        })
      ]);
      const payload = await response.json().catch(() => null);

      if (response.status === 404) {
        throw new Error('로컬 실행 브리지가 실행 중이 아닙니다. 실행기를 다시 시작해 주세요.');
      }
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || '브리지 요청이 실패했습니다.');
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(`로컬 실행 브리지 응답이 없습니다. (${timeoutMs}ms)`);
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      throw error;
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  function normalizeShortcut(item = {}) {
    const target = normalizeTargetText(item.target);
    const kind = normalizeKind(item.kind, guessKindFromTarget(target));
    const now = new Date().toISOString();
    return {
      id: toText(item.id, LS.Helpers.generateId()),
      title: toText(item.title, getDisplayNameFromTarget(target) || (kind === 'folder' ? '새 폴더' : '새 파일')),
      target,
      kind,
      icon: toText(item.icon, getDefaultIcon(kind, target)),
      accent: normalizeAccent(item.accent),
      createdAt: toText(item.createdAt, now),
      updatedAt: toText(item.updatedAt, now)
    };
  }

  function readItems() {
    const stored = LS.Storage.get(STORAGE_KEY, []);
    if (!Array.isArray(stored)) return [];
    return stored.map((item) => normalizeShortcut(item));
  }

  function writeItems(items) {
    const normalized = Array.isArray(items) ? items.map((item) => normalizeShortcut(item)) : [];
    LS.Storage.set(STORAGE_KEY, normalized);
  }

  function getDisplayConfig() {
    return {
      showLabels: LS.Config.get('shortcutShowLabels') !== false,
      showPaths: Boolean(LS.Config.get('shortcutShowPaths')),
      iconScale: normalizeScale(LS.Config.get('shortcutIconScale'))
    };
  }

  function accentOptions() {
    return Object.entries(ACCENT_META).map(([value, meta]) => ({
      value,
      text: meta.label
    }));
  }

  LS.ShortcutsWidget = {
    _items: [],
    _dragDepth: 0,
    _nativeDropBound: false,
    _lastNativeDropAt: 0,
    _pendingNativeDrops: [],
    _nativeDropWaiters: [],
    _nativeDropFlushTimer: 0,
    _lastNativeDropProxyAt: 0,
    _nativeProxyLeaveTimer: 0,

    async init() {
      await LS.Storage.initDB();
      this._items = readItems();
      const container = document.getElementById('shortcuts-content');
      if (container) {
        this._bindContainer(container);
      }
      this._bindNativeDropListener();
      this.render();
      this._consumePendingNativeDrops();
    },

    render() {
      const container = document.getElementById('shortcuts-content');
      if (!container) return;

      this._bindContainer(container);
      this._items = readItems();

      const display = getDisplayConfig();
      container.className = `shortcuts-content is-scale-${display.iconScale} ${display.showLabels ? 'is-show-labels' : 'is-hide-labels'} ${display.showPaths ? 'is-show-paths' : 'is-hide-paths'} ${this._items.length ? 'has-items' : 'is-empty'}`;

      let html = '<div class="shortcuts-grid">';
      if (!this._items.length) {
        html += `
          <button type="button" class="shortcut-empty-button" data-shortcut-action="add">
            <span class="shortcut-empty-icon" aria-hidden="true">＋</span>
            <span class="shortcut-empty-title">바로가기가 없습니다</span>
            <span class="shortcut-empty-help">파일이나 폴더를 끌어 놓거나 + 버튼으로 직접 추가해 주세요.</span>
          </button>
        `;
      } else {
        this._items.forEach((item) => {
          const title = escapeHtml(item.title);
          const target = escapeHtml(item.target);
          const icon = escapeHtml(item.icon);
          const id = escapeHtml(item.id);
          const accent = escapeHtml(item.accent);
          const kind = escapeHtml(item.kind);

          html += `
            <div class="shortcut-item" data-shortcut-id="${id}" data-accent="${accent}" data-kind="${kind}">
              <button type="button" class="shortcut-open-btn" data-shortcut-action="open" title="${target}">
                <span class="shortcut-icon-shell" aria-hidden="true">
                  <span class="shortcut-icon">${icon}</span>
                </span>
                <span class="shortcut-text">
                  ${display.showLabels ? `<span class="shortcut-title">${title}</span>` : ''}
                  ${display.showPaths ? `<span class="shortcut-path">${target}</span>` : ''}
                </span>
              </button>
              <div class="shortcut-actions">
                <button type="button" class="shortcut-mini-btn" data-shortcut-action="edit" title="수정">✎</button>
                <button type="button" class="shortcut-mini-btn" data-shortcut-action="delete" title="삭제">×</button>
              </div>
            </div>
          `;
        });
      }
      html += '</div>';
      html += `
        <div class="shortcuts-drop-overlay" aria-hidden="true">
          <div class="shortcuts-drop-badge">드롭하여 추가</div>
          <div class="shortcuts-drop-title">폴더와 파일을 바로 등록합니다</div>
          <div class="shortcuts-drop-help">여러 항목도 한 번에 추가할 수 있습니다.</div>
        </div>
      `;

      container.innerHTML = html;
    },

    async addShortcut(seed = {}) {
      await this._openEditor(seed);
    },

    async editShortcut(shortcutId) {
      const item = this._items.find((entry) => entry.id === shortcutId);
      if (!item) return;
      await this._openEditor(item);
    },

    async deleteShortcut(shortcutId) {
      const item = this._items.find((entry) => entry.id === shortcutId);
      if (!item) return;

      const confirmed = await LS.Helpers.confirmModal('바로가기 삭제', `"${item.title}" 바로가기를 삭제하시겠습니까?`);
      if (!confirmed) return;

      this._items = this._items.filter((entry) => entry.id !== shortcutId);
      writeItems(this._items);
      this.render();
      LS.Helpers.showToast('바로가기를 삭제했습니다.', 'success', 1800);
    },

    async launchShortcut(shortcutId, triggerEl) {
      const item = this._items.find((entry) => entry.id === shortcutId);
      if (!item) return;

      try {
        triggerEl?.classList.add('is-launching');
        const payload = await requestBridgeJson(SHELL_OPEN_URL, {
          target: item.target,
          kind: item.kind
        });
        this._syncItemMetadata(item.id, payload);
      } catch (error) {
        LS.Helpers.showToast(`실행 실패: ${error.message || '알 수 없는 오류입니다.'}`, 'error', 3600);
      } finally {
        window.setTimeout(() => {
          triggerEl?.classList.remove('is-launching');
        }, 180);
      }
    },

    async _openEditor(item = null) {
      const seedTarget = toText(item?.target);
      const guessedKind = normalizeKind(item?.kind, guessKindFromTarget(seedTarget));
      const result = await LS.Helpers.promptModal(item ? '바로가기 수정' : '바로가기 추가', [
        {
          id: 'target',
          type: 'text',
          label: '실행 경로',
          value: seedTarget,
          placeholder: '예: C:\\Users\\user\\Desktop\\자료 또는 C:\\Users\\user\\Desktop\\sample.pdf',
          help: '파일과 폴더 모두 같은 방식으로 등록됩니다.'
        },
        {
          id: 'title',
          type: 'text',
          label: '표시 이름',
          value: item?.title || '',
          placeholder: '비워 두면 경로 이름을 자동으로 사용합니다.'
        },
        {
          id: 'icon',
          type: 'text',
          label: '아이콘',
          value: item?.icon || getDefaultIcon(guessedKind, seedTarget),
          placeholder: getDefaultIcon(guessedKind, seedTarget)
        },
        {
          id: 'iconPreset',
          type: 'icon-grid',
          label: '아이콘 빠른 선택',
          targetId: 'icon',
          value: item?.icon || getDefaultIcon(guessedKind, seedTarget),
          options: ICON_OPTIONS
        },
        {
          id: 'accent',
          type: 'select',
          label: '강조 색상',
          value: normalizeAccent(item?.accent),
          options: accentOptions()
        }
      ], {
        message: '드래그 앤 드롭으로도 같은 방식으로 등록됩니다.',
        confirmText: item ? '저장' : '추가'
      });

      if (!result) return;

      const target = normalizeTargetText(result.target);
      if (!target) {
        LS.Helpers.showToast('실행 경로를 입력해 주세요.', 'warning', 2400);
        return;
      }

      const shortcut = await this._buildShortcutFromTarget(target, {
        seed: item,
        title: result.title,
        icon: result.icon,
        accent: result.accent,
        allowUnverified: true
      });

      if (!shortcut) {
        LS.Helpers.showToast('등록할 경로를 확인하지 못했습니다.', 'warning', 2600);
        return;
      }

      if (!item) {
        this._items = [...this._items, shortcut];
      } else {
        this._items = this._items.map((entry) => entry.id === item.id ? shortcut : entry);
      }

      writeItems(this._items);
      this.render();
      LS.Helpers.showToast(item ? '바로가기를 수정했습니다.' : '바로가기를 추가했습니다.', 'success', 1800);
    },

    async _resolveTargetDetails(target, kind = 'auto') {
      const normalizedTarget = normalizeTargetText(target);
      if (!normalizedTarget) {
        throw new Error('경로가 비어 있습니다.');
      }

      const payload = await requestBridgeJson(SHELL_INSPECT_URL, {
        target: normalizedTarget,
        kind
      });

      if (payload.exists === false) {
        throw new Error('해당 경로를 찾을 수 없습니다.');
      }

      return {
        target: normalizeTargetText(payload.target || normalizedTarget),
        kind: normalizeKind(payload.kind, guessKindFromTarget(normalizedTarget))
      };
    },

    async _buildShortcutFromTarget(target, options = {}) {
      const normalizedTarget = normalizeTargetText(target);
      if (!normalizedTarget) return null;

      const seed = options.seed || null;
      const fallbackKind = normalizeKind(seed?.kind, guessKindFromTarget(normalizedTarget));
      let resolvedTarget = normalizedTarget;
      let resolvedKind = fallbackKind;

      try {
        const resolved = await this._resolveTargetDetails(normalizedTarget, seed?.kind || 'auto');
        resolvedTarget = resolved.target;
        resolvedKind = resolved.kind;
      } catch (error) {
        if (options.allowUnverified !== true) {
          throw error;
        }
      }

      return normalizeShortcut({
        ...seed,
        target: resolvedTarget,
        kind: resolvedKind,
        title: toText(options.title, seed?.title || getDisplayNameFromTarget(resolvedTarget) || (resolvedKind === 'folder' ? '새 폴더' : '새 파일')),
        icon: toText(options.icon, seed?.icon || getDefaultIcon(resolvedKind, resolvedTarget)),
        accent: normalizeAccent(options.accent || seed?.accent || (resolvedKind === 'folder' ? 'amber' : 'sky')),
        updatedAt: new Date().toISOString()
      });
    },

    _syncItemMetadata(shortcutId, payload) {
      const item = this._items.find((entry) => entry.id === shortcutId);
      if (!item || !payload) return;

      const nextTarget = normalizeTargetText(payload.target || item.target);
      const nextKind = normalizeKind(payload.kind, item.kind);
      if (nextTarget === item.target && nextKind === item.kind) return;

      this._items = this._items.map((entry) => entry.id === shortcutId
        ? normalizeShortcut({
            ...entry,
            target: nextTarget,
            kind: nextKind,
            updatedAt: new Date().toISOString()
          })
        : entry);
      writeItems(this._items);
      this.render();
    },

    _bindContainer(container) {
      if (container.dataset.shortcutsBound === '1') return;
      container.dataset.shortcutsBound = '1';
      this._bindNativeDropListener();

      container.addEventListener('click', async (event) => {
        const actionButton = event.target.closest('[data-shortcut-action]');
        if (!actionButton) return;

        const action = actionButton.dataset.shortcutAction;
        if (action === 'add') {
          await this.addShortcut();
          return;
        }

        const itemNode = actionButton.closest('[data-shortcut-id]');
        const shortcutId = itemNode?.dataset.shortcutId || '';
        if (!shortcutId) return;

        if (action === 'open') {
          await this.launchShortcut(shortcutId, actionButton);
          return;
        }
        if (action === 'edit') {
          await this.editShortcut(shortcutId);
          return;
        }
        if (action === 'delete') {
          await this.deleteShortcut(shortcutId);
        }
      });

      container.addEventListener('dragenter', (event) => {
        if (!this._canAcceptDrop(event.dataTransfer)) return;
        event.preventDefault();
        this._dragDepth += 1;
        this._activateDropTarget(container);
      });

      container.addEventListener('dragover', (event) => {
        if (!this._canAcceptDrop(event.dataTransfer)) return;
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'copy';
        }
        this._activateDropTarget(container);
      });

      container.addEventListener('dragleave', (event) => {
        if (event.currentTarget !== container) return;
        this._dragDepth = Math.max(0, this._dragDepth - 1);
        if (this._dragDepth === 0) {
          if (this._canUseNativeDropProxy()) {
            if (this._nativeProxyLeaveTimer) {
              window.clearTimeout(this._nativeProxyLeaveTimer);
            }
            this._nativeProxyLeaveTimer = window.setTimeout(() => {
              this._nativeProxyLeaveTimer = 0;
              if (this._dragDepth === 0) {
                this._deactivateDropTarget(container);
              }
            }, 1600);
            return;
          }
          this._deactivateDropTarget(container);
        }
      });

      container.addEventListener('drop', async (event) => {
        if (!this._canAcceptDrop(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        this._dragDepth = 0;
        try {
          await this._handleDrop(event.dataTransfer);
        } finally {
          this._deactivateDropTarget(container);
        }
      });

      window.addEventListener('dragend', () => {
        this._dragDepth = 0;
        this._deactivateDropTarget(container);
      });
      window.addEventListener('drop', () => {
        this._dragDepth = 0;
        this._deactivateDropTarget(container);
      });
    },

    _activateDropTarget(container) {
      if (this._nativeProxyLeaveTimer) {
        window.clearTimeout(this._nativeProxyLeaveTimer);
        this._nativeProxyLeaveTimer = 0;
      }
      container.classList.add('is-drop-active');
      this._showNativeDropProxy(container);
    },

    _deactivateDropTarget(container) {
      if (this._nativeProxyLeaveTimer) {
        window.clearTimeout(this._nativeProxyLeaveTimer);
        this._nativeProxyLeaveTimer = 0;
      }
      container.classList.remove('is-drop-active');
      this._hideNativeDropProxy();
    },

    _canAcceptDrop(dataTransfer) {
      if (!dataTransfer) return false;
      const types = Array.from(dataTransfer.types || []).map((type) => String(type || ''));
      if (types.includes('Files')) return true;
      return types.some((type) => DROP_TEXT_TYPES.includes(type));
    },

    _canUseNativeDropProxy() {
      return Boolean(window.chrome?.webview?.postMessage);
    },

    _postNativeDropProxyMessage(action, payload = {}) {
      if (!this._canUseNativeDropProxy()) return;

      try {
        window.chrome.webview.postMessage({
          type: 'shortcut-drop-proxy',
          action,
          ...payload
        });
      } catch (error) {
        console.warn('[Shortcuts] native drop proxy message failed.', error);
      }
    },

    _showNativeDropProxy(container) {
      if (!this._canUseNativeDropProxy() || !container) return;

      const now = Date.now();
      if (now - this._lastNativeDropProxyAt < 120) return;
      this._lastNativeDropProxyAt = now;

      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const screenLeft = Number.isFinite(window.screenX) ? window.screenX : (Number(window.screenLeft) || 0);
      const screenTop = Number.isFinite(window.screenY) ? window.screenY : (Number(window.screenTop) || 0);

      this._postNativeDropProxyMessage('show', {
        bounds: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          screenLeft: Math.round(screenLeft + rect.left),
          screenTop: Math.round(screenTop + rect.top),
          screenWidth: Math.round(rect.width),
          screenHeight: Math.round(rect.height),
          devicePixelRatio: Number(window.devicePixelRatio || 1)
        }
      });
    },

    _hideNativeDropProxy() {
      this._postNativeDropProxyMessage('hide');
    },

    _bindNativeDropListener() {
      if (this._nativeDropBound) return;
      this._nativeDropBound = true;

      window.addEventListener('livelysam-shortcut-native-drop', (event) => {
        try {
          this.enqueueNativeDrop(event?.detail || {});
        } catch (error) {
          console.warn('[Shortcuts] native drop handling failed.', error);
        }
      });
    },

    enqueueNativeDrop(detail = {}) {
      const payload = detail && typeof detail === 'object' ? { ...detail } : {};
      this._lastNativeDropAt = Date.now();
      this._pendingNativeDrops.push(payload);

      if (this._nativeDropWaiters.length) {
        const waiters = [...this._nativeDropWaiters];
        this._nativeDropWaiters = [];
        waiters.forEach((resolve) => {
          try {
            resolve(true);
          } catch {
            // ignore waiter failures
          }
        });
      }

      if (this._nativeDropFlushTimer) {
        window.clearTimeout(this._nativeDropFlushTimer);
      }
      this._nativeDropFlushTimer = window.setTimeout(() => {
        this._nativeDropFlushTimer = 0;
        this._consumePendingNativeDrops();
      }, 0);
    },

    _consumePendingNativeDrops() {
      if (!this._pendingNativeDrops.length) return;

      const queue = [...this._pendingNativeDrops];
      this._pendingNativeDrops = [];

      queue.reduce((promise, detail) => promise.then(() => this.handleNativeDrop(detail)), Promise.resolve())
        .catch((error) => {
          console.warn('[Shortcuts] queued native drop handling failed.', error);
        });
    },

    _waitForNativeDrop(timeoutMs = DROP_WAIT_MS) {
      if (this._pendingNativeDrops.length > 0) {
        return Promise.resolve(true);
      }
      if (Date.now() - this._lastNativeDropAt < 180) {
        return Promise.resolve(true);
      }

      return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(Boolean(value));
        };

        const timer = window.setTimeout(() => {
          this._nativeDropWaiters = this._nativeDropWaiters.filter((entry) => entry !== waiter);
          finish(false);
        }, timeoutMs);

        const waiter = (value) => {
          window.clearTimeout(timer);
          finish(value);
        };

        this._nativeDropWaiters.push(waiter);
      });
    },

    _isPointInsideContainer(clientX, clientY) {
      const container = document.getElementById('shortcuts-content');
      if (!container) return false;
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return false;
      }

      const rect = container.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        return false;
      }

      const hit = document.elementFromPoint(clientX, clientY);
      if (!hit) return true;
      return Boolean(hit.closest('#shortcuts-content'));
    },

    async handleNativeDrop(detail = {}) {
      const targets = Array.isArray(detail.targets) ? detail.targets : [];
      if (!targets.length) return false;

      const clientX = Number(detail.clientX);
      const clientY = Number(detail.clientY);
      const forceAccept = detail.force === true;
      const insideTarget = this._isPointInsideContainer(clientX, clientY);
      const container = document.getElementById('shortcuts-content');
      const dropActive = Boolean(container?.classList.contains('is-drop-active'));

      if (!forceAccept && !insideTarget && !(dropActive && (!Number.isFinite(clientX) || !Number.isFinite(clientY)))) {
        return false;
      }

      this._lastNativeDropAt = Date.now();
      this._dragDepth = 0;
      if (container) {
        this._deactivateDropTarget(container);
      }
      await this._appendDroppedTargets(targets, {
        source: 'native',
        skipWait: true
      });
      return true;
    },

    async _handleDrop(dataTransfer) {
      const rawTargets = await this._extractDroppedTargets(dataTransfer);
      await this._appendDroppedTargets(rawTargets, {
        dataTransfer,
        allowDirectFallback: true
      });
    },

    async _appendDroppedTargets(rawTargets, options = {}) {
      const normalizedTargets = [...new Set((Array.isArray(rawTargets) ? rawTargets : [])
        .map((target) => normalizeTargetText(target))
        .filter(Boolean))];

      if (!normalizedTargets.length) {
        if (options.skipWait !== true) {
          const nativeDropArrived = await this._waitForNativeDrop();
          if (nativeDropArrived) {
            return;
          }

          if (options.allowDirectFallback === true && options.dataTransfer) {
            const fallbackTargets = await this._extractDroppedTargets(options.dataTransfer, {
              ignoreNativeProxy: true
            });
            if (fallbackTargets.length) {
              await this._appendDroppedTargets(fallbackTargets, {
                ...options,
                skipWait: true,
                allowDirectFallback: false
              });
              return;
            }
          }
        }

        const types = Array.from(options.dataTransfer?.types || []).join(', ') || '없음';
        console.warn('[Shortcuts] drop path detection failed. types=', types, 'files=', options.dataTransfer?.files?.length || 0);
        LS.Helpers.showToast('드롭한 항목의 경로를 읽지 못했습니다. 탐색기에서 다시 끌어 놓아 주세요.', 'warning', 3600);
        return;
      }

      const existingKeys = new Set(this._items.map((item) => dedupeKey(item.target)));
      const seenRawKeys = new Set();
      const resolvedCandidates = [];

      for (const target of normalizedTargets) {
        const targetKey = dedupeKey(target);
        if (!targetKey || seenRawKeys.has(targetKey) || existingKeys.has(targetKey)) {
          continue;
        }
        seenRawKeys.add(targetKey);

        try {
          const shortcut = await this._buildShortcutFromTarget(target);
          if (!shortcut) continue;
          const resolvedKey = dedupeKey(shortcut.target);
          if (!resolvedKey || existingKeys.has(resolvedKey)) {
            continue;
          }
          resolvedCandidates.push(shortcut);
          existingKeys.add(resolvedKey);
        } catch (error) {
          console.warn('[Shortcuts] dropped target could not be registered:', target, error);
        }
      }

      const additions = pruneNestedDropShortcuts(resolvedCandidates);

      if (!additions.length) {
        LS.Helpers.showToast('추가할 새 파일이나 폴더가 없습니다.', 'info', 2200);
        return;
      }

      this._items = [...this._items, ...additions];
      writeItems(this._items);
      this.render();
      LS.Helpers.showToast(`바로가기 ${additions.length}개를 추가했습니다.`, 'success', 2200);
    },

    async _extractDroppedTargets(dataTransfer, options = {}) {
      const directValues = [];
      const fallbackValues = [];
      const pushValue = (bucket, value) => {
        const normalized = normalizeTargetText(value);
        if (!normalized) return;
        if (isFileUri(value) || isWindowsAbsolutePath(normalized)) {
          bucket.push(normalized);
        }
      };

      Array.from(dataTransfer?.files || []).forEach((file) => {
        pushValue(directValues, file?.path);
        pushValue(directValues, file?._path);
      });

      const items = Array.from(dataTransfer?.items || []);
      items.forEach((item) => {
        const file = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
        pushValue(directValues, file?.path);
        pushValue(directValues, file?._path);
      });

      const dragTypes = Array.from(dataTransfer?.types || []).map((type) => String(type || ''));
      const hasNativeFilePayload = dragTypes.includes('Files');
      const shouldPreferNativeProxy = hasNativeFilePayload && !options.ignoreNativeProxy && this._canUseNativeDropProxy();
      if (shouldPreferNativeProxy) {
        return [];
      }

      const directTargets = [...new Set(directValues.map((value) => normalizeTargetText(value)).filter(Boolean))];
      if (directTargets.length) {
        return directTargets;
      }

      const stringValues = await Promise.all(items
        .filter((item) => item.kind === 'string' && typeof item.getAsString === 'function')
        .map((item) => new Promise((resolve) => {
          try {
            item.getAsString((result) => resolve(result || ''));
          } catch {
            resolve('');
          }
        })));

      stringValues.forEach((raw) => {
        parseTextForTargets(raw).forEach((value) => pushValue(fallbackValues, value));
        parseHtmlForTargets(raw).forEach((value) => pushValue(fallbackValues, value));
        parseDownloadUrl(raw).forEach((value) => pushValue(fallbackValues, value));
      });

      const allTypes = [...new Set([...DROP_TEXT_TYPES, ...Array.from(dataTransfer?.types || [])])];
      allTypes.forEach((type) => {
        let raw = '';
        try {
          raw = toText(dataTransfer.getData(type));
        } catch {
          raw = '';
        }
        if (!raw) return;

        if (/downloadurl/i.test(type)) {
          parseDownloadUrl(raw).forEach((value) => pushValue(fallbackValues, value));
          return;
        }
        if (type === 'text/html') {
          parseHtmlForTargets(raw).forEach((value) => pushValue(fallbackValues, value));
        }
        parseTextForTargets(raw).forEach((value) => pushValue(fallbackValues, value));
      });

      return [...new Set(fallbackValues.map((value) => normalizeTargetText(value)).filter(Boolean))];
    }
  };

  if (Array.isArray(window.__livelysamPendingShortcutDrops) && window.__livelysamPendingShortcutDrops.length) {
    const pendingDetails = [...window.__livelysamPendingShortcutDrops];
    window.__livelysamPendingShortcutDrops = [];
    pendingDetails.forEach((detail) => {
      try {
        LS.ShortcutsWidget.enqueueNativeDrop(detail);
      } catch (error) {
        console.warn('[Shortcuts] pending native drop handling failed.', error);
      }
    });
  }
})();
