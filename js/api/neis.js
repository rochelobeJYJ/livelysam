(function () {
  'use strict';
  const LS = window.LivelySam = window.LivelySam || {};

  const BASE_URL = 'https://open.neis.go.kr/hub';

  LS.NeisAPI = {
    apiKey: '',

    setApiKey(key) {
      this.apiKey = key;
    },

    /* ── 공통 API 호출 ── */
    async _fetch(endpoint, params) {
      if (!this.apiKey) {
        console.warn('[NEIS] API 키가 설정되지 않았습니다.');
        return null;
      }

      const url = new URL(`${BASE_URL}/${endpoint}`);
      url.searchParams.set('KEY', this.apiKey);
      url.searchParams.set('Type', 'json');
      url.searchParams.set('pIndex', '1');
      url.searchParams.set('pSize', '100');

      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.set(k, String(v));
        }
      });

      try {
        const res = await fetch(url.toString());
        const data = await res.json();
        return data;
      } catch (e) {
        console.error(`[NEIS] ${endpoint} 호출 실패:`, e);
        return null;
      }
    },

    /* ── 학교 검색 ── */
    async searchSchool(schoolName) {
      const data = await this._fetch('schoolInfo', {
        SCHUL_NM: schoolName
      });

      if (!data || !data.schoolInfo) return [];

      const rows = data.schoolInfo[1]?.row || [];
      return rows.map(r => ({
        name: r.SCHUL_NM,
        atptCode: r.ATPT_OFCDC_SC_CODE,
        schoolCode: r.SD_SCHUL_CODE,
        address: r.ORG_RDNMA || r.ORG_RDNDA || '',
        schoolType: r.SCHUL_KND_SC_NM || '',
        region: r.ATPT_OFCDC_SC_NM || ''
      }));
    },

    /* ── 급식 정보 ── */
    async getMeals(atptCode, schoolCode, date) {
      // date: YYYYMMDD
      const data = await this._fetch('mealServiceDietInfo', {
        ATPT_OFCDC_SC_CODE: atptCode,
        SD_SCHUL_CODE: schoolCode,
        MLSV_YMD: date
      });

      if (!data || !data.mealServiceDietInfo) return [];

      const rows = data.mealServiceDietInfo[1]?.row || [];
      return rows.map(r => ({
        date: r.MLSV_YMD,
        mealType: r.MMEAL_SC_NM, // 조식, 중식, 석식
        menu: r.DDISH_NM,
        calorie: r.CAL_INFO,
        origin: r.ORPLC_INFO || '',
        nutrient: r.NTR_INFO || ''
      }));
    },

    /* ── 주간 급식 (월~금) ── */
    async getWeekMeals(atptCode, schoolCode, startDate) {
      // startDate: Date 객체 (해당 주 월요일)
      const start = new Date(startDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 4); // 금요일

      const startStr = LS.Helpers.formatDate(start, 'YYYYMMDD');
      const endStr = LS.Helpers.formatDate(end, 'YYYYMMDD');

      const data = await this._fetch('mealServiceDietInfo', {
        ATPT_OFCDC_SC_CODE: atptCode,
        SD_SCHUL_CODE: schoolCode,
        MLSV_FROM_YMD: startStr,
        MLSV_TO_YMD: endStr
      });

      if (!data || !data.mealServiceDietInfo) return [];

      const rows = data.mealServiceDietInfo[1]?.row || [];
      return rows.map(r => ({
        date: r.MLSV_YMD,
        mealType: r.MMEAL_SC_NM,
        menu: r.DDISH_NM,
        calorie: r.CAL_INFO,
        origin: r.ORPLC_INFO || ''
      }));
    },

    /* ── 학사일정 ── */
    async getSchedule(atptCode, schoolCode, year, month) {
      const from = `${year}${String(month).padStart(2, '0')}01`;
      const lastDay = new Date(year, month, 0).getDate();
      const to = `${year}${String(month).padStart(2, '0')}${String(lastDay).padStart(2, '0')}`;

      const data = await this._fetch('SchoolSchedule', {
        ATPT_OFCDC_SC_CODE: atptCode,
        SD_SCHUL_CODE: schoolCode,
        AA_FROM_YMD: from,
        AA_TO_YMD: to
      });

      if (!data || !data.SchoolSchedule) return [];

      const rows = data.SchoolSchedule[1]?.row || [];
      return rows.map(r => ({
        date: r.AA_YMD,
        eventName: r.EVENT_NM,
        eventContent: r.EVENT_CNTNT || '',
        isOneDayYn: r.ONE_GRADE_EVENT_YN || ''
      }));
    },

    /* ── 시간표 (고등학교) ── */
    async getTimetable(atptCode, schoolCode, grade, classNum, date) {
      const data = await this._fetch('hisTimetable', {
        ATPT_OFCDC_SC_CODE: atptCode,
        SD_SCHUL_CODE: schoolCode,
        GRADE: grade,
        CLASS_NM: classNum,
        ALL_TI_YMD: date // YYYYMMDD
      });

      if (!data || !data.hisTimetable) return [];

      const rows = data.hisTimetable[1]?.row || [];
      return rows.map(r => ({
        date: r.ALL_TI_YMD,
        period: parseInt(r.PERIO),
        subject: r.ITRT_CNTNT
      })).sort((a, b) => a.period - b.period);
    },

    /* ── 주간 시간표 ── */
    async getWeekTimetable(atptCode, schoolCode, grade, classNum, mondayDate) {
      const monday = new Date(mondayDate);
      const friday = new Date(monday);
      friday.setDate(friday.getDate() + 4);

      const startStr = LS.Helpers.formatDate(monday, 'YYYYMMDD');
      const endStr = LS.Helpers.formatDate(friday, 'YYYYMMDD');

      const data = await this._fetch('hisTimetable', {
        ATPT_OFCDC_SC_CODE: atptCode,
        SD_SCHUL_CODE: schoolCode,
        GRADE: grade,
        CLASS_NM: classNum,
        TI_FROM_YMD: startStr,
        TI_TO_YMD: endStr
      });

      if (!data || !data.hisTimetable) return {};

      const rows = data.hisTimetable[1]?.row || [];
      const byDay = {};

      rows.forEach(r => {
        const date = r.ALL_TI_YMD;
        if (!byDay[date]) byDay[date] = [];
        byDay[date].push({
          period: parseInt(r.PERIO),
          subject: r.ITRT_CNTNT
        });
      });

      // 각 날짜별 교시순 정렬
      Object.keys(byDay).forEach(d => {
        byDay[d].sort((a, b) => a.period - b.period);
      });

      return byDay;
    },

    /* ── 이번 주 월요일 구하기 ── */
    getMonday(date) {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.setDate(diff));
    }
  };
})();
