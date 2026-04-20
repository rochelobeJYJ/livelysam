(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};
  const BASE_URL = 'https://open.neis.go.kr/hub';

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function text(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const normalized = String(value).trim();
    return normalized || fallback;
  }

  function normalizeDate(value, fallback = new Date()) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : new Date(fallback);
  }

  function toCompactDate(value) {
    return LS.Helpers.formatDate(normalizeDate(value), 'YYYYMMDD');
  }

  function getSectionRows(payload, sectionName) {
    const section = isObject(payload) ? payload[sectionName] : null;
    if (!Array.isArray(section)) return [];
    const rows = Array.isArray(section[1]?.row) ? section[1].row : [];
    return rows.filter((row) => isObject(row));
  }

  function normalizeSchool(row) {
    return {
      name: text(row.SCHUL_NM || row.name),
      atptCode: text(row.ATPT_OFCDC_SC_CODE || row.atptCode),
      schoolCode: text(row.SD_SCHUL_CODE || row.schoolCode),
      address: text(row.ORG_RDNMA || row.ORG_RDNDA || row.address),
      schoolType: text(row.SCHUL_KND_SC_NM || row.schoolType),
      region: text(row.ATPT_OFCDC_SC_NM || row.region)
    };
  }

  function normalizeMeal(row) {
    return {
      date: text(row.MLSV_YMD || row.date),
      mealType: text(row.MMEAL_SC_NM || row.mealType),
      menu: text(row.DDISH_NM || row.menu),
      calorie: text(row.CAL_INFO || row.calorie),
      origin: text(row.ORPLC_INFO || row.origin),
      nutrient: text(row.NTR_INFO || row.nutrient)
    };
  }

  function normalizeSchedule(row) {
    return {
      date: text(row.AA_YMD || row.date),
      eventName: text(row.EVENT_NM || row.eventName),
      eventContent: text(row.EVENT_CNTNT || row.eventContent),
      isOneDayYn: text(row.ONE_GRADE_EVENT_YN || row.isOneDayYn)
    };
  }

  function normalizeTimetableEntry(row) {
    const period = parseInt(row.PERIO ?? row.period, 10);
    return {
      period: Number.isFinite(period) ? period : 0,
      subject: text(row.ITRT_CNTNT || row.subject)
    };
  }

  function normalizeTimetableMap(raw) {
    if (!isObject(raw)) return {};
    return Object.entries(raw).reduce((acc, [dateKey, entries]) => {
      const normalizedEntries = (Array.isArray(entries) ? entries : [])
        .filter((entry) => isObject(entry))
        .map((entry) => normalizeTimetableEntry(entry))
        .filter((entry) => entry.period > 0 && entry.subject);
      if (normalizedEntries.length) {
        normalizedEntries.sort((a, b) => a.period - b.period);
        acc[String(dateKey)] = normalizedEntries;
      }
      return acc;
    }, {});
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
      const payload = await response.json().catch(() => null);
      if (!isObject(payload)) {
        throw new Error('Invalid NEIS response');
      }
      return payload;
    },

    async searchSchool(schoolName) {
      if (!String(schoolName || '').trim()) return [];

      if (!this.hasDirectKey()) {
        const payload = await LS.DataService.fetchJson('neis/school-search', {
          name: schoolName
        });
        return (Array.isArray(payload?.schools) ? payload.schools : [])
          .filter((row) => isObject(row))
          .map((row) => normalizeSchool(row))
          .filter((row) => row.name && row.atptCode && row.schoolCode);
      }

      const data = await this._fetchDirect('schoolInfo', {
        SCHUL_NM: schoolName
      });

      return getSectionRows(data, 'schoolInfo')
        .map((row) => normalizeSchool(row))
        .filter((row) => row.name && row.atptCode && row.schoolCode);
    },

    async getMeals(atptCode, schoolCode, date) {
      const rows = await this.getWeekMeals(atptCode, schoolCode, normalizeDate(date));
      const targetDate = String(date || '').replace(/-/g, '');
      return rows.filter((item) => item.date === targetDate);
    },

    async getWeekMeals(atptCode, schoolCode, startDate) {
      const start = normalizeDate(startDate);
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
        return (Array.isArray(payload?.meals) ? payload.meals : [])
          .filter((row) => isObject(row))
          .map((row) => normalizeMeal(row))
          .filter((row) => row.date);
      }

      const data = await this._fetchDirect('mealServiceDietInfo', {
        ATPT_OFCDC_SC_CODE: atptCode,
        SD_SCHUL_CODE: schoolCode,
        MLSV_FROM_YMD: startStr,
        MLSV_TO_YMD: endStr
      });

      return getSectionRows(data, 'mealServiceDietInfo')
        .map((row) => normalizeMeal(row))
        .filter((row) => row.date);
    },

    async getSchedule(atptCode, schoolCode, year, month) {
      if (!this.hasDirectKey()) {
        const payload = await LS.DataService.fetchJson('neis/schedule/month', {
          atptCode,
          schoolCode,
          year,
          month
        });
        return (Array.isArray(payload?.schedule) ? payload.schedule : [])
          .filter((row) => isObject(row))
          .map((row) => normalizeSchedule(row))
          .filter((row) => row.date && row.eventName);
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

      return getSectionRows(data, 'SchoolSchedule')
        .map((row) => normalizeSchedule(row))
        .filter((row) => row.date && row.eventName);
    },

    async getTimetable(atptCode, schoolCode, grade, classNum, date) {
      const monday = this.getMonday(normalizeDate(date));
      const weekData = await this.getWeekTimetable(atptCode, schoolCode, grade, classNum, monday);
      const key = String(date || '').replace(/-/g, '');
      return Array.isArray(weekData?.[key]) ? weekData[key] : [];
    },

    async getWeekTimetable(atptCode, schoolCode, grade, classNum, mondayDate) {
      const monday = normalizeDate(mondayDate);
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
        return normalizeTimetableMap(payload?.timetable);
      }

      const data = await this._fetchDirect('hisTimetable', {
        ATPT_OFCDC_SC_CODE: atptCode,
        SD_SCHUL_CODE: schoolCode,
        GRADE: grade,
        CLASS_NM: classNum,
        TI_FROM_YMD: startStr,
        TI_TO_YMD: endStr
      });

      const rows = getSectionRows(data, 'hisTimetable');
      const byDay = {};

      rows.forEach((row) => {
        const dateKey = text(row.ALL_TI_YMD);
        if (!byDay[dateKey]) byDay[dateKey] = [];
        byDay[dateKey].push(normalizeTimetableEntry(row));
      });

      Object.keys(byDay).forEach((dateKey) => {
        byDay[dateKey] = byDay[dateKey]
          .filter((entry) => entry.period > 0 && entry.subject)
          .sort((a, b) => a.period - b.period);
        if (!byDay[dateKey].length) {
          delete byDay[dateKey];
        }
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
