(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};
  const BASE_URL = 'https://open.neis.go.kr/hub';

  function toCompactDate(value) {
    return LS.Helpers.formatDate(new Date(value), 'YYYYMMDD');
  }

  LS.NeisAPI = {
    apiKey: '',

    setApiKey(key) {
      this.apiKey = String(key || '').trim();
    },

    hasDirectKey() {
      return Boolean(this.apiKey);
    },

    async _fetchDirect(endpoint, params) {
      if (!this.apiKey) {
        throw new Error('NEIS direct key is not configured.');
      }

      const url = new URL(`${BASE_URL}/${endpoint}`);
      url.searchParams.set('KEY', this.apiKey);
      url.searchParams.set('Type', 'json');
      url.searchParams.set('pIndex', '1');
      url.searchParams.set('pSize', '100');

      Object.entries(params || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        url.searchParams.set(key, String(value));
      });

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    },

    async searchSchool(schoolName) {
      if (!String(schoolName || '').trim()) return [];

      if (!this.hasDirectKey()) {
        const payload = await LS.DataService.fetchJson('neis/school-search', {
          name: schoolName
        });
        return Array.isArray(payload?.schools) ? payload.schools : [];
      }

      const data = await this._fetchDirect('schoolInfo', {
        SCHUL_NM: schoolName
      });

      if (!data || !data.schoolInfo) return [];

      const rows = data.schoolInfo[1]?.row || [];
      return rows.map((row) => ({
        name: row.SCHUL_NM,
        atptCode: row.ATPT_OFCDC_SC_CODE,
        schoolCode: row.SD_SCHUL_CODE,
        address: row.ORG_RDNMA || row.ORG_RDNDA || '',
        schoolType: row.SCHUL_KND_SC_NM || '',
        region: row.ATPT_OFCDC_SC_NM || ''
      }));
    },

    async getMeals(atptCode, schoolCode, date) {
      const rows = await this.getWeekMeals(atptCode, schoolCode, new Date(date));
      const targetDate = String(date || '').replace(/-/g, '');
      return rows.filter((item) => item.date === targetDate);
    },

    async getWeekMeals(atptCode, schoolCode, startDate) {
      const start = new Date(startDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 4);
      const startStr = toCompactDate(start);
      const endStr = toCompactDate(end);

      if (!this.hasDirectKey()) {
        const payload = await LS.DataService.fetchJson('neis/meals/week', {
          atptCode,
          schoolCode,
          startDate: startStr
        });
        return Array.isArray(payload?.meals) ? payload.meals : [];
      }

      const data = await this._fetchDirect('mealServiceDietInfo', {
        ATPT_OFCDC_SC_CODE: atptCode,
        SD_SCHUL_CODE: schoolCode,
        MLSV_FROM_YMD: startStr,
        MLSV_TO_YMD: endStr
      });

      if (!data || !data.mealServiceDietInfo) return [];

      const rows = data.mealServiceDietInfo[1]?.row || [];
      return rows.map((row) => ({
        date: row.MLSV_YMD,
        mealType: row.MMEAL_SC_NM,
        menu: row.DDISH_NM,
        calorie: row.CAL_INFO,
        origin: row.ORPLC_INFO || '',
        nutrient: row.NTR_INFO || ''
      }));
    },

    async getSchedule(atptCode, schoolCode, year, month) {
      if (!this.hasDirectKey()) {
        const payload = await LS.DataService.fetchJson('neis/schedule/month', {
          atptCode,
          schoolCode,
          year,
          month
        });
        return Array.isArray(payload?.schedule) ? payload.schedule : [];
      }

      const from = `${year}${String(month).padStart(2, '0')}01`;
      const lastDay = new Date(year, month, 0).getDate();
      const to = `${year}${String(month).padStart(2, '0')}${String(lastDay).padStart(2, '0')}`;

      const data = await this._fetchDirect('SchoolSchedule', {
        ATPT_OFCDC_SC_CODE: atptCode,
        SD_SCHUL_CODE: schoolCode,
        AA_FROM_YMD: from,
        AA_TO_YMD: to
      });

      if (!data || !data.SchoolSchedule) return [];

      const rows = data.SchoolSchedule[1]?.row || [];
      return rows.map((row) => ({
        date: row.AA_YMD,
        eventName: row.EVENT_NM,
        eventContent: row.EVENT_CNTNT || '',
        isOneDayYn: row.ONE_GRADE_EVENT_YN || ''
      }));
    },

    async getTimetable(atptCode, schoolCode, grade, classNum, date) {
      const monday = this.getMonday(new Date(date));
      const weekData = await this.getWeekTimetable(atptCode, schoolCode, grade, classNum, monday);
      const key = String(date || '').replace(/-/g, '');
      return Array.isArray(weekData?.[key]) ? weekData[key] : [];
    },

    async getWeekTimetable(atptCode, schoolCode, grade, classNum, mondayDate) {
      const monday = new Date(mondayDate);
      const friday = new Date(monday);
      friday.setDate(friday.getDate() + 4);
      const startStr = toCompactDate(monday);
      const endStr = toCompactDate(friday);

      if (!this.hasDirectKey()) {
        const payload = await LS.DataService.fetchJson('neis/timetable/week', {
          atptCode,
          schoolCode,
          grade,
          classNum,
          startDate: startStr
        });
        return payload?.timetable && typeof payload.timetable === 'object'
          ? payload.timetable
          : {};
      }

      const data = await this._fetchDirect('hisTimetable', {
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

      rows.forEach((row) => {
        const dateKey = row.ALL_TI_YMD;
        if (!byDay[dateKey]) byDay[dateKey] = [];
        byDay[dateKey].push({
          period: parseInt(row.PERIO, 10),
          subject: row.ITRT_CNTNT
        });
      });

      Object.keys(byDay).forEach((dateKey) => {
        byDay[dateKey].sort((a, b) => a.period - b.period);
      });

      return byDay;
    },

    getMonday(date) {
      const current = new Date(date);
      const day = current.getDay();
      const diff = current.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(current.setDate(diff));
    }
  };
})();
