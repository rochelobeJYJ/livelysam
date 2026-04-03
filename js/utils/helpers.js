(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  LS.Helpers = {
    /* ── 요일 ── */
    DAY_NAMES: ['일', '월', '화', '수', '목', '금', '토'],
    DAY_NAMES_FULL: ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'],

    /* ── 알레르기 정보 (1~18) ── */
    ALLERGENS: {
      1: { name: '난류', emoji: '🥚' },
      2: { name: '우유', emoji: '🥛' },
      3: { name: '메밀', emoji: '🌾' },
      4: { name: '땅콩', emoji: '🥜' },
      5: { name: '대두', emoji: '🫘' },
      6: { name: '밀', emoji: '🌾' },
      7: { name: '고등어', emoji: '🐟' },
      8: { name: '게', emoji: '🦀' },
      9: { name: '새우', emoji: '🦐' },
      10: { name: '돼지고기', emoji: '🐷' },
      11: { name: '복숭아', emoji: '🍑' },
      12: { name: '토마토', emoji: '🍅' },
      13: { name: '아황산류', emoji: '⚗️' },
      14: { name: '호두', emoji: '🌰' },
      15: { name: '닭고기', emoji: '🐔' },
      16: { name: '쇠고기', emoji: '🐄' },
      17: { name: '오징어', emoji: '🦑' },
      18: { name: '조개류', emoji: '🐚' }
    },

    /* ── 날짜 포맷 ── */
    formatDate(date, format) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const day = this.DAY_NAMES[date.getDay()];
      switch (format) {
        case 'YYYY-MM-DD': return `${y}-${m}-${d}`;
        case 'YYYYMMDD': return `${y}${m}${d}`;
        case 'M월 D일': return `${date.getMonth() + 1}월 ${date.getDate()}일`;
        case 'M월 D일 (요일)': return `${date.getMonth() + 1}월 ${date.getDate()}일 (${day})`;
        case 'YYYY년 M월 D일': return `${y}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
        case 'YYYY년 M월': return `${y}년 ${date.getMonth() + 1}월`;
        default: return `${y}-${m}-${d}`;
      }
    },

    /* ── 시간 포맷 ── */
    formatTime(date, is24h, showSeconds) {
      let h = date.getHours();
      const m = String(date.getMinutes()).padStart(2, '0');
      const s = String(date.getSeconds()).padStart(2, '0');
      if (!is24h) {
        const ampm = h >= 12 ? '오후' : '오전';
        h = h % 12 || 12;
        return showSeconds ? `${ampm} ${h}:${m}:${s}` : `${ampm} ${h}:${m}`;
      }
      return showSeconds ? `${String(h).padStart(2, '0')}:${m}:${s}` : `${String(h).padStart(2, '0')}:${m}`;
    },

    /* ── HH:MM 문자열 → 분 단위 변환 ── */
    timeToMinutes(timeStr) {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    },

    /* ── 분 → HH:MM 변환 ── */
    minutesToTime(minutes) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },

    /* ── 학기 판단 ── */
    getSemester(date) {
      const m = date.getMonth() + 1;
      if (m >= 3 && m <= 7) return '1학기';
      if (m >= 8 && m <= 12) return '2학기';
      return '겨울방학';
    },

    /* ── NEIS 날짜 파싱 (YYYYMMDD → Date) ── */
    parseNeisDate(str) {
      const y = parseInt(str.slice(0, 4));
      const m = parseInt(str.slice(4, 6)) - 1;
      const d = parseInt(str.slice(6, 8));
      return new Date(y, m, d);
    },

    /* ── 급식 메뉴 파싱 (HTML 태그 제거 + 알레르기 분리) ── */
    parseMealMenu(rawMenu) {
      if (!rawMenu) return [];
      const lines = rawMenu.replace(/<br\/>/gi, '\n').split('\n');
      return lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const allergenMatch = trimmed.match(/\(([0-9.]+)\)$/);
        let name = trimmed;
        let allergens = [];
        if (allergenMatch) {
          name = trimmed.replace(allergenMatch[0], '').trim();
          allergens = allergenMatch[1].split('.').map(Number).filter(n => n >= 1 && n <= 18);
        }
        return { name, allergens };
      }).filter(Boolean);
    },

    /* ── 칼로리 파싱 ── */
    parseCalorie(str) {
      if (!str) return '';
      const match = str.match(/([\d.]+)/);
      return match ? `${match[1]} kcal` : str;
    },

    /* ── 교시 시간표 자동 계산 ── */
    calculatePeriods(config) {
      const periods = [];
      let current = this.timeToMinutes(config.startTime || '08:20');
      const morningMin = config.morningMinutes || 10;
      const classMin = config.classMinutes || 50;
      const breakMin = config.breakMinutes || 10;
      const lunchMin = config.lunchMinutes || 60;
      const lunchAfter = (config.lunchAfterPeriod || 1) + 3; // dropdown index: 0=3교시후, 1=4교시후, 2=5교시후
      const totalPeriods = (config.totalPeriods || 1) + 6; // dropdown index: 0=6, 1=7
      const afterSchoolEnabled = config.afterSchoolEnabled || false;
      const afterSchoolMin = config.afterSchoolMinutes || 70;
      const afterSchoolDaysStr = config.afterSchoolDays || '1,3,5';
      const afterSchoolDays = afterSchoolDaysStr.split(',').map(s => parseInt(s.trim())).filter(n => n >= 1 && n <= 5);

      // 조례
      periods.push({
        type: 'morning',
        label: '조례',
        start: this.minutesToTime(current),
        end: this.minutesToTime(current + morningMin),
        startMin: current,
        endMin: current + morningMin
      });
      current += morningMin;

      // 정규 교시
      for (let i = 1; i <= totalPeriods; i++) {
        periods.push({
          type: 'class',
          label: `${i}교시`,
          period: i,
          start: this.minutesToTime(current),
          end: this.minutesToTime(current + classMin),
          startMin: current,
          endMin: current + classMin
        });
        current += classMin;

        // 점심
        if (i === lunchAfter) {
          periods.push({
            type: 'lunch',
            label: '점심시간',
            start: this.minutesToTime(current),
            end: this.minutesToTime(current + lunchMin),
            startMin: current,
            endMin: current + lunchMin
          });
          current += lunchMin;
        } else if (i < totalPeriods) {
          // 쉬는시간
          periods.push({
            type: 'break',
            label: '쉬는시간',
            start: this.minutesToTime(current),
            end: this.minutesToTime(current + breakMin),
            startMin: current,
            endMin: current + breakMin
          });
          current += breakMin;
        }
      }

      // 방과후 교시
      if (afterSchoolEnabled) {
        current += breakMin; // 쉬는시간 후 방과후
        periods.push({
          type: 'afterSchool',
          label: `${totalPeriods + 1}교시 (방과후)`,
          period: totalPeriods + 1,
          start: this.minutesToTime(current),
          end: this.minutesToTime(current + afterSchoolMin),
          startMin: current,
          endMin: current + afterSchoolMin,
          days: afterSchoolDays
        });
      }

      return periods;
    },

    /* ── 현재 교시 판단 ── */
    getCurrentPeriod(periods, now) {
      if (!now) now = new Date();
      const currentMin = now.getHours() * 60 + now.getMinutes();
      const dayOfWeek = now.getDay(); // 0=일, 1=월, ..., 6=토

      for (let i = 0; i < periods.length; i++) {
        const p = periods[i];
        // 방과후는 해당 요일만 체크
        if (p.type === 'afterSchool' && p.days && !p.days.includes(dayOfWeek)) {
          continue;
        }
        if (currentMin >= p.startMin && currentMin < p.endMin) {
          return { current: p, index: i, remaining: p.endMin - currentMin };
        }
      }

      // 일과 시작 전
      if (periods.length > 0 && currentMin < periods[0].startMin) {
        return { current: null, index: -1, next: periods[0], status: 'before' };
      }
      // 일과 종료 후
      return { current: null, index: -1, status: 'after' };
    },

    /* ── 다음 교시 찾기 ── */
    getNextPeriod(periods, currentIndex) {
      for (let i = currentIndex + 1; i < periods.length; i++) {
        if (periods[i].type === 'class' || periods[i].type === 'afterSchool') {
          return periods[i];
        }
      }
      return null;
    },

    /* ── 미세먼지 등급 ── */
    getAirQualityLevel(pm25) {
      if (pm25 <= 15) return { level: '좋음', color: '#2196F3', bg: '#E3F2FD' };
      if (pm25 <= 35) return { level: '보통', color: '#4CAF50', bg: '#E8F5E9' };
      if (pm25 <= 75) return { level: '나쁨', color: '#FF9800', bg: '#FFF3E0' };
      return { level: '매우나쁨', color: '#F44336', bg: '#FFEBEE' };
    },

    getAirQualityLevelPM10(pm10) {
      if (pm10 <= 30) return { level: '좋음', color: '#2196F3', bg: '#E3F2FD' };
      if (pm10 <= 80) return { level: '보통', color: '#4CAF50', bg: '#E8F5E9' };
      if (pm10 <= 150) return { level: '나쁨', color: '#FF9800', bg: '#FFF3E0' };
      return { level: '매우나쁨', color: '#F44336', bg: '#FFEBEE' };
    },

    /* ── 날씨 아이콘 맵핑 ── */
    getWeatherEmoji(iconCode) {
      const map = {
        '01d': '☀️', '01n': '🌙',
        '02d': '⛅', '02n': '☁️',
        '03d': '☁️', '03n': '☁️',
        '04d': '☁️', '04n': '☁️',
        '09d': '🌧️', '09n': '🌧️',
        '10d': '🌦️', '10n': '🌧️',
        '11d': '⛈️', '11n': '⛈️',
        '13d': '🌨️', '13n': '🌨️',
        '50d': '🌫️', '50n': '🌫️'
      };
      return map[iconCode] || '🌡️';
    },

    /* ── 디바운스 ── */
    debounce(fn, delay) {
      let timer;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    },

    /* ── HTML 이스케이프 ── */
    escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    /* ── 고유 ID 생성 ── */
    generateId() {
      return 'ls_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    },

    /* ── 공통 입력 모달 (Promise) ── */
    promptModal(title, fields) {
      return new Promise((resolve) => {
        const overlay = document.getElementById('prompt-modal');
        const titleEl = document.getElementById('prompt-modal-title');
        const bodyEl = document.getElementById('prompt-modal-body');
        const btnConfirm = document.getElementById('prompt-modal-confirm');
        const btnCancel = document.getElementById('prompt-modal-cancel');

        if (!overlay || !bodyEl) { resolve(null); return; }

        titleEl.textContent = title;
        bodyEl.innerHTML = '';
        
        const inputs = {};

        fields.forEach(f => {
          const row = document.createElement('div');
          row.className = 'prompt-input-row';
          
          if (f.label) {
            const label = document.createElement('label');
            label.className = 'prompt-label';
            label.textContent = f.label;
            row.appendChild(label);
          }

          let el;
          if (f.type === 'textarea') {
            el = document.createElement('textarea');
            if (f.value) el.value = f.value;
          } else if (f.type === 'select') {
            el = document.createElement('select');
            f.options.forEach(opt => {
              const o = document.createElement('option');
              o.value = opt.value; o.textContent = opt.text;
              if (String(f.value) === String(opt.value)) o.selected = true;
              el.appendChild(o);
            });
          } else {
            el = document.createElement('input');
            el.type = f.type || 'text';
            if (f.value) el.value = f.value;
            if (f.placeholder) el.placeholder = f.placeholder;
          }
          el.className = 'prompt-input';
          el.id = 'prompt-input-' + f.id;
          row.appendChild(el);
          bodyEl.appendChild(row);
          inputs[f.id] = el;
        });

        const closeAll = () => {
          overlay.classList.remove('active');
          btnConfirm.onclick = null;
          btnCancel.onclick = null;
        };

        btnCancel.onclick = () => { closeAll(); resolve(null); };
        btnConfirm.onclick = () => {
          const result = {};
          fields.forEach(f => { result[f.id] = inputs[f.id].value; });
          closeAll();
          resolve(result);
        };

        overlay.classList.add('active');
        if (fields.length > 0) {
          inputs[fields[0].id].focus();
        }
      });
    }
  };
})();
