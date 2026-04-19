(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};

  LS.TimerWidget = {
    _mode: 'timer',
    _running: false,
    _interval: null,
    _layoutObserver: null,
    _layoutRefreshHandle: 0,
    _boundViewportLayoutHandler: null,

    _timerSeconds: 0,
    _timerTotalSeconds: 0,
    _timerEndsAt: 0,

    _stopwatchElapsedMs: 0,
    _stopwatchStartedAt: 0,
    _stopwatchLastLapMarkMs: 0,
    _stopwatchLastLapMs: 0,
    _stopwatchLapCount: 0,

    init() {
      this.render();
      this._bindEvents();
      this._bindResponsiveLayout();
    },

    _getInnerElement() {
      return document.getElementById('timer-widget-inner');
    },

    _bindEvents() {
      document.getElementById('timer-start')?.addEventListener('click', () => this.toggle());
      document.getElementById('timer-action')?.addEventListener('click', () => this.handleAction());
      document.getElementById('timer-reset')?.addEventListener('click', () => this.reset());
      document.getElementById('timer-mode')?.addEventListener('click', () => this.switchMode());
    },

    _setButtonContent(buttonId, {
      icon = '',
      label = '',
      title = '',
      pressed = null,
      disabled = false
    } = {}) {
      const button = document.getElementById(buttonId);
      if (!button) return;

      const iconEl = button.querySelector('.timer-btn-icon');
      const labelEl = button.querySelector('.timer-btn-label');

      if (iconEl) iconEl.textContent = icon;
      if (labelEl) labelEl.textContent = label;
      if (title) {
        button.title = title;
        button.setAttribute('aria-label', title);
      }

      if (pressed === null) {
        button.removeAttribute('aria-pressed');
      } else {
        button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      }

      button.disabled = disabled;
      if (disabled) {
        button.setAttribute('aria-disabled', 'true');
      } else {
        button.removeAttribute('aria-disabled');
      }
    },

    _syncWidgetState() {
      const widget = this._getInnerElement();
      if (!widget) return;

      widget.dataset.mode = this._mode;
      widget.dataset.running = this._running ? 'true' : 'false';
      widget.dataset.laps = String(this._stopwatchLapCount);
      widget.dataset.hasTimer = this._timerTotalSeconds > 0 ? 'true' : 'false';
    },

    _bindResponsiveLayout() {
      const widget = this._getInnerElement();
      if (!widget) return;

      this._boundViewportLayoutHandler = this._boundViewportLayoutHandler || (() => {
        this._queueResponsiveLayoutRefresh();
      });

      if (typeof ResizeObserver !== 'undefined') {
        this._layoutObserver?.disconnect?.();
        this._layoutObserver = new ResizeObserver(() => {
          this._queueResponsiveLayoutRefresh();
        });
        this._layoutObserver.observe(widget);
      } else {
        window.removeEventListener('resize', this._boundViewportLayoutHandler);
        window.addEventListener('resize', this._boundViewportLayoutHandler);
      }

      this._updateResponsiveLayout();
    },

    _queueResponsiveLayoutRefresh() {
      if (this._layoutRefreshHandle) {
        window.cancelAnimationFrame(this._layoutRefreshHandle);
      }

      this._layoutRefreshHandle = window.requestAnimationFrame(() => {
        this._layoutRefreshHandle = 0;
        this._updateResponsiveLayout();
      });
    },

    _updateResponsiveLayout() {
      const widget = this._getInnerElement();
      if (!widget) return;

      const width = widget.clientWidth || 0;
      const height = widget.clientHeight || 0;
      let layout = 'full';

      if (width <= 226 || height <= 82) {
        const shouldStack = width <= 170 || height <= 74;
        layout = shouldStack ? 'micro-stack' : 'micro-inline';
      } else if (width <= 308 || height <= 124) {
        layout = 'compact';
      }

      widget.dataset.layout = layout;
    },

    _formatSeconds(totalSeconds) {
      const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
      const hours = Math.floor(safeSeconds / 3600);
      const minutes = Math.floor((safeSeconds % 3600) / 60);
      const seconds = safeSeconds % 60;

      if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }

      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    },

    _formatElapsed(ms) {
      const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
      return this._formatSeconds(totalSeconds);
    },

    _getTimerRemainingSeconds() {
      if (!this._running || this._mode !== 'timer' || !this._timerEndsAt) {
        return this._timerSeconds;
      }
      return Math.max(0, Math.ceil((this._timerEndsAt - Date.now()) / 1000));
    },

    _getStopwatchElapsedMs() {
      if (!this._running || this._mode !== 'stopwatch') {
        return this._stopwatchElapsedMs;
      }
      return Math.max(0, Date.now() - this._stopwatchStartedAt);
    },

    _setRunLoop(active) {
      if (!active) {
        if (this._interval) {
          window.clearInterval(this._interval);
          this._interval = null;
        }
        return;
      }

      if (!this._interval) {
        this._interval = window.setInterval(() => this._tick(), 200);
      }
    },

    _getTimerStateText() {
      if (this._timerTotalSeconds > 0) {
        if (this._running) return '타이머 실행 중';
        if (this._timerSeconds <= 0) return '타이머 종료';
        return `설정 ${this._formatSeconds(this._timerTotalSeconds)}`;
      }
      return '타이머';
    },

    _getStopwatchStateText() {
      if (this._stopwatchLapCount > 0 && this._stopwatchLastLapMs > 0) {
        return `랩 ${this._stopwatchLapCount} · ${this._formatElapsed(this._stopwatchLastLapMs)}`;
      }
      if (this._running) return '스탑워치 실행 중';
      if (this._stopwatchElapsedMs > 0) return '일시 정지';
      return '스탑워치';
    },

    _getStateText() {
      return this._mode === 'timer'
        ? this._getTimerStateText()
        : this._getStopwatchStateText();
    },

    _getDisplayText() {
      return this._mode === 'timer'
        ? this._formatSeconds(this._getTimerRemainingSeconds())
        : this._formatElapsed(this._getStopwatchElapsedMs());
    },

    toggle() {
      if (this._running) {
        this.pause();
      } else {
        this.start();
      }
    },

    start() {
      if (this._running) return;

      if (this._mode === 'timer') {
        if (this._timerSeconds <= 0) {
          this.openTimerSetup();
          return;
        }

        this._timerEndsAt = Date.now() + (this._timerSeconds * 1000);
      } else {
        this._stopwatchStartedAt = Date.now() - this._stopwatchElapsedMs;
      }

      this._running = true;
      this._setRunLoop(true);
      this._updateDisplay();
    },

    pause() {
      if (!this._running) {
        this._updateDisplay();
        return;
      }

      if (this._mode === 'timer') {
        this._timerSeconds = this._getTimerRemainingSeconds();
        this._timerEndsAt = 0;
      } else {
        this._stopwatchElapsedMs = this._getStopwatchElapsedMs();
      }

      this._running = false;
      this._setRunLoop(false);
      this._updateDisplay();
    },

    reset() {
      const wasRunning = this._running;
      this.pause();

      if (this._mode === 'timer') {
        this._timerSeconds = this._timerTotalSeconds > 0 ? this._timerTotalSeconds : 0;
      } else {
        this._stopwatchElapsedMs = 0;
        this._stopwatchStartedAt = 0;
        this._stopwatchLastLapMarkMs = 0;
        this._stopwatchLastLapMs = 0;
        this._stopwatchLapCount = 0;
      }

      if (wasRunning && this._mode === 'timer' && this._timerSeconds <= 0) {
        this._timerTotalSeconds = 0;
      }

      this._updateDisplay();
    },

    handleAction() {
      if (this._mode === 'timer') {
        this.openTimerSetup();
        return;
      }

      this.recordLap();
    },

    async openTimerSetup() {
      if (this._running || this._mode !== 'timer') return;

      const initialMinutes = Math.max(
        1,
        Math.round((this._timerSeconds || this._timerTotalSeconds || (50 * 60)) / 60)
      );

      const result = await LS.Helpers.promptModal('타이머 설정', [
        {
          id: 'minutes',
          type: 'number',
          label: '분 단위 시간',
          value: String(initialMinutes),
          min: 1,
          max: 999,
          step: 1
        }
      ], {
        confirmText: '적용'
      });

      const minutes = parseInt(result?.minutes, 10);
      if (!minutes || Number.isNaN(minutes) || minutes <= 0) return;

      this._timerTotalSeconds = minutes * 60;
      this._timerSeconds = this._timerTotalSeconds;
      this._updateDisplay();
      LS.Helpers.showToast('타이머 시간이 설정되었습니다.', 'success');
    },

    switchMode() {
      if (this._running) {
        this.pause();
      }

      this._mode = this._mode === 'timer' ? 'stopwatch' : 'timer';
      this._updateDisplay();
    },

    recordLap() {
      if (!this._running || this._mode !== 'stopwatch') return;

      const elapsedMs = this._getStopwatchElapsedMs();
      const lapMs = Math.max(0, elapsedMs - this._stopwatchLastLapMarkMs);

      this._stopwatchLastLapMarkMs = elapsedMs;
      this._stopwatchLastLapMs = lapMs;
      this._stopwatchLapCount += 1;
      this._updateDisplay();
    },

    _onTimerEnd() {
      this._timerSeconds = 0;
      this._timerEndsAt = 0;
      this._running = false;
      this._setRunLoop(false);
      this._updateDisplay();

      const widget = document.getElementById('widget-timer') || this._getInnerElement();
      if (widget) {
        widget.classList.add('timer-flash');
        window.setTimeout(() => widget.classList.remove('timer-flash'), 3000);
      }
    },

    _tick() {
      if (!this._running) return;

      if (this._mode === 'timer') {
        const remainingSeconds = this._getTimerRemainingSeconds();
        this._timerSeconds = remainingSeconds;
        this._updateDisplay();

        if (remainingSeconds <= 0) {
          this._onTimerEnd();
        }
        return;
      }

      this._updateDisplay();
    },

    _updateButtons() {
      const hasTimerValue = this._timerTotalSeconds > 0 || this._timerSeconds > 0;
      const hasStopwatchValue = this._stopwatchElapsedMs > 0 || this._stopwatchLapCount > 0;
      const canReset = this._mode === 'timer' ? hasTimerValue : hasStopwatchValue;

      this._setButtonContent('timer-start', {
        icon: this._running ? '⏸' : '▶',
        label: this._running ? '정지' : '시작',
        title: this._running
          ? `${this._mode === 'timer' ? '타이머' : '스탑워치'} 일시정지`
          : `${this._mode === 'timer' ? '타이머' : '스탑워치'} 시작`,
        pressed: this._running
      });

      this._setButtonContent('timer-action', this._mode === 'timer'
        ? {
            icon: '⏲',
            label: '설정',
            title: '타이머 설정',
            disabled: this._running
          }
        : {
            icon: '⚑',
            label: '랩',
            title: '랩 기록',
            disabled: !this._running
          });

      this._setButtonContent('timer-reset', {
        icon: '↺',
        label: '초기화',
        title: `${this._mode === 'timer' ? '타이머' : '스탑워치'} 초기화`,
        disabled: !canReset && !this._running
      });

      this._setButtonContent('timer-mode', this._mode === 'timer'
        ? {
            icon: '⏱',
            label: '전환',
            title: '스탑워치로 전환'
          }
        : {
            icon: '⏲',
            label: '전환',
            title: '타이머로 전환'
          });
    },

    _updateDisplay() {
      const display = document.getElementById('timer-display');
      if (display) {
        display.textContent = this._getDisplayText();
      }

      const stateEl = document.getElementById('timer-state');
      if (stateEl) {
        stateEl.textContent = this._getStateText();
        stateEl.style.display = 'block';
      }

      this._updateButtons();
      this._syncWidgetState();
    },

    render() {
      this._updateDisplay();
      this._updateResponsiveLayout();
    },

    destroy() {
      if (this._layoutRefreshHandle) {
        window.cancelAnimationFrame(this._layoutRefreshHandle);
        this._layoutRefreshHandle = 0;
      }

      this._layoutObserver?.disconnect?.();
      this._layoutObserver = null;

      if (this._boundViewportLayoutHandler) {
        window.removeEventListener('resize', this._boundViewportLayoutHandler);
      }

      this._setRunLoop(false);
    }
  };
})();
