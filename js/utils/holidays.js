(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  /* ── 한국 공휴일 데이터 (2025~2027) ── */
  LS.Holidays = {
    '2025': [
      { date: '2025-01-01', name: '신정' },
      { date: '2025-01-28', name: '설날 연휴' },
      { date: '2025-01-29', name: '설날' },
      { date: '2025-01-30', name: '설날 연휴' },
      { date: '2025-03-01', name: '삼일절' },
      { date: '2025-05-05', name: '어린이날' },
      { date: '2025-05-05', name: '부처님오신날' },
      { date: '2025-05-06', name: '대체공휴일 (어린이날/부처님오신날)' },
      { date: '2025-06-06', name: '현충일' },
      { date: '2025-08-15', name: '광복절' },
      { date: '2025-10-03', name: '개천절' },
      { date: '2025-10-05', name: '추석 연휴' },
      { date: '2025-10-06', name: '추석' },
      { date: '2025-10-07', name: '추석 연휴' },
      { date: '2025-10-08', name: '대체공휴일 (추석)' },
      { date: '2025-10-09', name: '한글날' },
      { date: '2025-12-25', name: '성탄절' }
    ],
    '2026': [
      { date: '2026-01-01', name: '신정' },
      { date: '2026-02-16', name: '설날 연휴' },
      { date: '2026-02-17', name: '설날' },
      { date: '2026-02-18', name: '설날 연휴' },
      { date: '2026-03-01', name: '삼일절' },
      { date: '2026-03-02', name: '대체공휴일 (삼일절)' },
      { date: '2026-05-05', name: '어린이날' },
      { date: '2026-05-24', name: '부처님오신날' },
      { date: '2026-05-25', name: '대체공휴일 (부처님오신날)' },
      { date: '2026-06-06', name: '현충일' },
      { date: '2026-08-15', name: '광복절' },
      { date: '2026-09-24', name: '추석 연휴' },
      { date: '2026-09-25', name: '추석' },
      { date: '2026-09-26', name: '추석 연휴' },
      { date: '2026-10-03', name: '개천절' },
      { date: '2026-10-05', name: '대체공휴일 (개천절)' },
      { date: '2026-10-09', name: '한글날' },
      { date: '2026-12-25', name: '성탄절' }
    ],
    '2027': [
      { date: '2027-01-01', name: '신정' },
      { date: '2027-02-05', name: '설날 연휴' },
      { date: '2027-02-06', name: '설날' },
      { date: '2027-02-07', name: '설날 연휴' },
      { date: '2027-02-08', name: '대체공휴일 (설날)' },
      { date: '2027-03-01', name: '삼일절' },
      { date: '2027-05-05', name: '어린이날' },
      { date: '2027-05-13', name: '부처님오신날' },
      { date: '2027-06-06', name: '현충일' },
      { date: '2027-06-07', name: '대체공휴일 (현충일)' },
      { date: '2027-08-15', name: '광복절' },
      { date: '2027-08-16', name: '대체공휴일 (광복절)' },
      { date: '2027-09-14', name: '추석 연휴' },
      { date: '2027-09-15', name: '추석' },
      { date: '2027-09-16', name: '추석 연휴' },
      { date: '2027-10-03', name: '개천절' },
      { date: '2027-10-04', name: '대체공휴일 (개천절)' },
      { date: '2027-10-09', name: '한글날' },
      { date: '2027-12-25', name: '성탄절' }
    ],

    /* 날짜 문자열(YYYY-MM-DD)로 해당일이 공휴일인지 확인 */
    isHoliday(dateStr) {
      const year = dateStr.slice(0, 4);
      const list = this[year] || [];
      return list.find(h => h.date === dateStr) || null;
    },

    /* 해당 월의 공휴일 목록 */
    getMonthHolidays(year, month) {
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      const list = this[String(year)] || [];
      return list.filter(h => h.date.startsWith(prefix));
    },

    /* 사용자 커스텀 공휴일 추가 */
    addCustomHoliday(dateStr, name) {
      const year = dateStr.slice(0, 4);
      if (!this[year]) this[year] = [];
      if (!this[year].find(h => h.date === dateStr && h.name === name)) {
        this[year].push({ date: dateStr, name, custom: true });
        this[year].sort((a, b) => a.date.localeCompare(b.date));
      }
    },

    /* 사용자 커스텀 공휴일 삭제 */
    removeCustomHoliday(dateStr, name) {
      const year = dateStr.slice(0, 4);
      if (!this[year]) return;
      this[year] = this[year].filter(h => !(h.date === dateStr && h.name === name && h.custom));
    }
  };
})();
