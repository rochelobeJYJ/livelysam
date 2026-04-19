(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};

  const SOURCE_ORDER = { holiday: 0, school: 1, google: 2, schedule: 3, googleTask: 4, task: 5, countdown: 6, astronomy: 7 };
  const VIEW_MODES = ['month', 'week', 'list'];
  const LIST_WINDOW_DAYS = 14;
  const DAY_MS = 86400000;
  const SYNODIC_MONTH_DAYS = 29.530588853;
  const REFERENCE_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14, 0);
  const SOLAR_TERM_YEAR_FACTOR = 0.2422;
  const ASTRONOMY_PHASE_META = {
    'new-moon': { name: '삭', description: '달이 새 주기를 시작하는 시점입니다.' },
    'first-quarter': { name: '상현', description: '달이 차오르며 반달이 되는 시점입니다.' },
    'full-moon': { name: '보름', description: '달이 가장 밝게 차오르는 시점입니다.' },
    'last-quarter': { name: '하현', description: '달이 기울며 반달이 되는 시점입니다.' }
  };
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
  const ASTRONOMY_PHASES = [
    { key: 'new-moon', name: '삭', description: '신월 시점입니다.', offsetDays: 0 },
    { key: 'first-quarter', name: '상현', description: '달이 차오르며 반달이 되는 시점입니다.', offsetDays: SYNODIC_MONTH_DAYS / 4 },
    { key: 'full-moon', name: '보름', description: '달이 가장 밝게 차오르는 시점입니다.', offsetDays: SYNODIC_MONTH_DAYS / 2 },
    { key: 'last-quarter', name: '하현', description: '달이 기울며 반달이 되는 시점입니다.', offsetDays: (SYNODIC_MONTH_DAYS * 3) / 4 }
  ];

  const METEOR_INFO_URL = 'https://science.nasa.gov/solar-system/meteors-meteorites/facts/';
  const ECLIPSE_INFO_URL = 'https://science.nasa.gov/eclipses/future-eclipses/';
  const METEOR_SHOWERS = [
    { key: 'quadrantids', month: 1, startDay: 3, endDay: 4, shortName: '사분의', fullName: '사분의자리 유성우', rate: 120, parentBody: '(196256) 2003 EH1' },
    { key: 'lyrids', month: 4, startDay: 21, endDay: 22, shortName: '리리드', fullName: '리리드 유성우', rate: 18, parentBody: 'Comet C/1861 G1' },
    { key: 'eta-aquariids', month: 5, startDay: 3, endDay: 4, shortName: '에타물병', fullName: '에타 물병자리 유성우', rate: 50, parentBody: 'Comet 1P/Halley' },
    { key: 'southern-delta-aquariids', month: 7, startDay: 29, endDay: 30, shortName: '델타물병', fullName: '남쪽 델타 물병자리 유성우', rate: 25, parentBody: 'Comet 96P/Machholz' },
    { key: 'perseids', month: 8, startDay: 12, endDay: 13, shortName: '페르세우스', fullName: '페르세우스 유성우', rate: 100, parentBody: 'Comet 109P/Swift-Tuttle' },
    { key: 'orionids', month: 10, startDay: 22, endDay: 23, shortName: '오리온', fullName: '오리온 유성우', rate: 20, parentBody: 'Comet 1P/Halley' },
    { key: 'leonids', month: 11, startDay: 16, endDay: 17, shortName: '사자자리', fullName: '사자자리 유성우', rate: 15, parentBody: 'Comet 55P/Tempel-Tuttle' },
    { key: 'geminids', month: 12, startDay: 12, endDay: 13, shortName: '쌍둥이', fullName: '쌍둥이자리 유성우', rate: 150, parentBody: '(3200) Phaethon' }
  ];
  const ASTRONOMY_ECLIPSES = [
    {
      key: '2026-total-lunar',
      startDate: '2026-03-03',
      endDate: '2026-03-03',
      name: '개기월식',
      description: '달이 지구 본그림자에 완전히 들어가는 월식입니다.',
      visibility: '동아시아, 호주, 태평양, 아메리카'
    },
    {
      key: '2026-partial-lunar',
      startDate: '2026-08-27',
      endDate: '2026-08-28',
      name: '부분월식',
      description: '달의 일부만 지구 본그림자에 들어가는 월식입니다.',
      visibility: '아메리카, 유럽, 아프리카, 서아시아'
    },
    {
      key: '2026-total-solar',
      startDate: '2026-08-12',
      endDate: '2026-08-12',
      name: '개기일식',
      description: '달이 태양을 완전히 가리는 일식입니다. 태양 관측 시에는 전용 필터가 필요합니다.',
      visibility: '그린란드, 아이슬란드, 스페인, 러시아, 포르투갈 일부'
    },
    {
      key: '2027-annular-solar',
      startDate: '2027-02-06',
      endDate: '2027-02-06',
      name: '금환일식',
      description: '달이 태양 중심을 가리지만 가장자리가 고리처럼 남는 일식입니다. 태양 관측 시에는 전용 필터가 필요합니다.',
      visibility: '칠레, 아르헨티나, 우루과이, 브라질, 코트디부아르, 가나, 토고, 베냉, 나이지리아'
    },
    {
      key: '2027-penumbral-lunar',
      startDate: '2027-02-20',
      endDate: '2027-02-21',
      name: '반영월식',
      description: '달이 지구 반그림자만 스쳐 지나가 비교적 은은하게 보이는 월식입니다.',
      visibility: '아메리카, 유럽, 아프리카, 아시아, 호주, 남극'
    },
    {
      key: '2027-total-solar',
      startDate: '2027-08-02',
      endDate: '2027-08-02',
      name: '개기일식',
      description: '달이 태양을 완전히 가리는 일식입니다. 태양 관측 시에는 전용 필터가 필요합니다.',
      visibility: '스페인 남부, 북아프리카, 사우디아라비아, 예멘'
    }
  ];
  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;
  const PLANETARY_SKYWATCHING_URL = 'https://science.nasa.gov/solar-system/skywatching/';
  const PLANET_ORBITS = {
    mercury: {
      nodeBase: 48.3313, nodeRate: 3.24587e-5, inclinationBase: 7.0047, inclinationRate: 5.0e-8,
      perihelionBase: 29.1241, perihelionRate: 1.01444e-5, semiMajorAxisBase: 0.387098, semiMajorAxisRate: 0,
      eccentricityBase: 0.205635, eccentricityRate: 5.59e-10, anomalyBase: 168.6562, anomalyRate: 4.0923344368
    },
    venus: {
      nodeBase: 76.6799, nodeRate: 2.4659e-5, inclinationBase: 3.3946, inclinationRate: 2.75e-8,
      perihelionBase: 54.891, perihelionRate: 1.38374e-5, semiMajorAxisBase: 0.72333, semiMajorAxisRate: 0,
      eccentricityBase: 0.006773, eccentricityRate: -1.302e-9, anomalyBase: 48.0052, anomalyRate: 1.6021302244
    },
    earth: {
      nodeBase: 0, nodeRate: 0, inclinationBase: 0, inclinationRate: 0,
      perihelionBase: 282.9404, perihelionRate: 4.70935e-5, semiMajorAxisBase: 1, semiMajorAxisRate: 0,
      eccentricityBase: 0.016709, eccentricityRate: -1.151e-9, anomalyBase: 356.047, anomalyRate: 0.9856002585
    },
    mars: {
      nodeBase: 49.5574, nodeRate: 2.11081e-5, inclinationBase: 1.8497, inclinationRate: -1.78e-8,
      perihelionBase: 286.5016, perihelionRate: 2.92961e-5, semiMajorAxisBase: 1.523688, semiMajorAxisRate: 0,
      eccentricityBase: 0.093405, eccentricityRate: 2.516e-9, anomalyBase: 18.6021, anomalyRate: 0.5240207766
    },
    jupiter: {
      nodeBase: 100.4542, nodeRate: 2.76854e-5, inclinationBase: 1.303, inclinationRate: -1.557e-7,
      perihelionBase: 273.8777, perihelionRate: 1.64505e-5, semiMajorAxisBase: 5.20256, semiMajorAxisRate: 0,
      eccentricityBase: 0.048498, eccentricityRate: 4.469e-9, anomalyBase: 19.895, anomalyRate: 0.0830853001
    },
    saturn: {
      nodeBase: 113.6634, nodeRate: 2.3898e-5, inclinationBase: 2.4886, inclinationRate: -1.081e-7,
      perihelionBase: 339.3939, perihelionRate: 2.97661e-5, semiMajorAxisBase: 9.55475, semiMajorAxisRate: 0,
      eccentricityBase: 0.055546, eccentricityRate: -9.499e-9, anomalyBase: 316.967, anomalyRate: 0.0334442282
    }
  };
  const PLANETARY_EVENTS = [
    { key: 'mercury', label: '수성', modes: ['conjunction'], inner: true },
    { key: 'venus', label: '금성', modes: ['conjunction'], inner: true },
    { key: 'mars', label: '화성', modes: ['conjunction', 'opposition'], inner: false },
    { key: 'jupiter', label: '목성', modes: ['conjunction', 'opposition'], inner: false },
    { key: 'saturn', label: '토성', modes: ['conjunction', 'opposition'], inner: false }
  ];

  function cloneDate(dateLike) {
    const date = new Date(dateLike);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(dateLike, days) {
    const date = cloneDate(dateLike);
    date.setDate(date.getDate() + days);
    return date;
  }

  function toDateString(dateLike) {
    return LS.Helpers.formatDate(cloneDate(dateLike), 'YYYY-MM-DD');
  }

  function parseDateString(dateText) {
    const [year, month, day] = String(dateText).split('-').map((value) => parseInt(value, 10));
    return new Date(year || 0, (month || 1) - 1, day || 1);
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

  function getWeekStart(dateLike) {
    const date = cloneDate(dateLike);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    return addDays(date, diff);
  }

  function getMonthKey(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  function formatLocalTime(dateLike) {
    const date = new Date(dateLike);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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

  function getSolarLongitude(dateLike) {
    const julianDay = getJulianDay(dateLike);
    const centuries = (julianDay - 2451545.0) / 36525;
    const meanLongitude = normalizeAngle(280.46646 + (36000.76983 * centuries) + (0.0003032 * centuries * centuries));
    const meanAnomaly = normalizeAngle(357.52911 + (35999.05029 * centuries) - (0.0001537 * centuries * centuries));
    const meanAnomalyRad = meanAnomaly * (Math.PI / 180);
    const equationOfCenter =
      ((1.914602 - (0.004817 * centuries) - (0.000014 * centuries * centuries)) * Math.sin(meanAnomalyRad)) +
      ((0.019993 - (0.000101 * centuries)) * Math.sin(2 * meanAnomalyRad)) +
      (0.000289 * Math.sin(3 * meanAnomalyRad));
    const trueLongitude = meanLongitude + equationOfCenter;
    const omega = 125.04 - (1934.136 * centuries);
    return normalizeAngle(trueLongitude - 0.00569 - (0.00478 * Math.sin(omega * (Math.PI / 180))));
  }

  function getOrbitalDays(dateLike) {
    return getJulianDay(dateLike) - 2451543.5;
  }

  function solveKepler(meanAnomalyDeg, eccentricity) {
    const meanAnomalyRad = meanAnomalyDeg * RAD;
    let eccentricAnomaly = meanAnomalyDeg + (DEG * eccentricity * Math.sin(meanAnomalyRad) * (1 + (eccentricity * Math.cos(meanAnomalyRad))));
    for (let index = 0; index < 5; index += 1) {
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
      radius,
      heliocentricLongitude: normalizeAngle(Math.atan2(yh, xh) * DEG)
    };
  }

  function getPlanetGeocentricState(planetKey, dateLike) {
    const earth = getPlanetHeliocentricState('earth', dateLike);
    const sunLongitude = normalizeAngle(Math.atan2(-earth.yh, -earth.xh) * DEG);
    if (planetKey === 'sun') {
      return {
        longitude: sunLongitude,
        earthHeliocentricLongitude: earth.heliocentricLongitude
      };
    }

    const planet = getPlanetHeliocentricState(planetKey, dateLike);
    const xg = planet.xh - earth.xh;
    const yg = planet.yh - earth.yh;
    const zg = planet.zh - earth.zh;
    return {
      longitude: normalizeAngle(Math.atan2(yg, xg) * DEG),
      distance: Math.sqrt((xg * xg) + (yg * yg) + (zg * zg)),
      heliocentricLongitude: planet.heliocentricLongitude,
      earthHeliocentricLongitude: earth.heliocentricLongitude,
      sunLongitude
    };
  }

  function getPlanetEventDelta(planetKey, mode, dateLike) {
    const planetState = getPlanetGeocentricState(planetKey, dateLike);
    const target = mode === 'opposition' ? normalizeAngle(planetState.sunLongitude + 180) : planetState.sunLongitude;
    return getAngleDelta(planetState.longitude, target);
  }

  function refineAstronomyRoot(startMs, endMs, evaluator) {
    let leftMs = startMs;
    let rightMs = endMs;
    let leftValue = evaluator(leftMs);
    let rightValue = evaluator(rightMs);

    for (let index = 0; index < 36; index += 1) {
      const midMs = Math.floor((leftMs + rightMs) / 2);
      const midValue = evaluator(midMs);
      if ((leftValue <= 0 && midValue >= 0) || (leftValue >= 0 && midValue <= 0)) {
        rightMs = midMs;
        rightValue = midValue;
      } else {
        leftMs = midMs;
        leftValue = midValue;
      }
    }

    return new Date(Math.floor((leftMs + rightMs) / 2));
  }

  function classifyInnerPlanetConjunction(planetKey, dateLike) {
    const planetState = getPlanetGeocentricState(planetKey, dateLike);
    const helioDiff = Math.abs(getAngleDelta(planetState.heliocentricLongitude, planetState.earthHeliocentricLongitude));
    return helioDiff < 90 ? 'inferior' : 'superior';
  }

  function getPlanetaryEventMeta(planet, mode, dateLike) {
    if (planet.inner && mode === 'conjunction') {
      const conjunctionType = classifyInnerPlanetConjunction(planet.key, dateLike);
      return {
        name: `${planet.label} ${conjunctionType === 'inferior' ? '내합' : '외합'}`,
        description: `${planet.label}이(가) 태양 방향으로 겹쳐 보이는 시기입니다. ${conjunctionType === 'inferior' ? '지구와 태양 사이를 지나며' : '태양 너머로 지나며'} 관측이 어렵습니다.`
      };
    }

    if (mode === 'opposition') {
      return {
        name: `${planet.label} 충`,
        description: `${planet.label}이(가) 태양과 정반대 방향에 놓이는 시기입니다. 해가 진 뒤부터 오래 보기 좋은 편입니다.`
      };
    }

    return {
      name: `${planet.label} 합`,
      description: `${planet.label}이(가) 태양 방향으로 가까워지는 시기입니다. 실제 관측은 어렵지만 천문 달력 기준으로 의미 있는 정렬입니다.`
    };
  }

  function getPlanetaryEventsForRange(startDateLike, endDateLike) {
    const start = cloneDate(startDateLike);
    const visibleEnd = new Date(cloneDate(endDateLike).getTime() + DAY_MS - 1);
    const end = new Date(visibleEnd.getTime() + (DAY_MS * 2));
    const scanStartMs = start.getTime() - DAY_MS;
    const scanEndMs = end.getTime();
    const events = [];

    PLANETARY_EVENTS.forEach((planet) => {
      planet.modes.forEach((mode) => {
        let previousMs = scanStartMs;
        let previousValue = getPlanetEventDelta(planet.key, mode, previousMs);

        for (let currentMs = scanStartMs + DAY_MS; currentMs <= scanEndMs; currentMs += DAY_MS) {
          const currentValue = getPlanetEventDelta(planet.key, mode, currentMs);
          const crossed = (
            ((previousValue <= 0 && currentValue >= 0) || (previousValue >= 0 && currentValue <= 0)) &&
            Math.abs(previousValue - currentValue) < 180
          );
          if (crossed) {
            const eventDate = refineAstronomyRoot(previousMs, currentMs, (valueMs) => getPlanetEventDelta(planet.key, mode, valueMs));
            if (eventDate >= start && eventDate <= visibleEnd) {
              const dateStr = toDateString(eventDate);
              const timeLabel = formatLocalTime(eventDate);
              const meta = getPlanetaryEventMeta(planet, mode, eventDate);
              events.push({
                id: `astronomy-planet-${planet.key}-${mode}-${dateStr}-${timeLabel.replace(':', '')}`,
                source: 'astronomy',
                astronomyKind: 'planetary',
                date: dateStr,
                name: meta.name,
                description: meta.description,
                startTime: timeLabel,
                endTime: '',
                allDay: false,
                link: PLANETARY_SKYWATCHING_URL,
                linkLabel: 'NASA 관측'
              });
            }
          }
          previousMs = currentMs;
          previousValue = currentValue;
        }
      });
    });

    return events;
  }

  function getSolarTermEstimateDay(year, term) {
    const yearDigits = year % 100;
    const constant = year >= 2001 ? term.c21 : term.c20;
    const leapCorrection = year >= 2001 ? Math.floor(yearDigits / 4) : Math.floor((yearDigits - 1) / 4);
    return Math.floor((yearDigits * SOLAR_TERM_YEAR_FACTOR) + constant) - leapCorrection;
  }

  function findSolarTermTime(year, term) {
    const estimatedDay = getSolarTermEstimateDay(year, term);
    let startMs = Date.UTC(year, term.month - 1, estimatedDay - 2, 0, 0, 0, 0);
    let endMs = Date.UTC(year, term.month - 1, estimatedDay + 2, 23, 59, 59, 999);
    let startDelta = getAngleDelta(getSolarLongitude(startMs), term.longitude);
    let endDelta = getAngleDelta(getSolarLongitude(endMs), term.longitude);
    let attempts = 0;

    while ((startDelta > 0 || endDelta < 0) && attempts < 6) {
      startMs -= DAY_MS;
      endMs += DAY_MS;
      startDelta = getAngleDelta(getSolarLongitude(startMs), term.longitude);
      endDelta = getAngleDelta(getSolarLongitude(endMs), term.longitude);
      attempts += 1;
    }

    if (startDelta > 0 || endDelta < 0) {
      return new Date(Date.UTC(year, term.month - 1, estimatedDay, 12, 0, 0, 0));
    }

    for (let index = 0; index < 36; index += 1) {
      const midMs = Math.floor((startMs + endMs) / 2);
      const midDelta = getAngleDelta(getSolarLongitude(midMs), term.longitude);
      if (midDelta >= 0) {
        endMs = midMs;
      } else {
        startMs = midMs;
      }
    }

    return new Date(endMs);
  }

  function sortAstronomyEvents(a, b) {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const timeA = a.startTime ? LS.Helpers.timeToMinutes(a.startTime) : 9999;
    const timeB = b.startTime ? LS.Helpers.timeToMinutes(b.startTime) : 9999;
    if (timeA !== timeB) return timeA - timeB;
    return a.name.localeCompare(b.name, 'ko');
  }

  function buildAstronomyEventsForRange(startDateLike, endDateLike) {
    const start = cloneDate(startDateLike);
    const endBase = cloneDate(endDateLike);
    const end = new Date(endBase.getFullYear(), endBase.getMonth(), endBase.getDate(), 23, 59, 59, 999);
    const lunationSpanMs = SYNODIC_MONTH_DAYS * DAY_MS;
    const lunationStart = Math.floor((start.getTime() - REFERENCE_NEW_MOON_UTC) / lunationSpanMs) - 2;
    const lunationEnd = Math.ceil((end.getTime() - REFERENCE_NEW_MOON_UTC) / lunationSpanMs) + 2;
    const events = [];

    for (let lunation = lunationStart; lunation <= lunationEnd; lunation += 1) {
      ASTRONOMY_PHASES.forEach((phase) => {
        const phaseMeta = ASTRONOMY_PHASE_META[phase.key] || phase;
        const eventMs = REFERENCE_NEW_MOON_UTC + ((lunation * SYNODIC_MONTH_DAYS) + phase.offsetDays) * DAY_MS;
        const eventDate = new Date(eventMs);
        if (eventDate < start || eventDate > end) return;

        const dateStr = toDateString(eventDate);
        const timeLabel = formatLocalTime(eventDate);
        events.push({
          id: `astronomy-${phase.key}-${dateStr}-${timeLabel.replace(':', '')}`,
          source: 'astronomy',
          astronomyKind: 'phase',
          date: dateStr,
          name: phaseMeta.name,
          description: `${phaseMeta.description} 자동 생성된 월령 일정입니다.`,
          startTime: timeLabel,
          endTime: '',
          allDay: false
        });
      });
    }

    for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
      SOLAR_TERMS.forEach((term) => {
        const eventDate = findSolarTermTime(year, term);
        if (eventDate < start || eventDate > end) return;

        const dateStr = toDateString(eventDate);
        const timeLabel = formatLocalTime(eventDate);
        events.push({
          id: `astronomy-term-${term.key}-${dateStr}-${timeLabel.replace(':', '')}`,
          source: 'astronomy',
          astronomyKind: 'solarTerm',
          date: dateStr,
          name: term.name,
          description: `24절기 자동 일정입니다. 태양 황경 ${term.longitude}°를 지나는 시각입니다.`,
          startTime: timeLabel,
          endTime: '',
          allDay: false
        });
      });
    }

    for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
      METEOR_SHOWERS.forEach((shower) => {
        for (let day = shower.startDay; day <= shower.endDay; day += 1) {
          const eventDate = new Date(year, shower.month - 1, day);
          if (eventDate < start || eventDate > end) continue;

          const dateStr = toDateString(eventDate);
          events.push({
            id: `astronomy-meteor-${shower.key}-${dateStr}`,
            source: 'astronomy',
            astronomyKind: 'meteor',
            date: dateStr,
            name: `${shower.shortName} 극대`,
            description: `${shower.fullName} 극대 예상 밤입니다. NASA 기준 시간당 최대 약 ${shower.rate}개 수준이며 모체는 ${shower.parentBody}입니다.`,
            startTime: '',
            endTime: '',
            allDay: true,
            link: METEOR_INFO_URL,
            linkLabel: 'NASA 관측'
          });
        }
      });
    }

    ASTRONOMY_ECLIPSES.forEach((eclipse) => {
      getDateRangeStrings(eclipse.startDate, eclipse.endDate).forEach((dateStr) => {
        const eventDate = parseDateString(dateStr);
        if (eventDate < start || eventDate > end) return;

        events.push({
          id: `astronomy-eclipse-${eclipse.key}-${dateStr}`,
          source: 'astronomy',
          astronomyKind: 'eclipse',
          date: dateStr,
          name: eclipse.name,
          description: `${eclipse.description} 관측 가능 권역: ${eclipse.visibility}.`,
          startTime: '',
          endTime: '',
          allDay: true,
          link: ECLIPSE_INFO_URL,
          linkLabel: 'NASA 정보'
        });
      });
    });

    events.push(...getPlanetaryEventsForRange(start, end));

    return events.sort(sortAstronomyEvents);
  }

  function getAstronomyEventsForRange(startDateLike, endDateLike) {
    return buildAstronomyEventsForRange(startDateLike, endDateLike);
  }

  function hexToRgba(hex, alpha = 0.16) {
    const value = String(hex || '').replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(value)) {
      return `rgba(66, 133, 244, ${alpha})`;
    }
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  LS.CalendarWidget = {
    _currentYear: 0,
    _currentMonth: 0,
    _selectedDate: '',
    _filter: 'all',
    _viewMode: 'month',
    _schoolSchedule: [],
    _schoolScheduleCache: {},
    _astronomySchedule: [],
    _astronomyScheduleCache: {},
    _bound: false,

    async init() {
      await LS.Records.init();

      const now = new Date();
      this._currentYear = now.getFullYear();
      this._currentMonth = now.getMonth() + 1;
      this._selectedDate = toDateString(now);
      this._viewMode = this._normalizeViewMode(LS.Storage.get('calendarViewMode', 'month'));

      await this.loadSchedule();
      this.render();

      if (!this._bound) {
        this._bound = true;
        this._bindEvents();
        window.addEventListener('livelysam:recordsChanged', () => this.render());
        window.addEventListener('livelysam:googleSyncChanged', () => this.render());
      }
    },

    async loadSchedule() {
      const atpt = LS.Config.get('atptCode');
      const school = LS.Config.get('schoolCode');
      const months = this._getRequiredMonths();

      if ((LS.Config.get('calendarAstronomyLevel') || 'basic') !== 'off') {
        this._astronomySchedule = months.flatMap(({ year, month }) => this._loadAstronomyMonth(year, month));
      } else {
        this._astronomySchedule = [];
      }

      if (!atpt || !school) {
        this._schoolSchedule = [];
        return;
      }
      const results = await Promise.all(
        months.map(({ year, month }) => this._loadSchoolMonth(atpt, school, year, month))
      );
      this._schoolSchedule = results.flat();
    },

    async _loadSchoolMonth(atpt, school, year, month) {
      const key = `${atpt}:${school}:${getMonthKey(year, month)}`;
      if (this._schoolScheduleCache[key]) {
        return this._schoolScheduleCache[key];
      }

      const storageKey = `cachedSchedule:${key}`;
      try {
        const data = await LS.NeisAPI.getSchedule(atpt, school, year, month);
        this._schoolScheduleCache[key] = data;
        LS.Storage.set(storageKey, data);
        return data;
      } catch {
        const cached = LS.Storage.get(storageKey, []);
        this._schoolScheduleCache[key] = cached;
        return cached;
      }
    },

    _loadAstronomyMonth(year, month) {
      const level = LS.Config.get('calendarAstronomyLevel') || 'basic';
      const koreaOnly = Boolean(LS.Config.get('calendarAstronomyKoreaOnly'));
      const preset = LS.Config.getWeatherPresetConfig?.() || {};
      const lat = Number.isFinite(Number(preset.lat)) ? Number(preset.lat) : Number(LS.Config.get('weatherLat'));
      const lon = Number.isFinite(Number(preset.lon)) ? Number(preset.lon) : Number(LS.Config.get('weatherLon'));
      const key = `${getMonthKey(year, month)}:${level}:${koreaOnly ? 'kr' : 'all'}:${lat || 'default'}:${lon || 'default'}`;
      if (this._astronomyScheduleCache[key]) {
        return this._astronomyScheduleCache[key];
      }

      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      const events = LS.Astronomy?.getEventsForRange?.(start, end, { level, koreaOnly, lat, lon }) || [];
      this._astronomyScheduleCache[key] = events;
      return events;
    },

    _getRequiredMonths() {
      let start;
      let end;

      if (this._viewMode === 'week') {
        start = getWeekStart(this._selectedDate);
        end = addDays(start, 6);
      } else if (this._viewMode === 'list') {
        start = cloneDate(this._selectedDate);
        end = addDays(start, LIST_WINDOW_DAYS - 1);
      } else {
        start = new Date(this._currentYear, this._currentMonth - 1, 1);
        end = new Date(this._currentYear, this._currentMonth, 0);
      }

      const months = [];
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const last = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cursor <= last) {
        months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
        cursor.setMonth(cursor.getMonth() + 1);
      }
      return months;
    },

    _bindEvents() {
      document.getElementById('cal-prev')?.addEventListener('click', () => this._navigate(-1));
      document.getElementById('cal-next')?.addEventListener('click', () => this._navigate(1));
      document.getElementById('cal-today')?.addEventListener('click', () => {
        const now = new Date();
        this._selectedDate = toDateString(now);
        this._currentYear = now.getFullYear();
        this._currentMonth = now.getMonth() + 1;
        this.loadSchedule().then(() => this.render());
      });
      document.getElementById('cal-add-event')?.addEventListener('click', () => this._openEventEditor(this._selectedDate));
    },

    _normalizeViewMode(value) {
      return VIEW_MODES.includes(value) ? value : 'month';
    },

    _setViewMode(mode) {
      const nextMode = this._normalizeViewMode(mode);
      if (nextMode === this._viewMode) return;
      this._viewMode = nextMode;
      LS.Storage.set('calendarViewMode', nextMode);
      this._syncCurrentMonthWithSelected();
      this.loadSchedule().then(() => this.render());
    },

    _syncCurrentMonthWithSelected() {
      const selected = cloneDate(this._selectedDate);
      this._currentYear = selected.getFullYear();
      this._currentMonth = selected.getMonth() + 1;
    },

    _navigate(direction) {
      if (this._viewMode === 'week') {
        const next = addDays(this._selectedDate, direction * 7);
        this._selectedDate = toDateString(next);
        this._syncCurrentMonthWithSelected();
        this.loadSchedule().then(() => this.render());
        return;
      }

      if (this._viewMode === 'list') {
        const next = addDays(this._selectedDate, direction * LIST_WINDOW_DAYS);
        this._selectedDate = toDateString(next);
        this._syncCurrentMonthWithSelected();
        this.loadSchedule().then(() => this.render());
        return;
      }

      this._currentMonth += direction;
      if (this._currentMonth > 12) {
        this._currentMonth = 1;
        this._currentYear += 1;
      }
      if (this._currentMonth < 1) {
        this._currentMonth = 12;
        this._currentYear -= 1;
      }

      const selectedDay = parseInt(String(this._selectedDate).split('-')[2] || '1', 10) || 1;
      const lastDate = new Date(this._currentYear, this._currentMonth, 0).getDate();
      this._selectedDate = `${this._currentYear}-${String(this._currentMonth).padStart(2, '0')}-${String(Math.min(selectedDay, lastDate)).padStart(2, '0')}`;
      this.loadSchedule().then(() => this.render());
    },

    render() {
      const titleEl = document.getElementById('cal-title');
      if (titleEl) {
        titleEl.textContent = this._getTitle();
      }

      this._renderViewButtons();
      this._renderGrid();
      this._renderSelectedDatePanel();
    },

    _getTitle() {
      if (this._viewMode === 'week') {
        const start = getWeekStart(this._selectedDate);
        const end = addDays(start, 6);
        return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
      }

      if (this._viewMode === 'list') {
        const start = cloneDate(this._selectedDate);
        const end = addDays(start, LIST_WINDOW_DAYS - 1);
        return `목록 ${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
      }

      return `${this._currentYear}년 ${this._currentMonth}월`;
    },

    _renderViewButtons() {
      const container = document.getElementById('cal-view');
      if (!container) return;

      container.innerHTML = `
        <button type="button" class="cal-view-btn ${this._viewMode === 'month' ? 'active' : ''}" data-cal-view="month">월</button>
        <button type="button" class="cal-view-btn ${this._viewMode === 'week' ? 'active' : ''}" data-cal-view="week">주</button>
        <button type="button" class="cal-view-btn ${this._viewMode === 'list' ? 'active' : ''}" data-cal-view="list">목록</button>
      `;

      container.querySelectorAll('[data-cal-view]').forEach((button) => {
        button.addEventListener('click', () => this._setViewMode(button.dataset.calView));
      });
    },

    _renderGrid() {
      if (this._viewMode === 'week') {
        this._renderWeekGrid();
        return;
      }
      if (this._viewMode === 'list') {
        this._renderListView();
        return;
      }
      this._renderMonthGrid();
    },

    _renderMonthGrid() {
      const grid = document.getElementById('cal-grid');
      if (!grid) return;

      const firstDay = new Date(this._currentYear, this._currentMonth - 1, 1).getDay();
      const lastDate = new Date(this._currentYear, this._currentMonth, 0).getDate();
      const todayStr = toDateString(new Date());
      const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];

      let html = '<div class="cal-day-headers">';
      dayLabels.forEach((label, index) => {
        const cls = index === 0 ? 'cal-sun' : index === 6 ? 'cal-sat' : '';
        html += `<div class="cal-header-cell ${cls}">${label}</div>`;
      });
      html += '</div><div class="cal-cells">';

      for (let i = 0; i < firstDay; i += 1) {
        html += '<div class="cal-cell cal-empty"></div>';
      }

      for (let day = 1; day <= lastDate; day += 1) {
        const dateStr = `${this._currentYear}-${String(this._currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const holiday = LS.Holidays.isHoliday(dateStr);
        const events = this._getEventsForDate(dateStr);
        const previewEvents = events.slice(0, 3);
        const moreCount = Math.max(0, events.length - previewEvents.length);
        const dayOfWeek = new Date(this._currentYear, this._currentMonth - 1, day).getDay();

        let cls = 'cal-cell';
        if (dateStr === todayStr) cls += ' cal-today';
        if (dateStr === this._selectedDate) cls += ' cal-selected';
        if (dayOfWeek === 0 || holiday) cls += ' cal-sun';
        else if (dayOfWeek === 6) cls += ' cal-sat';
        if (events.length > 0) cls += ' cal-has-event';

        html += `<div class="${cls}" data-cal-date="${dateStr}" title="${LS.Helpers.escapeHtml(this._getDateTooltip(dateStr, events))}">`;
        html += '<div class="cal-date-head">';
        html += `<span class="cal-date-num">${day}</span>`;
        if (events.length) html += `<span class="cal-date-count">${events.length}</span>`;
        html += '</div>';
        html += '<div class="cal-preview-list">';
        previewEvents.forEach((event) => {
          const palette = this._getEventPalette(event);
          html += `<div class="cal-preview-item" style="background:${palette.bg};color:${palette.fg}" title="${LS.Helpers.escapeHtml(event.name)}">${LS.Helpers.escapeHtml(event.name)}</div>`;
        });
        if (moreCount > 0) html += `<div class="cal-preview-more">+${moreCount}</div>`;
        html += '</div></div>';
      }

      html += '</div>';
      grid.innerHTML = html;
      this._bindDateCells(grid);
    },

    _renderWeekGrid() {
      const grid = document.getElementById('cal-grid');
      if (!grid) return;

      const start = getWeekStart(this._selectedDate);
      const todayStr = toDateString(new Date());
      const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));

      let html = '<div class="cal-week-grid">';
      days.forEach((date) => {
        const dateStr = toDateString(date);
        const events = this._getEventsForDate(dateStr);
        const day = date.getDay();
        const holiday = LS.Holidays.isHoliday(dateStr);
        let cls = 'cal-week-day';
        if (dateStr === this._selectedDate) cls += ' selected';
        if (dateStr === todayStr) cls += ' today';
        if (day === 0 || holiday) cls += ' sun';
        if (day === 6) cls += ' sat';

        html += `<div class="${cls}" data-cal-date="${dateStr}">`;
        html += `<div class="cal-week-head"><strong>${LS.Helpers.DAY_NAMES_FULL[day]}</strong><span>${date.getMonth() + 1}/${date.getDate()}</span></div>`;
        if (!events.length) {
          html += '<div class="cal-week-empty">표시할 일정이 없습니다.</div>';
        } else {
          html += '<div class="cal-week-list">';
          events.slice(0, 5).forEach((event) => {
            const palette = this._getEventPalette(event);
            html += `<div class="cal-week-item" style="background:${palette.bg};color:${palette.fg}">${LS.Helpers.escapeHtml(this._getCompactEventLabel(event))}</div>`;
          });
          if (events.length > 5) {
            html += `<div class="cal-week-more">+${events.length - 5}</div>`;
          }
          html += '</div>';
        }
        html += '</div>';
      });
      html += '</div>';

      grid.innerHTML = html;
      this._bindDateCells(grid);
    },

    _renderListView() {
      const grid = document.getElementById('cal-grid');
      if (!grid) return;

      const start = cloneDate(this._selectedDate);
      const days = Array.from({ length: LIST_WINDOW_DAYS }, (_, index) => addDays(start, index));

      let html = '<div class="cal-list-view">';
      days.forEach((date) => {
        const dateStr = toDateString(date);
        const events = this._getEventsForDate(dateStr);
        const holiday = LS.Holidays.isHoliday(dateStr);
        const day = date.getDay();
        let cls = 'cal-list-day';
        if (dateStr === this._selectedDate) cls += ' selected';
        if (holiday || day === 0) cls += ' sun';
        if (day === 6) cls += ' sat';

        html += `<div class="${cls}" data-cal-date="${dateStr}">`;
        html += '<div class="cal-list-head">';
        html += `<strong>${this._formatSelectedDateLabel(dateStr)}</strong>`;
        html += `<span>${events.length}건</span>`;
        html += '</div>';

        if (!events.length) {
          html += '<div class="cal-list-empty">등록된 일정이 없습니다.</div>';
        } else {
          html += '<div class="cal-list-items">';
          events.forEach((event) => {
            const palette = this._getEventPalette(event);
            html += `
              <div class="cal-list-item" style="border-left-color:${palette.fg}">
                <span class="cal-list-chip" style="background:${palette.bg};color:${palette.fg}">${this._getSourceLabel(event.source, event)}</span>
                <strong>${LS.Helpers.escapeHtml(event.name)}</strong>
                <small>${LS.Helpers.escapeHtml(this._getEventTimeLabel(event) || '종일')}</small>
              </div>
            `;
          });
          html += '</div>';
        }
        html += '</div>';
      });
      html += '</div>';

      grid.innerHTML = html;
      this._bindDateCells(grid);
    },

    _bindDateCells(container) {
      container.querySelectorAll('[data-cal-date]').forEach((cell) => {
        cell.addEventListener('click', () => {
          this._selectedDate = cell.dataset.calDate;
          this._syncCurrentMonthWithSelected();
          this.render();
        });
      });
    },

    _renderSelectedDatePanel() {
      const panel = document.getElementById('cal-events');
      if (!panel) return;

      const events = this._getEventsForDate(this._selectedDate);
      const dateLabel = this._formatSelectedDateLabel(this._selectedDate);

      let html = '<div class="cal-detail-head">';
      html += '<div class="cal-detail-head-main">';
      html += `<div><div class="cal-detail-title">${dateLabel}</div><div class="cal-detail-subtitle">학교 일정, 천문 일정, 개인 일정, Google 연동 일정과 할 일을 함께 확인합니다.</div></div>`;
      html += '<div class="widget-filter-group cal-filter-group">';
      html += `<button class="widget-filter-btn ${this._filter === 'all' ? 'active' : ''}" data-cal-filter="all">전체</button>`;
      html += `<button class="widget-filter-btn ${this._filter === 'school' ? 'active' : ''}" data-cal-filter="school">학교</button>`;
      html += `<button class="widget-filter-btn ${this._filter === 'personal' ? 'active' : ''}" data-cal-filter="personal">개인</button>`;
      html += '</div></div>';
      html += '<button class="cal-detail-add" id="cal-detail-add-btn">+ 일정 추가</button>';
      html += '</div>';

      if (!events.length) {
        html += '<div class="cal-detail-empty">선택한 날짜에 표시할 일정이 없습니다.</div>';
        panel.innerHTML = html;
        this._bindDetailPanel(panel);
        return;
      }

      html += '<div class="cal-detail-list">';
      events.forEach((event) => {
        const palette = this._getEventPalette(event);
        const timeLabel = this._getEventTimeLabel(event);
        const canEdit = ['schedule', 'task', 'countdown'].includes(event.source);
        const canOpenExternal = !canEdit && Boolean(event.link);
        const linkedLabels = canEdit ? LS.Records.getFacetLabels(event.record, [event.facet]) : [];
        const tagLabels = canEdit ? LS.Records.getTagLabels(event.record) : [];
        const repeatEnabled = event.record?.[event.facet || 'schedule']?.repeat?.enabled;
        const syncEnabled = canEdit && event.record?.task?.syncSchedule && event.record?.schedule?.enabled;

        html += `<div class="cal-detail-card cal-detail-${event.source}" data-source="${event.source}" data-record-id="${event.recordId || ''}" data-facet="${event.facet || ''}">`;
        html += `<div class="cal-detail-chip" style="background:${palette.bg};color:${palette.fg}">${this._getSourceLabel(event.source, event)}</div>`;
        html += `<div class="cal-detail-name">${LS.Helpers.escapeHtml(event.name)}</div>`;
        if (timeLabel) html += `<div class="cal-detail-time">${LS.Helpers.escapeHtml(timeLabel)}</div>`;
        if (event.description) html += `<div class="cal-detail-desc">${LS.Helpers.escapeHtml(event.description)}</div>`;

        if ((canEdit && event.record?.category) || linkedLabels.length || tagLabels.length || repeatEnabled || syncEnabled) {
          html += '<div class="record-badge-row">';
          if (canEdit && event.record?.category) {
            html += `<span class="record-category-badge">${LS.Helpers.escapeHtml(event.record.category)}</span>`;
          }
          if (repeatEnabled) {
            html += '<span class="record-facet-badge">반복</span>';
          }
          if (syncEnabled) {
            html += '<span class="record-facet-badge">일정연결</span>';
          }
          linkedLabels.forEach((label) => {
            html += `<span class="record-facet-badge">${LS.Helpers.escapeHtml(label)}</span>`;
          });
          tagLabels.forEach((label) => {
            html += `<span class="record-tag-badge">${LS.Helpers.escapeHtml(label)}</span>`;
          });
          html += '</div>';
        }

        if (canEdit || canOpenExternal) {
          html += '<div class="cal-detail-actions">';
          if (canEdit) {
            html += `<button class="cal-detail-btn" data-action="edit" data-record-id="${event.recordId}" data-facet="${event.facet}">편집</button>`;
            html += `<button class="cal-detail-btn" data-action="convert-task" data-record-id="${event.recordId}">할 일</button>`;
            html += `<button class="cal-detail-btn" data-action="convert-schedule" data-record-id="${event.recordId}">일정</button>`;
            html += `<button class="cal-detail-btn" data-action="convert-countdown" data-record-id="${event.recordId}">D-Day</button>`;
            html += `<button class="cal-detail-btn" data-action="${event.record?.bookmark?.enabled ? 'open-link' : 'convert-bookmark'}" data-record-id="${event.recordId}">${event.record?.bookmark?.enabled ? '링크' : '북마크'}</button>`;
            html += `<button class="cal-detail-btn danger" data-action="delete" data-record-id="${event.recordId}" data-facet="${event.facet}">삭제</button>`;
          }
          if (canOpenExternal) {
            html += `<button class="cal-detail-btn" data-action="open-external" data-link="${LS.Helpers.escapeHtml(event.link)}">${LS.Helpers.escapeHtml(event.linkLabel || (event.source === 'google' ? 'Google 열기' : '자세히 보기'))}</button>`;
          }
          html += '</div>';
        }
        html += '</div>';
      });
      html += '</div>';

      panel.innerHTML = html;
      this._bindDetailPanel(panel);
    },

    _bindDetailPanel(panel) {
      document.getElementById('cal-detail-add-btn')?.addEventListener('click', () => this._openEventEditor(this._selectedDate));

      panel.querySelectorAll('[data-cal-filter]').forEach((button) => {
        button.addEventListener('click', () => {
          this._filter = button.dataset.calFilter || 'all';
          this.render();
        });
      });

      panel.querySelectorAll('[data-action="edit"]').forEach((button) => {
        button.addEventListener('click', () => this._editUserEvent(button.dataset.recordId, button.dataset.facet));
      });

      panel.querySelectorAll('[data-action="convert-task"]').forEach((button) => {
        button.addEventListener('click', () => LS.Records.convertRecord(button.dataset.recordId, 'task'));
      });

      panel.querySelectorAll('[data-action="convert-schedule"]').forEach((button) => {
        button.addEventListener('click', () => LS.Records.convertRecord(button.dataset.recordId, 'schedule'));
      });

      panel.querySelectorAll('[data-action="convert-countdown"]').forEach((button) => {
        button.addEventListener('click', () => LS.Records.convertRecord(button.dataset.recordId, 'countdown'));
      });

      panel.querySelectorAll('[data-action="convert-bookmark"]').forEach((button) => {
        button.addEventListener('click', () => LS.Records.convertRecord(button.dataset.recordId, 'bookmark'));
      });

      panel.querySelectorAll('[data-action="open-link"]').forEach((button) => {
        button.addEventListener('click', () => LS.Records.openBookmark(button.dataset.recordId));
      });

      panel.querySelectorAll('[data-action="open-external"]').forEach((button) => {
        button.addEventListener('click', () => {
          if (button.dataset.link) {
            window.open(button.dataset.link, '_blank', 'noopener,noreferrer');
          }
        });
      });

      panel.querySelectorAll('[data-action="delete"]').forEach((button) => {
        button.addEventListener('click', () => this._deleteUserEvent(button.dataset.recordId, button.dataset.facet));
      });
    },

    _getEventsForDate(dateStr) {
      const events = [];
      const includeSchool = this._filter !== 'personal';
      const includePersonal = this._filter !== 'school';
      const holiday = LS.Holidays.isHoliday(dateStr);

      if (includeSchool && holiday) {
        events.push({
          id: `holiday-${dateStr}`,
          source: 'holiday',
          date: dateStr,
          name: holiday.name,
          description: ''
        });
      }

      if (includeSchool) {
        this._astronomySchedule.forEach((item) => {
          if (item.date === dateStr) {
            events.push(item);
          }
        });

        const neisDate = dateStr.replace(/-/g, '');
        this._schoolSchedule.forEach((item) => {
          if (item.date === neisDate) {
            events.push({
              id: `school-${item.date}-${item.eventName}`,
              source: 'school',
              date: dateStr,
              name: item.eventName,
              description: item.eventContent || ''
            });
          }
        });
      }

      if (includePersonal) {
        LS.Records.getCalendarEntries(dateStr).forEach((entry) => {
          events.push(entry);
        });
        LS.GoogleWorkspace?.getCalendarEntries?.(dateStr)?.forEach((entry) => {
          events.push(entry);
        });
      }

      return events.sort((a, b) => {
        const sourceDiff = (SOURCE_ORDER[a.source] ?? 9) - (SOURCE_ORDER[b.source] ?? 9);
        if (sourceDiff !== 0) return sourceDiff;

        const timeA = a.startTime ? LS.Helpers.timeToMinutes(a.startTime) : 9999;
        const timeB = b.startTime ? LS.Helpers.timeToMinutes(b.startTime) : 9999;
        if (timeA !== timeB) return timeA - timeB;

        return a.name.localeCompare(b.name, 'ko');
      });
    },

    _getDateTooltip(dateStr, events) {
      const names = events.map((event) => event.name);
      return names.length ? `${dateStr} - ${names.join(', ')}` : dateStr;
    },

    _formatSelectedDateLabel(dateStr) {
      const [year, month, day] = String(dateStr).split('-').map((value) => parseInt(value, 10));
      const date = new Date(year, (month || 1) - 1, day || 1);
      return `${year}년 ${month}월 ${day}일 ${LS.Helpers.DAY_NAMES_FULL[date.getDay()]}`;
    },

    _getSourceLabel(source, event) {
      if (source === 'holiday') return '공휴일';
      if (source === 'astronomy') return '천문';
      if (source === 'school') return '학교 일정';
      if (source === 'google') return 'Google 일정';
      if (source === 'googleTask') return event?.done ? 'Google 완료' : 'Google 할 일';
      if (source === 'schedule') return '일정';
      if (source === 'task') return event?.done ? '완료된 할 일' : '할 일';
      return 'D-Day';
    },

    _getEventPalette(event) {
      if (event.source === 'holiday') {
        return { bg: '#FFEBEE', fg: '#C62828' };
      }
      if (event.source === 'astronomy') {
        if (event.astronomyKind === 'meteor') {
          return { bg: 'rgba(255, 179, 71, 0.18)', fg: '#C77800' };
        }
        if (event.astronomyKind === 'eclipse') {
          return { bg: 'rgba(239, 83, 80, 0.16)', fg: '#C62828' };
        }
        if (event.astronomyKind === 'planetary') {
          return { bg: 'rgba(66, 133, 244, 0.16)', fg: '#1A73E8' };
        }
        if (event.astronomyKind === 'solarTerm') {
          return { bg: 'rgba(38, 166, 154, 0.15)', fg: '#00897B' };
        }
        return { bg: 'rgba(92, 107, 192, 0.14)', fg: '#3949AB' };
      }
      if (event.source === 'school') {
        return { bg: 'rgba(77, 171, 247, 0.14)', fg: 'var(--theme-accent)' };
      }
      if (event.source === 'google') {
        return {
          bg: hexToRgba(event.color || '#4285F4', 0.16),
          fg: event.color || '#1A73E8'
        };
      }
      if (event.source === 'googleTask') {
        return { bg: 'rgba(52, 168, 83, 0.14)', fg: '#137333' };
      }
      return LS.Records.getColorMeta(event.color);
    },

    _getEventTimeLabel(event) {
      if (event.source === 'countdown') return '기준일';
      if (event.source === 'googleTask') return event.done ? '완료됨' : 'Google Tasks 마감';
      if (event.source === 'task' && event.done) return '완료됨';
      if (!event.startTime && !event.endTime) {
        return event.source === 'task' ? '마감일' : '종일';
      }
      if (event.startTime && event.endTime) {
        return `${event.startTime} - ${event.endTime}`;
      }
      return event.startTime || event.endTime || '';
    },

    _getCompactEventLabel(event) {
      const time = this._getEventTimeLabel(event);
      if (!time || time === '종일' || time === '마감일' || time === '기준일' || time === 'Google Tasks 마감' || time === '완료됨') {
        return event.name;
      }
      return `${time} ${event.name}`;
    },

    async _openEventEditor(prefillDate) {
      await LS.Records.openRecordEditor({
        mode: 'schedule',
        presetDate: prefillDate || this._selectedDate
      });
    },

    async _editUserEvent(recordId, facet) {
      await LS.Records.openRecordEditor({ recordId, mode: facet || 'schedule' });
    },

    async _deleteUserEvent(recordId, facet) {
      const confirmed = await LS.Helpers.confirmModal('일정 삭제', '이 항목을 목록에서 삭제하시겠습니까?');
      if (!confirmed) return;
      await LS.Records.removeFacet(recordId, facet || 'schedule');
    },

    refresh() {
      this.loadSchedule().then(() => this.render());
    }
  };
})();
