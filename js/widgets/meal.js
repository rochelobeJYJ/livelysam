(function () {
  'use strict';

  const LS = window.LivelySam = window.LivelySam || {};
  const WEEKDAY_LABELS = ['월', '화', '수', '목', '금'];

  function formatDateLabel(date) {
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  }

  function getMealWeekStart(baseDate = new Date()) {
    const anchor = new Date(baseDate);
    anchor.setHours(0, 0, 0, 0);
    if (anchor.getDay() === 0) {
      anchor.setDate(anchor.getDate() + 1);
    }
    return LS.NeisAPI.getMonday(anchor);
  }

  function getMealEmoji(type) {
    if (type === '조식') return '🍳';
    if (type === '중식') return '🍱';
    return '🌙';
  }

  function getMealOrder(type) {
    if (type === '조식') return 0;
    if (type === '중식') return 1;
    if (type === '석식') return 2;
    return 9;
  }

  LS.MealWidget = {
    _meals: [],
    _currentView: 'today',
    _bound: false,

    async init() {
      await this.loadMeals();
      this.render();
      if (!this._bound) {
        this._bound = true;
        this._bindEvents();
      }
    },

    async loadMeals() {
      const atpt = LS.Config.get('atptCode');
      const school = LS.Config.get('schoolCode');
      if (!atpt || !school) {
        this._meals = [];
        return;
      }

      const monday = getMealWeekStart(new Date());
      const weekKey = LS.Helpers.formatDate(monday, 'YYYYMMDD');
      const cacheKey = `cachedMeals:${LS.Config.getSchoolContextKey()}:${weekKey}`;

      try {
        this._meals = await LS.NeisAPI.getWeekMeals(atpt, school, monday);
        LS.Storage.set(cacheKey, this._meals);
      } catch (error) {
        console.error('[Meal] Failed to load meals:', error);
        this._meals = LS.Storage.get(cacheKey, []);
      }
    },

    _bindEvents() {
      document.querySelectorAll('.meal-tab-btn').forEach((button) => {
        button.addEventListener('click', (event) => {
          this._currentView = event.target.dataset.view;
          document.querySelectorAll('.meal-tab-btn').forEach((item) => item.classList.remove('active'));
          event.target.classList.add('active');
          this.render();
        });
      });
    },

    render() {
      const container = document.getElementById('meal-content');
      if (!container) return;

      if (!LS.Config.get('atptCode')) {
        container.innerHTML = '<div class="widget-empty"><p>학교 설정에서 학교를 검색해 주세요.</p></div>';
        return;
      }

      if (!this._meals.length) {
        container.innerHTML = '<div class="widget-empty"><p>이번 주 급식 정보가 없습니다.</p></div>';
        return;
      }

      const now = new Date();
      if (this._currentView === 'today') {
        this._renderDay(container, now, '오늘');
        return;
      }
      if (this._currentView === 'tomorrow') {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        this._renderDay(container, tomorrow, '내일');
        return;
      }
      this._renderWeek(container);
    },

    _renderDay(container, date, label) {
      const dateStr = LS.Helpers.formatDate(date, 'YYYYMMDD');
      const dayMeals = this._meals
        .filter((meal) => meal.date === dateStr)
        .sort((a, b) => getMealOrder(a.mealType) - getMealOrder(b.mealType));
      const compactDayView = Boolean(LS.Config.get('mealCompactDayView'));
      const showNutrition = Boolean(LS.Config.get('mealShowNutritionInfo')) && !compactDayView;

      if (!dayMeals.length) {
        container.innerHTML = `<div class="widget-empty meal-empty-message"><p>${label} 급식 정보가 없습니다.</p></div>`;
        return;
      }

      let html = `<div class="meal-date-label">${formatDateLabel(date)}</div>`;

      if (compactDayView) {
        html += '<div class="meal-day-stack is-simplified">';
        dayMeals.forEach((meal) => {
          const menuItems = LS.Helpers.parseMealMenu(meal.menu);
          const summary = this._getSimplifiedMealText(menuItems);
          const tooltip = menuItems.map((item) => item.name).join(', ');
          const calorie = LS.Helpers.parseCalorie(meal.calorie);

          html += '<div class="meal-card is-simplified">';
          html += `<div class="meal-type">${getMealEmoji(meal.mealType)} ${meal.mealType}</div>`;
          html += `<div class="meal-simplified-menu" title="${LS.Helpers.escapeHtml(tooltip || summary)}">${LS.Helpers.escapeHtml(summary)}</div>`;
          if (calorie) html += `<div class="meal-calorie">🔥 ${calorie}</div>`;
          html += '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
        return;
      }

      dayMeals.forEach((meal) => {
        const menuItems = LS.Helpers.parseMealMenu(meal.menu);
        const calorie = LS.Helpers.parseCalorie(meal.calorie);

        html += '<div class="meal-card">';
        html += `<div class="meal-type">${getMealEmoji(meal.mealType)} ${meal.mealType}</div>`;
        html += '<ul class="meal-menu-list">';

        menuItems.forEach((item) => {
          html += '<li class="meal-menu-item">';
          html += `<span class="meal-item-name">${LS.Helpers.escapeHtml(item.name)}</span>`;
          if (showNutrition && item.allergens.length > 0) {
            html += '<span class="meal-allergens">';
            item.allergens.forEach((allergen) => {
              const info = LS.Helpers.ALLERGENS[allergen];
              if (info) html += `<span class="allergen-badge" title="${info.name}">${info.emoji}</span>`;
            });
            html += '</span>';
          }
          html += '</li>';
        });

        html += '</ul>';
        if (showNutrition && calorie) html += `<div class="meal-calorie">🔥 ${calorie}</div>`;
        html += '</div>';
      });

      container.innerHTML = html;
    },

    _getCompactMealSummary(menuItems) {
      const names = (menuItems || []).map((item) => item.name).filter(Boolean);
      if (!names.length) return '메뉴 정보 없음';

      const visible = names.slice(0, 5);
      const hiddenCount = Math.max(0, names.length - visible.length);
      return hiddenCount ? `${visible.join(' · ')} 외 ${hiddenCount}개` : visible.join(' · ');
    },

    _getSimplifiedMealText(menuItems) {
      const names = (menuItems || []).map((item) => item.name).filter(Boolean);
      return names.length ? names.join(' · ') : '메뉴 정보 없음';
    },

    _getWeekSummary() {
      const monday = getMealWeekStart(new Date());
      const todayKey = LS.Helpers.formatDate(new Date(), 'YYYYMMDD');
      const summary = {
        lunchDays: 0,
        dinnerDays: 0,
        emptyDays: [],
        menuCounts: {},
        todayKey,
        monday
      };

      for (let offset = 0; offset < 5; offset += 1) {
        const date = new Date(monday);
        date.setDate(date.getDate() + offset);
        const dateStr = LS.Helpers.formatDate(date, 'YYYYMMDD');
        const dayMeals = this._meals.filter((meal) => meal.date === dateStr);
        const lunch = dayMeals.find((meal) => meal.mealType === '중식');
        const dinner = dayMeals.find((meal) => meal.mealType === '석식');

        if (lunch) summary.lunchDays += 1;
        if (dinner) summary.dinnerDays += 1;
        if (!dayMeals.length) summary.emptyDays.push(WEEKDAY_LABELS[offset]);

        dayMeals.forEach((meal) => {
          LS.Helpers.parseMealMenu(meal.menu).forEach((item) => {
            summary.menuCounts[item.name] = (summary.menuCounts[item.name] || 0) + 1;
          });
        });
      }

      summary.topMenus = Object.entries(summary.menuCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
        .slice(0, 6)
        .map(([name]) => name);

      return summary;
    },

    _renderWeek(container) {
      const monday = getMealWeekStart(new Date());
      const todayKey = LS.Helpers.formatDate(new Date(), 'YYYYMMDD');
      const weekSummary = this._getWeekSummary();

      let html = '<div class="meal-summary-card">';
      html += '<div class="meal-summary-head">';
      html += '<div class="meal-summary-title">이번 주 급식 요약</div>';
      html += `<div class="meal-summary-range">${formatDateLabel(monday)} 시작</div>`;
      html += '</div>';
      html += '<div class="meal-summary-grid">';
      html += `<div class="meal-summary-item"><strong>${weekSummary.lunchDays}일</strong><span>중식 제공</span></div>`;
      html += `<div class="meal-summary-item"><strong>${weekSummary.dinnerDays}일</strong><span>석식 제공</span></div>`;
      html += `<div class="meal-summary-item"><strong>${weekSummary.emptyDays.length ? weekSummary.emptyDays.join(', ') : '없음'}</strong><span>급식 없음</span></div>`;
      html += `<div class="meal-summary-item"><strong>${weekSummary.topMenus.length || 0}개</strong><span>대표 메뉴</span></div>`;
      html += '</div>';
      if (weekSummary.topMenus.length) {
        html += '<div class="meal-summary-tags">';
        weekSummary.topMenus.forEach((menu) => {
          html += `<span class="meal-summary-tag">${LS.Helpers.escapeHtml(menu)}</span>`;
        });
        html += '</div>';
      }
      html += '</div>';

      html += '<div class="meal-week-scroll">';
      html += '<div class="meal-week-grid">';

      for (let offset = 0; offset < 5; offset += 1) {
        const date = new Date(monday);
        date.setDate(date.getDate() + offset);
        const dateStr = LS.Helpers.formatDate(date, 'YYYYMMDD');
        const dayMeals = this._meals.filter((meal) => meal.date === dateStr);
        const lunch = dayMeals.find((meal) => meal.mealType === '중식');
        const dinner = dayMeals.find((meal) => meal.mealType === '석식');
        const isToday = todayKey === dateStr;

        html += `<div class="meal-week-day ${isToday ? 'meal-week-today' : ''}">`;
        html += `<div class="meal-week-day-label">${WEEKDAY_LABELS[offset]}</div>`;
        html += `<div class="meal-week-date">${formatDateLabel(date)}</div>`;

        if (lunch || dinner) {
          html += this._renderWeekMealBlock('중식', lunch, Boolean(lunch && dinner));
          if (lunch && dinner) html += '<div class="meal-week-divider"></div>';
          html += this._renderWeekMealBlock('석식', dinner, Boolean(lunch && dinner));
        } else {
          html += '<div class="meal-week-empty">급식 없음</div>';
        }

        html += '</div>';
      }

      html += '</div>';
      html += '</div>';
      container.innerHTML = html;
    },

    _renderWeekMealBlock(type, meal, showLabel) {
      if (!meal) return '';

      const items = LS.Helpers.parseMealMenu(meal.menu);
      const limit = showLabel ? 3 : 5;
      let html = '<div class="meal-week-items">';
      if (showLabel) {
        html += `<div class="meal-week-mealtype">${type}</div>`;
      }
      items.slice(0, limit).forEach((item) => {
        html += `<div class="meal-week-item">${LS.Helpers.escapeHtml(item.name)}</div>`;
      });
      if (items.length > limit) {
        html += `<div class="meal-week-item meal-more">+${items.length - limit}개</div>`;
      }
      html += '</div>';
      return html;
    },

    refresh() {
      this.loadMeals().then(() => this.render());
    }
  };
})();
