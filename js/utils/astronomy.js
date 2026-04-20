(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};

  const DAY_MS = 86400000;
  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;
  const SEOUL_LAT = 37.5665;
  const SEOUL_LON = 126.9780;
  const SYNODIC_MONTH_DAYS = 29.530588853;
  const REFERENCE_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14, 0);
  const SOLAR_TERM_YEAR_FACTOR = 0.2422;
  const METEOR_INFO_URL = 'https://science.nasa.gov/solar-system/meteors-meteorites/facts/';
  const ECLIPSE_INFO_URL = 'https://science.nasa.gov/eclipses/future-eclipses/';
  const PLANETARY_SKYWATCHING_URL = 'https://science.nasa.gov/solar-system/skywatching/';

  const PHASES = [
    { key: 'new-moon', name: '삭', description: '달이 새 주기를 시작하는 시점입니다.', offsetDays: 0 },
    { key: 'first-quarter', name: '상현', description: '달이 차오르며 반달이 되는 시점입니다.', offsetDays: SYNODIC_MONTH_DAYS / 4 },
    { key: 'full-moon', name: '보름', description: '달이 가장 밝게 차오르는 시점입니다.', offsetDays: SYNODIC_MONTH_DAYS / 2 },
    { key: 'last-quarter', name: '하현', description: '달이 기울며 반달이 되는 시점입니다.', offsetDays: (SYNODIC_MONTH_DAYS * 3) / 4 }
  ];

  const SOLAR_TERMS = [
    { key: 'minor-cold', name: '소한', month: 1, longitude: 285, c20: 6.11, c21: 5.4055 },
    { key: 'major-cold', name: '대한', month: 1, longitude: 300, c20: 20.84, c21: 20.12 },
    { key: 'start-of-spring', name: '입춘', month: 2, longitude: 315, c20: 4.6295, c21: 3.87 },
    { key: 'rain-water', name: '우수', month: 2, longitude: 330, c20: 19.4599, c21: 18.73 },
    { key: 'awakening-of-insects', name: '경칩', month: 3, longitude: 345, c20: 6.3826, c21: 5.63 },
    { key: 'vernal-equinox', name: '춘분', month: 3, longitude: 0, c20: 21.4155, c21: 20.646 },
    { key: 'clear-and-bright', name: '청명', month: 4, longitude: 15, c20: 5.59, c21: 4.81 },
    { key: 'grain-rain', name: '곡우', month: 4, longitude: 30, c20: 20.888, c21: 20.1 },
    { key: 'start-of-summer', name: '입하', month: 5, longitude: 45, c20: 6.318, c21: 5.52 },
    { key: 'grain-full', name: '소만', month: 5, longitude: 60, c20: 21.86, c21: 21.04 },
    { key: 'grain-in-ear', name: '망종', month: 6, longitude: 75, c20: 6.5, c21: 5.678 },
    { key: 'summer-solstice', name: '하지', month: 6, longitude: 90, c20: 22.2, c21: 21.37 },
    { key: 'minor-heat', name: '소서', month: 7, longitude: 105, c20: 7.928, c21: 7.108 },
    { key: 'major-heat', name: '대서', month: 7, longitude: 120, c20: 23.65, c21: 22.83 },
    { key: 'start-of-autumn', name: '입추', month: 8, longitude: 135, c20: 8.35, c21: 7.5 },
    { key: 'limit-of-heat', name: '처서', month: 8, longitude: 150, c20: 23.95, c21: 23.13 },
    { key: 'white-dew', name: '백로', month: 9, longitude: 165, c20: 8.44, c21: 7.646 },
    { key: 'autumnal-equinox', name: '추분', month: 9, longitude: 180, c20: 23.822, c21: 23.042 },
    { key: 'cold-dew', name: '한로', month: 10, longitude: 195, c20: 9.098, c21: 8.318 },
    { key: 'frost-descent', name: '상강', month: 10, longitude: 210, c20: 24.218, c21: 23.438 },
    { key: 'start-of-winter', name: '입동', month: 11, longitude: 225, c20: 8.218, c21: 7.438 },
    { key: 'minor-snow', name: '소설', month: 11, longitude: 240, c20: 23.08, c21: 22.36 },
    { key: 'major-snow', name: '대설', month: 12, longitude: 255, c20: 7.9, c21: 7.18 },
    { key: 'winter-solstice', name: '동지', month: 12, longitude: 270, c20: 22.6, c21: 21.94 }
  ];

  const METEOR_SHOWERS = [
    { key: 'quadrantids', month: 1, startDay: 3, endDay: 4, shortName: '사분의', fullName: '사분의자리 유성우', rate: 120, parentBody: '(196256) 2003 EH1', koreaVisible: true },
    { key: 'lyrids', month: 4, startDay: 21, endDay: 22, shortName: '리리드', fullName: '리리드 유성우', rate: 18, parentBody: 'Comet C/1861 G1', koreaVisible: true },
    { key: 'eta-aquariids', month: 5, startDay: 3, endDay: 4, shortName: '에타물병', fullName: '에타 물병자리 유성우', rate: 50, parentBody: 'Comet 1P/Halley', koreaVisible: true },
    { key: 'southern-delta-aquariids', month: 7, startDay: 29, endDay: 30, shortName: '델타물병', fullName: '남쪽 델타 물병자리 유성우', rate: 25, parentBody: 'Comet 96P/Machholz', koreaVisible: true },
    { key: 'perseids', month: 8, startDay: 12, endDay: 13, shortName: '페르세우스', fullName: '페르세우스 유성우', rate: 100, parentBody: 'Comet 109P/Swift-Tuttle', koreaVisible: true },
    { key: 'orionids', month: 10, startDay: 22, endDay: 23, shortName: '오리온', fullName: '오리온 유성우', rate: 20, parentBody: 'Comet 1P/Halley', koreaVisible: true },
    { key: 'leonids', month: 11, startDay: 16, endDay: 17, shortName: '사자자리', fullName: '사자자리 유성우', rate: 15, parentBody: 'Comet 55P/Tempel-Tuttle', koreaVisible: true },
    { key: 'geminids', month: 12, startDay: 12, endDay: 13, shortName: '쌍둥이', fullName: '쌍둥이자리 유성우', rate: 150, parentBody: '(3200) Phaethon', koreaVisible: true }
  ];

  const ECLIPSES = [
    { key: '2026-total-lunar', startDate: '2026-03-03', endDate: '2026-03-03', name: '개기월식', description: '달이 지구 본그림자에 완전히 들어가는 월식입니다.', visibility: '동아시아, 호주, 태평양, 아메리카', koreaVisible: true },
    { key: '2026-partial-lunar', startDate: '2026-08-27', endDate: '2026-08-28', name: '부분월식', description: '달의 일부만 지구 본그림자에 들어가는 월식입니다.', visibility: '아메리카, 유럽, 아프리카, 서아시아', koreaVisible: false },
    { key: '2026-total-solar', startDate: '2026-08-12', endDate: '2026-08-12', name: '개기일식', description: '달이 태양을 완전히 가리는 일식입니다. 태양 관측 시에는 전용 필터가 필요합니다.', visibility: '그린란드, 아이슬란드, 스페인, 러시아, 포르투갈 일부', koreaVisible: false },
    { key: '2027-annular-solar', startDate: '2027-02-06', endDate: '2027-02-06', name: '금환일식', description: '달이 태양 중심을 가리지만 가장자리가 고리처럼 남는 일식입니다. 태양 관측 시에는 전용 필터가 필요합니다.', visibility: '칠레, 아르헨티나, 우루과이, 브라질, 코트디부아르, 가나, 토고, 베냉, 나이지리아', koreaVisible: false },
    { key: '2027-penumbral-lunar', startDate: '2027-02-20', endDate: '2027-02-21', name: '반영월식', description: '달이 지구 반그림자만 스쳐 지나가 비교적 은은하게 보이는 월식입니다.', visibility: '아메리카, 유럽, 아프리카, 아시아, 호주, 남극', koreaVisible: true },
    { key: '2027-total-solar', startDate: '2027-08-02', endDate: '2027-08-02', name: '개기일식', description: '달이 태양을 완전히 가리는 일식입니다. 태양 관측 시에는 전용 필터가 필요합니다.', visibility: '스페인 남부, 북아프리카, 사우디아라비아, 예멘', koreaVisible: false }
  ];

  const PLANET_ORBITS = {
    mercury: { nodeBase: 48.3313, nodeRate: 3.24587e-5, inclinationBase: 7.0047, inclinationRate: 5.0e-8, perihelionBase: 29.1241, perihelionRate: 1.01444e-5, semiMajorAxisBase: 0.387098, semiMajorAxisRate: 0, eccentricityBase: 0.205635, eccentricityRate: 5.59e-10, anomalyBase: 168.6562, anomalyRate: 4.0923344368 },
    venus: { nodeBase: 76.6799, nodeRate: 2.4659e-5, inclinationBase: 3.3946, inclinationRate: 2.75e-8, perihelionBase: 54.891, perihelionRate: 1.38374e-5, semiMajorAxisBase: 0.72333, semiMajorAxisRate: 0, eccentricityBase: 0.006773, eccentricityRate: -1.302e-9, anomalyBase: 48.0052, anomalyRate: 1.6021302244 },
    earth: { nodeBase: 0, nodeRate: 0, inclinationBase: 0, inclinationRate: 0, perihelionBase: 282.9404, perihelionRate: 4.70935e-5, semiMajorAxisBase: 1, semiMajorAxisRate: 0, eccentricityBase: 0.016709, eccentricityRate: -1.151e-9, anomalyBase: 356.047, anomalyRate: 0.9856002585 },
    mars: { nodeBase: 49.5574, nodeRate: 2.11081e-5, inclinationBase: 1.8497, inclinationRate: -1.78e-8, perihelionBase: 286.5016, perihelionRate: 2.92961e-5, semiMajorAxisBase: 1.523688, semiMajorAxisRate: 0, eccentricityBase: 0.093405, eccentricityRate: 2.516e-9, anomalyBase: 18.6021, anomalyRate: 0.5240207766 },
    jupiter: { nodeBase: 100.4542, nodeRate: 2.76854e-5, inclinationBase: 1.303, inclinationRate: -1.557e-7, perihelionBase: 273.8777, perihelionRate: 1.64505e-5, semiMajorAxisBase: 5.20256, semiMajorAxisRate: 0, eccentricityBase: 0.048498, eccentricityRate: 4.469e-9, anomalyBase: 19.895, anomalyRate: 0.0830853001 },
    saturn: { nodeBase: 113.6634, nodeRate: 2.3898e-5, inclinationBase: 2.4886, inclinationRate: -1.081e-7, perihelionBase: 339.3939, perihelionRate: 2.97661e-5, semiMajorAxisBase: 9.55475, semiMajorAxisRate: 0, eccentricityBase: 0.055546, eccentricityRate: -9.499e-9, anomalyBase: 316.967, anomalyRate: 0.0334442282 }
  };

  const PLANETS = [
    { key: 'mercury', label: '수성', inner: true },
    { key: 'venus', label: '금성', inner: true },
    { key: 'mars', label: '화성', inner: false },
    { key: 'jupiter', label: '목성', inner: false },
    { key: 'saturn', label: '토성', inner: false }
  ];

  function cloneDate(dateLike) {
    const date = new Date(dateLike);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function toDateString(dateLike) {
    return LS.Helpers.formatDate(cloneDate(dateLike), 'YYYY-MM-DD');
  }

  function parseDateString(dateText) {
    const [year, month, day] = String(dateText).split('-').map((value) => parseInt(value, 10));
    return new Date(year || 0, (month || 1) - 1, day || 1);
  }

  function addDays(dateLike, days) {
    const date = cloneDate(dateLike);
    date.setDate(date.getDate() + days);
    return date;
  }

  function formatLocalTime(dateLike) {
    const date = new Date(dateLike);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function getDateRangeStrings(startDateText, endDateText) {
    const dates = [];
    let cursor = parseDateString(startDateText);
    const end = parseDateString(endDateText || startDateText);
    while (cursor <= end) {
      dates.push(toDateString(cursor));
      cursor = addDays(cursor, 1);
    }
    return dates;
  }

  function normalizeAngle(angle) {
    const normalized = angle % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  }

  function getAngleDelta(angle, target) {
    return ((normalizeAngle(angle) - normalizeAngle(target) + 540) % 360) - 180;
  }

  function getJulianDay(dateLike) {
    return (new Date(dateLike).getTime() / DAY_MS) + 2440587.5;
  }

  function getOrbitalDays(dateLike) {
    return getJulianDay(dateLike) - 2451543.5;
  }

  function getObliquity(dateLike) {
    return 23.4393 - (3.563e-7 * getOrbitalDays(dateLike));
  }

  function eclipticToEquatorial(lon, lat, dateLike) {
    const lonRad = lon * RAD;
    const latRad = lat * RAD;
    const epsRad = getObliquity(dateLike) * RAD;
    const x = Math.cos(lonRad) * Math.cos(latRad);
    const y = (Math.sin(lonRad) * Math.cos(latRad) * Math.cos(epsRad)) - (Math.sin(latRad) * Math.sin(epsRad));
    const z = (Math.sin(lonRad) * Math.cos(latRad) * Math.sin(epsRad)) + (Math.sin(latRad) * Math.cos(epsRad));
    return {
      ra: normalizeAngle(Math.atan2(y, x) * DEG),
      dec: Math.atan2(z, Math.sqrt((x * x) + (y * y))) * DEG
    };
  }

  function solveKepler(meanAnomalyDeg, eccentricity) {
    const meanAnomalyRad = meanAnomalyDeg * RAD;
    let eccentricAnomaly = meanAnomalyDeg + (DEG * eccentricity * Math.sin(meanAnomalyRad) * (1 + (eccentricity * Math.cos(meanAnomalyRad))));
    for (let index = 0; index < 6; index += 1) {
      const eccentricAnomalyRad = eccentricAnomaly * RAD;
      const delta = (eccentricAnomaly - (DEG * eccentricity * Math.sin(eccentricAnomalyRad)) - meanAnomalyDeg) / (1 - (eccentricity * Math.cos(eccentricAnomalyRad)));
      eccentricAnomaly -= delta;
      if (Math.abs(delta) < 1e-6) break;
    }
    return eccentricAnomaly;
  }

  function getPlanetHeliocentricState(planetKey, dateLike) {
    const orbit = PLANET_ORBITS[planetKey];
    const days = getOrbitalDays(dateLike);
    const ascendingNode = normalizeAngle(orbit.nodeBase + (orbit.nodeRate * days));
    const inclination = orbit.inclinationBase + (orbit.inclinationRate * days);
    const perihelion = normalizeAngle(orbit.perihelionBase + (orbit.perihelionRate * days));
    const semiMajorAxis = orbit.semiMajorAxisBase + (orbit.semiMajorAxisRate * days);
    const eccentricity = orbit.eccentricityBase + (orbit.eccentricityRate * days);
    const meanAnomaly = normalizeAngle(orbit.anomalyBase + (orbit.anomalyRate * days));
    const eccentricAnomaly = solveKepler(meanAnomaly, eccentricity);
    const eccentricAnomalyRad = eccentricAnomaly * RAD;
    const xv = semiMajorAxis * (Math.cos(eccentricAnomalyRad) - eccentricity);
    const yv = semiMajorAxis * (Math.sqrt(1 - (eccentricity * eccentricity)) * Math.sin(eccentricAnomalyRad));
    const trueAnomaly = Math.atan2(yv, xv) * DEG;
    const radius = Math.sqrt((xv * xv) + (yv * yv));
    const ascendingNodeRad = ascendingNode * RAD;
    const inclinationRad = inclination * RAD;
    const argumentRad = (trueAnomaly + perihelion) * RAD;
    const xh = radius * ((Math.cos(ascendingNodeRad) * Math.cos(argumentRad)) - (Math.sin(ascendingNodeRad) * Math.sin(argumentRad) * Math.cos(inclinationRad)));
    const yh = radius * ((Math.sin(ascendingNodeRad) * Math.cos(argumentRad)) + (Math.cos(ascendingNodeRad) * Math.sin(argumentRad) * Math.cos(inclinationRad)));
    const zh = radius * (Math.sin(argumentRad) * Math.sin(inclinationRad));
    return {
      xh,
      yh,
      zh,
      lon: normalizeAngle(Math.atan2(yh, xh) * DEG)
    };
  }

  function getPlanetState(planetKey, dateLike) {
    const earth = getPlanetHeliocentricState('earth', dateLike);
    const planet = getPlanetHeliocentricState(planetKey, dateLike);
    const xg = planet.xh - earth.xh;
    const yg = planet.yh - earth.yh;
    const zg = planet.zh - earth.zh;
    const lon = normalizeAngle(Math.atan2(yg, xg) * DEG);
    const lat = Math.atan2(zg, Math.sqrt((xg * xg) + (yg * yg))) * DEG;
    const eq = eclipticToEquatorial(lon, lat, dateLike);
    return {
      lon,
      lat,
      ra: eq.ra,
      dec: eq.dec,
      heliocentricLongitude: planet.lon,
      earthHeliocentricLongitude: earth.lon,
      sunLongitude: normalizeAngle(Math.atan2(-earth.yh, -earth.xh) * DEG)
    };
  }

  function getSunState(dateLike) {
    const earth = getPlanetHeliocentricState('earth', dateLike);
    const lon = normalizeAngle(Math.atan2(-earth.yh, -earth.xh) * DEG);
    const eq = eclipticToEquatorial(lon, 0, dateLike);
    return { lon, lat: 0, ra: eq.ra, dec: eq.dec };
  }

  function getMoonState(dateLike) {
    const days = getOrbitalDays(dateLike);
    const node = normalizeAngle(125.1228 - (0.0529538083 * days));
    const inclination = 5.1454;
    const perihelion = normalizeAngle(318.0634 + (0.1643573223 * days));
    const eccentricity = 0.0549;
    const semiMajorAxis = 60.2666;
    const meanAnomaly = normalizeAngle(115.3654 + (13.0649929509 * days));
    const eccentricAnomaly = solveKepler(meanAnomaly, eccentricity);
    const eccentricAnomalyRad = eccentricAnomaly * RAD;
    const xv = semiMajorAxis * (Math.cos(eccentricAnomalyRad) - eccentricity);
    const yv = semiMajorAxis * (Math.sqrt(1 - (eccentricity * eccentricity)) * Math.sin(eccentricAnomalyRad));
    const trueAnomaly = Math.atan2(yv, xv) * DEG;
    const radius = Math.sqrt((xv * xv) + (yv * yv));
    const nodeRad = node * RAD;
    const inclinationRad = inclination * RAD;
    const argumentRad = (trueAnomaly + perihelion) * RAD;
    const xh = radius * ((Math.cos(nodeRad) * Math.cos(argumentRad)) - (Math.sin(nodeRad) * Math.sin(argumentRad) * Math.cos(inclinationRad)));
    const yh = radius * ((Math.sin(nodeRad) * Math.cos(argumentRad)) + (Math.cos(nodeRad) * Math.sin(argumentRad) * Math.cos(inclinationRad)));
    const zh = radius * (Math.sin(argumentRad) * Math.sin(inclinationRad));
    const lon = normalizeAngle(Math.atan2(yh, xh) * DEG);
    const lat = Math.atan2(zh, Math.sqrt((xh * xh) + (yh * yh))) * DEG;
    const eq = eclipticToEquatorial(lon, lat, dateLike);
    return { lon, lat, ra: eq.ra, dec: eq.dec };
  }

  function getBodyState(bodyKey, dateLike) {
    if (bodyKey === 'moon') return getMoonState(dateLike);
    if (bodyKey === 'sun') return getSunState(dateLike);
    return getPlanetState(bodyKey, dateLike);
  }

  function getAngularSeparation(stateA, stateB) {
    const raA = stateA.ra * RAD;
    const decA = stateA.dec * RAD;
    const raB = stateB.ra * RAD;
    const decB = stateB.dec * RAD;
    const cosine = (Math.sin(decA) * Math.sin(decB)) + (Math.cos(decA) * Math.cos(decB) * Math.cos(raA - raB));
    return Math.acos(Math.max(-1, Math.min(1, cosine))) * DEG;
  }

  function getGreenwichSiderealTime(dateLike) {
    const jd = getJulianDay(dateLike);
    const centuries = (jd - 2451545.0) / 36525;
    return normalizeAngle(280.46061837 + (360.98564736629 * (jd - 2451545.0)) + (0.000387933 * centuries * centuries) - ((centuries * centuries * centuries) / 38710000));
  }

  function getAltitude(bodyState, dateLike, lat, lon) {
    const lst = normalizeAngle(getGreenwichSiderealTime(dateLike) + lon);
    const hourAngle = getAngleDelta(lst, bodyState.ra) * RAD;
    const latRad = lat * RAD;
    const decRad = bodyState.dec * RAD;
    return Math.asin((Math.sin(latRad) * Math.sin(decRad)) + (Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourAngle))) * DEG;
  }

  function getVisibilityGradeFromAltitude(maxAltitude) {
    if (maxAltitude >= 20) return 'good';
    if (maxAltitude >= 10) return 'fair';
    return 'poor';
  }

  function sampleVisibility(bodyKeys, centerDate, lat, lon, mode = 'night') {
    const start = new Date(centerDate.getTime() - (6 * 60 * 60 * 1000));
    const end = new Date(centerDate.getTime() + (6 * 60 * 60 * 1000));
    let bestAltitude = -90;

    for (let timeMs = start.getTime(); timeMs <= end.getTime(); timeMs += 30 * 60 * 1000) {
      const date = new Date(timeMs);
      const localHour = date.getHours() + (date.getMinutes() / 60);
      if (mode === 'evening' && (localHour < 17 || localHour > 22.5)) continue;
      if (mode === 'morning' && (localHour < 3 || localHour > 6.5)) continue;
      const sunAltitude = getAltitude(getSunState(date), date, lat, lon);
      if (sunAltitude > -6) continue;
      const altitudes = bodyKeys.map((bodyKey) => getAltitude(getBodyState(bodyKey, date), date, lat, lon));
      bestAltitude = Math.max(bestAltitude, Math.min(...altitudes));
    }

    return {
      bestAltitude,
      grade: getVisibilityGradeFromAltitude(bestAltitude)
    };
  }

  function getSolarLongitude(dateLike) {
    return getSunState(dateLike).lon;
  }

  function getSolarTermEstimateDay(year, term) {
    const yearDigits = year % 100;
    const constant = year >= 2001 ? term.c21 : term.c20;
    const leapCorrection = year >= 2001 ? Math.floor(yearDigits / 4) : Math.floor((yearDigits - 1) / 4);
    return Math.floor((yearDigits * SOLAR_TERM_YEAR_FACTOR) + constant) - leapCorrection;
  }

  function findRootByBisection(startMs, endMs, evaluator) {
    let leftMs = startMs;
    let rightMs = endMs;
    let leftValue = evaluator(leftMs);
    for (let index = 0; index < 36; index += 1) {
      const midMs = Math.floor((leftMs + rightMs) / 2);
      const midValue = evaluator(midMs);
      if ((leftValue <= 0 && midValue >= 0) || (leftValue >= 0 && midValue <= 0)) {
        rightMs = midMs;
      } else {
        leftMs = midMs;
        leftValue = midValue;
      }
    }
    return new Date(Math.floor((leftMs + rightMs) / 2));
  }

  function refineMinimum(startMs, endMs, evaluator) {
    let left = startMs;
    let right = endMs;
    for (let index = 0; index < 32; index += 1) {
      const first = left + ((right - left) / 3);
      const second = right - ((right - left) / 3);
      if (evaluator(first) <= evaluator(second)) {
        right = second;
      } else {
        left = first;
      }
    }
    return new Date(Math.round((left + right) / 2));
  }

  function sortEvents(a, b) {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const timeA = a.startTime ? LS.Helpers.timeToMinutes(a.startTime) : 9999;
    const timeB = b.startTime ? LS.Helpers.timeToMinutes(b.startTime) : 9999;
    if (timeA !== timeB) return timeA - timeB;
    return a.name.localeCompare(b.name, 'ko');
  }

  function pushEvent(events, event) {
    if (!event?.date || !event?.name) return;
    if (!events.find((item) => item.id === event.id)) {
      events.push(event);
    }
  }

  function buildPhaseEvents(start, end) {
    const lunationSpanMs = SYNODIC_MONTH_DAYS * DAY_MS;
    const startMs = start.getTime();
    const endMs = end.getTime();
    const lunationStart = Math.floor((startMs - REFERENCE_NEW_MOON_UTC) / lunationSpanMs) - 2;
    const lunationEnd = Math.ceil((endMs - REFERENCE_NEW_MOON_UTC) / lunationSpanMs) + 2;
    const events = [];

    for (let lunation = lunationStart; lunation <= lunationEnd; lunation += 1) {
      PHASES.forEach((phase) => {
        const eventMs = REFERENCE_NEW_MOON_UTC + ((lunation * SYNODIC_MONTH_DAYS) + phase.offsetDays) * DAY_MS;
        const eventDate = new Date(eventMs);
        if (eventDate < start || eventDate > end) return;
        pushEvent(events, {
          id: `astro-phase-${phase.key}-${toDateString(eventDate)}-${formatLocalTime(eventDate).replace(':', '')}`,
          source: 'astronomy',
          astronomyKind: 'phase',
          date: toDateString(eventDate),
          name: phase.name,
          description: `${phase.description} 자동 생성된 월령 일정입니다.`,
          startTime: formatLocalTime(eventDate),
          endTime: '',
          allDay: false,
          visibilityGrade: 'good',
          koreaVisible: true
        });
      });
    }

    return events;
  }

  function buildSolarTermEvents(start, end) {
    const events = [];
    for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
      SOLAR_TERMS.forEach((term) => {
        const estimatedDay = getSolarTermEstimateDay(year, term);
        let startMs = Date.UTC(year, term.month - 1, estimatedDay - 2, 0, 0, 0, 0);
        let endMs = Date.UTC(year, term.month - 1, estimatedDay + 2, 23, 59, 59, 999);
        let startDelta = getAngleDelta(getSolarLongitude(startMs), term.longitude);
        let endDelta = getAngleDelta(getSolarLongitude(endMs), term.longitude);
        let expand = 0;
        while ((startDelta > 0 || endDelta < 0) && expand < 6) {
          startMs -= DAY_MS;
          endMs += DAY_MS;
          startDelta = getAngleDelta(getSolarLongitude(startMs), term.longitude);
          endDelta = getAngleDelta(getSolarLongitude(endMs), term.longitude);
          expand += 1;
        }
        const eventDate = (startDelta > 0 || endDelta < 0)
          ? new Date(Date.UTC(year, term.month - 1, estimatedDay, 12, 0, 0, 0))
          : findRootByBisection(startMs, endMs, (valueMs) => getAngleDelta(getSolarLongitude(valueMs), term.longitude));
        if (eventDate < start || eventDate > end) return;
        pushEvent(events, {
          id: `astro-term-${term.key}-${toDateString(eventDate)}-${formatLocalTime(eventDate).replace(':', '')}`,
          source: 'astronomy',
          astronomyKind: 'solarTerm',
          date: toDateString(eventDate),
          name: term.name,
          description: `24절기 자동 일정입니다. 태양 황경 ${term.longitude}°를 지나는 시각입니다.`,
          startTime: formatLocalTime(eventDate),
          endTime: '',
          allDay: false,
          visibilityGrade: 'good',
          koreaVisible: true
        });
      });
    }
    return events;
  }

  function buildMeteorEvents(start, end) {
    const events = [];
    for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
      METEOR_SHOWERS.forEach((shower) => {
        for (let day = shower.startDay; day <= shower.endDay; day += 1) {
          const eventDate = new Date(year, shower.month - 1, day);
          if (eventDate < start || eventDate > end) continue;
          pushEvent(events, {
            id: `astro-meteor-${shower.key}-${toDateString(eventDate)}`,
            source: 'astronomy',
            astronomyKind: 'meteor',
            date: toDateString(eventDate),
            name: `${shower.shortName} 극대`,
            description: `${shower.fullName} 극대 예상 밤입니다. NASA 기준 시간당 최대 약 ${shower.rate}개 수준이며 모체는 ${shower.parentBody}입니다.`,
            startTime: '',
            endTime: '',
            allDay: true,
            link: METEOR_INFO_URL,
            linkLabel: 'NASA 관측',
            visibilityGrade: 'good',
            koreaVisible: shower.koreaVisible
          });
        }
      });
    }
    return events;
  }

  function buildEclipseEvents(start, end) {
    const events = [];
    ECLIPSES.forEach((eclipse) => {
      getDateRangeStrings(eclipse.startDate, eclipse.endDate).forEach((dateStr) => {
        const eventDate = parseDateString(dateStr);
        if (eventDate < start || eventDate > end) return;
        pushEvent(events, {
          id: `astro-eclipse-${eclipse.key}-${dateStr}`,
          source: 'astronomy',
          astronomyKind: 'eclipse',
          date: dateStr,
          name: eclipse.name,
          description: `${eclipse.description} 관측 가능 권역: ${eclipse.visibility}.`,
          startTime: '',
          endTime: '',
          allDay: true,
          link: ECLIPSE_INFO_URL,
          linkLabel: 'NASA 정보',
          visibilityGrade: eclipse.koreaVisible ? 'good' : 'poor',
          koreaVisible: eclipse.koreaVisible
        });
      });
    });
    return events;
  }

  function classifyInnerPlanetConjunction(planetKey, dateLike) {
    const planetState = getPlanetState(planetKey, dateLike);
    const helioDiff = Math.abs(getAngleDelta(planetState.heliocentricLongitude, planetState.earthHeliocentricLongitude));
    return helioDiff < 90 ? 'inferior' : 'superior';
  }

  function buildPlanetaryEvents(start, end, lat, lon) {
    const events = [];
    const visibleEnd = new Date(end.getTime() + DAY_MS - 1);
    const scanStartMs = start.getTime() - DAY_MS;
    const scanEndMs = visibleEnd.getTime() + (DAY_MS * 2);

    PLANETS.forEach((planet) => {
      ['conjunction', 'opposition'].forEach((mode) => {
        if (planet.inner && mode === 'opposition') return;
        let previousMs = scanStartMs;
        let previousValue = getAngleDelta(getPlanetState(planet.key, previousMs).lon, mode === 'opposition' ? normalizeAngle(getSunState(previousMs).lon + 180) : getSunState(previousMs).lon);
        for (let currentMs = scanStartMs + DAY_MS; currentMs <= scanEndMs; currentMs += DAY_MS) {
          const target = mode === 'opposition' ? normalizeAngle(getSunState(currentMs).lon + 180) : getSunState(currentMs).lon;
          const currentValue = getAngleDelta(getPlanetState(planet.key, currentMs).lon, target);
          const crossed = (
            ((previousValue <= 0 && currentValue >= 0) || (previousValue >= 0 && currentValue <= 0)) &&
            Math.abs(previousValue - currentValue) < 180
          );
          if (crossed) {
            const eventDate = findRootByBisection(previousMs, currentMs, (valueMs) => {
              const targetLon = mode === 'opposition' ? normalizeAngle(getSunState(valueMs).lon + 180) : getSunState(valueMs).lon;
              return getAngleDelta(getPlanetState(planet.key, valueMs).lon, targetLon);
            });
            if (eventDate >= start && eventDate <= visibleEnd) {
              const meta = (planet.inner && mode === 'conjunction')
                ? (() => {
                  const type = classifyInnerPlanetConjunction(planet.key, eventDate);
                  return {
                    name: `${planet.label} ${type === 'inferior' ? '내합' : '외합'}`,
                    description: `${planet.label}이(가) 태양 방향으로 겹쳐 보이는 시기입니다. ${type === 'inferior' ? '지구와 태양 사이를 지나며' : '태양 너머로 지나며'} 관측이 어렵습니다.`,
                    visibilityGrade: 'poor',
                    koreaVisible: false
                  };
                })()
                : {
                  name: `${planet.label} ${mode === 'opposition' ? '충' : '합'}`,
                  description: `${planet.label}이(가) ${mode === 'opposition' ? '태양과 정반대 방향에 놓여' : '태양 방향에 가까워져'} ${mode === 'opposition' ? '밤 관측에 유리한' : '관측이 어려운'} 시기입니다.`,
                  visibilityGrade: mode === 'opposition' ? 'good' : 'poor',
                  koreaVisible: mode === 'opposition'
                };
              pushEvent(events, {
                id: `astro-planetary-${planet.key}-${mode}-${toDateString(eventDate)}-${formatLocalTime(eventDate).replace(':', '')}`,
                source: 'astronomy',
                astronomyKind: 'planetary',
                date: toDateString(eventDate),
                name: meta.name,
                description: meta.description,
                startTime: formatLocalTime(eventDate),
                endTime: '',
                allDay: false,
                link: PLANETARY_SKYWATCHING_URL,
                linkLabel: 'NASA 관측',
                visibilityGrade: meta.visibilityGrade,
                koreaVisible: meta.koreaVisible
              });
            }
          }
          previousMs = currentMs;
          previousValue = currentValue;
        }
      });
    });

    ['mercury', 'venus'].forEach((planetKey) => {
      const minElongation = planetKey === 'mercury' ? 15 : 25;
      for (let sampleMs = scanStartMs + (12 * 60 * 60 * 1000); sampleMs <= scanEndMs - (12 * 60 * 60 * 1000); sampleMs += 12 * 60 * 60 * 1000) {
        const before = Math.abs(getAngleDelta(getPlanetState(planetKey, sampleMs - (12 * 60 * 60 * 1000)).lon, getSunState(sampleMs - (12 * 60 * 60 * 1000)).lon));
        const current = Math.abs(getAngleDelta(getPlanetState(planetKey, sampleMs).lon, getSunState(sampleMs).lon));
        const after = Math.abs(getAngleDelta(getPlanetState(planetKey, sampleMs + (12 * 60 * 60 * 1000)).lon, getSunState(sampleMs + (12 * 60 * 60 * 1000)).lon));
        if (!(current >= before && current >= after && current >= minElongation)) continue;
        const eventDate = refineMinimum(sampleMs - (12 * 60 * 60 * 1000), sampleMs + (12 * 60 * 60 * 1000), (valueMs) => -Math.abs(getAngleDelta(getPlanetState(planetKey, valueMs).lon, getSunState(valueMs).lon)));
        if (eventDate < start || eventDate > visibleEnd) continue;
        const delta = getAngleDelta(getPlanetState(planetKey, eventDate).lon, getSunState(eventDate).lon);
        const mode = delta >= 0 ? '동방' : '서방';
        const visibility = sampleVisibility([planetKey], eventDate, lat, lon, mode === '동방' ? 'evening' : 'morning');
        pushEvent(events, {
          id: `astro-elongation-${planetKey}-${toDateString(eventDate)}-${formatLocalTime(eventDate).replace(':', '')}`,
          source: 'astronomy',
          astronomyKind: 'elongation',
          date: toDateString(eventDate),
          name: `${PLANETS.find((planet) => planet.key === planetKey)?.label || planetKey} ${mode} 최대이각`,
          description: `${PLANETS.find((planet) => planet.key === planetKey)?.label || planetKey}이(가) 태양에서 가장 멀리 벌어지는 시기입니다.`,
          startTime: formatLocalTime(eventDate),
          endTime: '',
          allDay: false,
          link: PLANETARY_SKYWATCHING_URL,
          linkLabel: 'NASA 관측',
          visibilityGrade: visibility.grade,
          koreaVisible: visibility.grade !== 'poor'
        });
      }
    });

    return events;
  }

  function buildMoonPlanetApproachEvents(start, end, lat, lon) {
    const events = [];
    const bodies = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
    const scanStartMs = start.getTime() - DAY_MS;
    const scanEndMs = end.getTime() + DAY_MS;
    const stepMs = 6 * 60 * 60 * 1000;
    bodies.forEach((planetKey) => {
      let lastAcceptedMs = 0;
      for (let sampleMs = scanStartMs + stepMs; sampleMs <= scanEndMs - stepMs; sampleMs += stepMs) {
        const before = getAngularSeparation(getMoonState(sampleMs - stepMs), getPlanetState(planetKey, sampleMs - stepMs));
        const current = getAngularSeparation(getMoonState(sampleMs), getPlanetState(planetKey, sampleMs));
        const after = getAngularSeparation(getMoonState(sampleMs + stepMs), getPlanetState(planetKey, sampleMs + stepMs));
        if (!(current <= before && current <= after && current <= 5)) continue;
        const eventDate = refineMinimum(sampleMs - stepMs, sampleMs + stepMs, (valueMs) => getAngularSeparation(getMoonState(valueMs), getPlanetState(planetKey, valueMs)));
        if (eventDate < start || eventDate > end) continue;
        if (Math.abs(eventDate.getTime() - lastAcceptedMs) < (18 * 60 * 60 * 1000)) continue;
        lastAcceptedMs = eventDate.getTime();
        const separation = getAngularSeparation(getMoonState(eventDate), getPlanetState(planetKey, eventDate));
        const visibility = sampleVisibility(['moon', planetKey], eventDate, lat, lon, 'night');
        pushEvent(events, {
          id: `astro-moon-approach-${planetKey}-${toDateString(eventDate)}-${formatLocalTime(eventDate).replace(':', '')}`,
          source: 'astronomy',
          astronomyKind: 'moonApproach',
          date: toDateString(eventDate),
          name: `달·${PLANETS.find((planet) => planet.key === planetKey)?.label || planetKey} 근접`,
          description: `달과 ${PLANETS.find((planet) => planet.key === planetKey)?.label || planetKey}이(가) 약 ${separation.toFixed(1)}°까지 가까워지는 시기입니다.`,
          startTime: formatLocalTime(eventDate),
          endTime: '',
          allDay: false,
          link: PLANETARY_SKYWATCHING_URL,
          linkLabel: '관측 팁',
          visibilityGrade: visibility.grade,
          koreaVisible: visibility.grade !== 'poor'
        });
      }
    });
    return events;
  }

  function buildPlanetPlanetApproachEvents(start, end, lat, lon) {
    const events = [];
    const pairs = [];
    for (let index = 0; index < PLANETS.length; index += 1) {
      for (let inner = index + 1; inner < PLANETS.length; inner += 1) {
        pairs.push([PLANETS[index], PLANETS[inner]]);
      }
    }
    const scanStartMs = start.getTime() - DAY_MS;
    const scanEndMs = end.getTime() + DAY_MS;
    const stepMs = 6 * 60 * 60 * 1000;
    pairs.forEach(([planetA, planetB]) => {
      let lastAcceptedMs = 0;
      for (let sampleMs = scanStartMs + stepMs; sampleMs <= scanEndMs - stepMs; sampleMs += stepMs) {
        const before = getAngularSeparation(getPlanetState(planetA.key, sampleMs - stepMs), getPlanetState(planetB.key, sampleMs - stepMs));
        const current = getAngularSeparation(getPlanetState(planetA.key, sampleMs), getPlanetState(planetB.key, sampleMs));
        const after = getAngularSeparation(getPlanetState(planetA.key, sampleMs + stepMs), getPlanetState(planetB.key, sampleMs + stepMs));
        if (!(current <= before && current <= after && current <= 3)) continue;
        const eventDate = refineMinimum(sampleMs - stepMs, sampleMs + stepMs, (valueMs) => getAngularSeparation(getPlanetState(planetA.key, valueMs), getPlanetState(planetB.key, valueMs)));
        if (eventDate < start || eventDate > end) continue;
        if (Math.abs(eventDate.getTime() - lastAcceptedMs) < (18 * 60 * 60 * 1000)) continue;
        lastAcceptedMs = eventDate.getTime();
        const separation = getAngularSeparation(getPlanetState(planetA.key, eventDate), getPlanetState(planetB.key, eventDate));
        const visibility = sampleVisibility([planetA.key, planetB.key], eventDate, lat, lon, 'night');
        pushEvent(events, {
          id: `astro-planet-approach-${planetA.key}-${planetB.key}-${toDateString(eventDate)}-${formatLocalTime(eventDate).replace(':', '')}`,
          source: 'astronomy',
          astronomyKind: 'planetApproach',
          date: toDateString(eventDate),
          name: `${planetA.label}·${planetB.label} 근접`,
          description: `${planetA.label}과 ${planetB.label}이(가) 약 ${separation.toFixed(1)}°까지 가까워지는 시기입니다.`,
          startTime: formatLocalTime(eventDate),
          endTime: '',
          allDay: false,
          link: PLANETARY_SKYWATCHING_URL,
          linkLabel: '관측 팁',
          visibilityGrade: visibility.grade,
          koreaVisible: visibility.grade !== 'poor'
        });
      }
    });
    return events;
  }

  function normalizeAstronomyLevel(level) {
    const text = String(level || '').trim().toLowerCase();
    if (text === 'detailed') return 'detailed';
    if (text === 'off') return 'off';
    return 'basic';
  }

  function shouldIncludeEvent(event, options) {
    const level = normalizeAstronomyLevel(options?.level);
    if (level === 'off') return false;
    if (options?.koreaOnly && event.koreaVisible === false) return false;
    if (options?.koreaOnly && event.visibilityGrade === 'poor') return false;
    if (level === 'basic' && ['moonApproach', 'planetApproach'].includes(event.astronomyKind)) return false;
    return true;
  }

  function getDefaultLocation(options) {
    let configuredLocation = null;
    try {
      configuredLocation = LS.Config?.getWeatherLocation?.() || null;
    } catch {
      configuredLocation = null;
    }
    const lat = Number.isFinite(Number(options?.lat))
      ? Number(options.lat)
      : (Number.isFinite(Number(configuredLocation?.lat)) ? Number(configuredLocation.lat) : SEOUL_LAT);
    const lon = Number.isFinite(Number(options?.lon))
      ? Number(options.lon)
      : (Number.isFinite(Number(configuredLocation?.lon)) ? Number(configuredLocation.lon) : SEOUL_LON);
    return { lat, lon };
  }

  function getEventsForRange(startDateLike, endDateLike, options = {}) {
    const level = normalizeAstronomyLevel(options.level);
    if (level === 'off') return [];

    const start = cloneDate(startDateLike);
    const endBase = cloneDate(endDateLike);
    const end = new Date(endBase.getFullYear(), endBase.getMonth(), endBase.getDate(), 23, 59, 59, 999);
    const { lat, lon } = getDefaultLocation(options);
    const events = [
      ...buildPhaseEvents(start, end),
      ...buildSolarTermEvents(start, end),
      ...buildMeteorEvents(start, end),
      ...buildEclipseEvents(start, end),
      ...buildPlanetaryEvents(start, end, lat, lon),
      ...buildMoonPlanetApproachEvents(start, end, lat, lon),
      ...buildPlanetPlanetApproachEvents(start, end, lat, lon)
    ];

    return events.filter((event) => shouldIncludeEvent(event, { ...options, level })).sort(sortEvents);
  }

  function getWeeklyWindow(nowLike) {
    const now = new Date(nowLike || Date.now());
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6, 23, 59, 59, 999);
    return { now, start, end };
  }

  function getHighlightScore(event) {
    const scores = { eclipse: 100, meteor: 90, moonApproach: 82, planetApproach: 78, elongation: 74, planetary: 70, phase: 58, solarTerm: 42 };
    const gradeBonus = event.visibilityGrade === 'good' ? 10 : event.visibilityGrade === 'fair' ? 4 : 0;
    return (scores[event.astronomyKind] || 30) + gradeBonus;
  }

  function sortWeeklyHighlights(a, b) {
    if (a.date !== b.date) return a.date.localeCompare(b.date);

    const timeA = a.startTime ? LS.Helpers.timeToMinutes(a.startTime) : 9999;
    const timeB = b.startTime ? LS.Helpers.timeToMinutes(b.startTime) : 9999;
    if (timeA !== timeB) return timeA - timeB;

    const scoreDiff = getHighlightScore(b) - getHighlightScore(a);
    if (scoreDiff !== 0) return scoreDiff;

    return a.name.localeCompare(b.name, 'ko');
  }

  function eventFallsInWeeklyWindow(event, window) {
    const eventDate = parseDateString(event.date);
    if (event.allDay) {
      return eventDate >= cloneDate(window.start) && eventDate <= cloneDate(window.end);
    }
    const [hours, minutes] = String(event.startTime || '12:00').split(':').map((value) => parseInt(value, 10) || 0);
    const dateTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), hours, minutes, 0, 0);
    return dateTime >= window.now && dateTime <= window.end;
  }

  function getWeeklyHighlights(nowLike, options = {}) {
    const level = normalizeAstronomyLevel(options.level);
    if (level === 'off') return [];
    const window = getWeeklyWindow(nowLike);
    const seenNames = new Set();
    return getEventsForRange(cloneDate(window.start), cloneDate(window.end), options)
      .filter((event) => eventFallsInWeeklyWindow(event, window))
      .filter((event) => ['meteor', 'eclipse', 'moonApproach', 'planetApproach', 'elongation', 'planetary', 'phase'].includes(event.astronomyKind))
      .sort(sortWeeklyHighlights)
      .filter((event) => {
        if (seenNames.has(event.name)) return false;
        seenNames.add(event.name);
        return true;
      })
      .slice(0, 4);
  }

  LS.Astronomy = {
    normalizeAstronomyLevel,
    getEventsForRange,
    getWeeklyHighlights
  };
})();
