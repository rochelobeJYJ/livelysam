(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  LS.ClockWidget = {
    _interval: null,
    _analogCtx: null,

    init() {
      this._startClock();
    },

    _startClock() {
      this._tick();
      this._interval = setInterval(() => this._tick(), 1000);
    },

    _tick() {
      const now = new Date();
      const config = LS.Config;
      const is24h = config.get('clockFormat') === 1;
      const showSec = config.get('showSeconds');

      // 디지털 시계
      const digitalEl = document.getElementById('clock-digital');
      if (digitalEl) {
        digitalEl.textContent = LS.Helpers.formatTime(now, is24h, showSec);
      }

      // 날짜
      const dateEl = document.getElementById('clock-date');
      if (dateEl) {
        dateEl.textContent = LS.Helpers.formatDate(now, 'YYYY년 M월 D일');
      }

      // 요일
      const dayEl = document.getElementById('clock-day');
      if (dayEl) {
        dayEl.textContent = LS.Helpers.DAY_NAMES_FULL[now.getDay()];
      }

      // 학기
      const semesterEl = document.getElementById('clock-semester');
      if (semesterEl) {
        semesterEl.textContent = LS.Helpers.getSemester(now);
      }

      // 공휴일 체크
      const holidayEl = document.getElementById('clock-holiday');
      if (holidayEl) {
        const dateStr = LS.Helpers.formatDate(now, 'YYYY-MM-DD');
        const holiday = LS.Holidays.isHoliday(dateStr);
        if (holiday) {
          holidayEl.textContent = `🎉 ${holiday.name}`;
          holidayEl.style.display = 'block';
        } else {
          holidayEl.style.display = 'none';
        }
      }

      // 현재 교시
      this._updatePeriodInfo(now);

      // 아날로그 시계
      const analogWrap = document.querySelector('.clock-analog-wrap');
      if (config.get('showAnalogClock')) {
        if (analogWrap) analogWrap.style.display = 'block';
        this._drawAnalogClock(now);
      } else {
        if (analogWrap) analogWrap.style.display = 'none';
      }
    },

    _updatePeriodInfo(now) {
      const periods = LS.Config.getPeriods();
      const info = LS.Helpers.getCurrentPeriod(periods, now);
      const periodEl = document.getElementById('clock-period');
      const remainEl = document.getElementById('clock-remaining');
      const nextEl = document.getElementById('clock-next');
      const progressEl = document.getElementById('clock-progress-bar');

      if (!periodEl) return;

      if (info.current) {
        periodEl.textContent = info.current.label;
        periodEl.className = 'period-badge period-' + info.current.type;

        if (remainEl) {
          const mins = info.remaining;
          remainEl.textContent = `${mins}분 남음`;
        }

        // 진행률 바
        if (progressEl) {
          const total = info.current.endMin - info.current.startMin;
          const elapsed = total - info.remaining;
          const pct = Math.min(100, (elapsed / total) * 100);
          progressEl.style.width = pct + '%';
        }

        // 다음 교시
        const next = LS.Helpers.getNextPeriod(periods, info.index);
        if (nextEl && next) {
          nextEl.textContent = `다음: ${next.label} (${next.start})`;
          nextEl.style.display = 'block';
        } else if (nextEl) {
          nextEl.style.display = 'none';
        }
      } else if (info.status === 'before') {
        periodEl.textContent = '일과 시작 전';
        periodEl.className = 'period-badge period-before';
        if (remainEl) remainEl.textContent = `${info.next?.start || ''} 시작`;
        if (progressEl) progressEl.style.width = '0%';
        if (nextEl) { nextEl.textContent = `첫 일정: ${info.next?.label || ''}`; nextEl.style.display = 'block'; }
      } else {
        periodEl.textContent = '일과 종료';
        periodEl.className = 'period-badge period-after';
        if (remainEl) remainEl.textContent = '수고하셨습니다!';
        if (progressEl) progressEl.style.width = '100%';
        if (nextEl) nextEl.style.display = 'none';
      }
    },

    _drawAnalogClock(now) {
      const canvas = document.getElementById('clock-analog');
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      const size = canvas.width;
      const center = size / 2;
      const radius = center - 8;

      ctx.clearRect(0, 0, size, size);

      // 배경
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fill();
      ctx.strokeStyle = 'var(--theme-primary)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 눈금
      for (let i = 0; i < 12; i++) {
        const angle = (i * 30 - 90) * Math.PI / 180;
        const isMain = i % 3 === 0;
        const innerR = radius - (isMain ? 12 : 7);
        ctx.beginPath();
        ctx.moveTo(center + innerR * Math.cos(angle), center + innerR * Math.sin(angle));
        ctx.lineTo(center + (radius - 3) * Math.cos(angle), center + (radius - 3) * Math.sin(angle));
        ctx.strokeStyle = isMain ? 'var(--theme-accent)' : 'rgba(100,100,100,0.5)';
        ctx.lineWidth = isMain ? 2.5 : 1;
        ctx.stroke();
      }

      const h = now.getHours() % 12;
      const m = now.getMinutes();
      const s = now.getSeconds();

      // 시침
      this._drawHand(ctx, center, (h + m / 60) * 30 - 90, radius * 0.5, 3.5, 'var(--theme-accent)');
      // 분침
      this._drawHand(ctx, center, (m + s / 60) * 6 - 90, radius * 0.7, 2.5, 'var(--theme-primary)');
      // 초침
      if (LS.Config.get('showSeconds')) {
        this._drawHand(ctx, center, s * 6 - 90, radius * 0.8, 1, '#FF6B6B');
      }

      // 중심점
      ctx.beginPath();
      ctx.arc(center, center, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'var(--theme-accent)';
      ctx.fill();
    },

    _drawHand(ctx, center, angleDeg, length, width, color) {
      const angle = angleDeg * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(center + length * Math.cos(angle), center + length * Math.sin(angle));
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.stroke();
    },

    destroy() {
      if (this._interval) clearInterval(this._interval);
    }
  };
})();
