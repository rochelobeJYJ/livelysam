(function () {
  'use strict';

  // 공개 배포용 명예의 전당 설정입니다.
  // Firebase Web App 설정값은 비밀키가 아니므로, 별도 미니게임 전용 Firebase 프로젝트라면
  // 이 파일에 넣어도 됩니다. 실제 비밀값(서비스 계정 키, reCAPTCHA secret 등)은 절대 넣지 마세요.
  window.LivelySamPublicConfig = window.LivelySamPublicConfig || {};
  window.LivelySamPublicConfig.leaderboard = window.LivelySamPublicConfig.leaderboard || {
    minigameLeaderboardProvider: 'firebase',
    minigameSeasonId: 'season-1',
    firebaseApiKey: 'AIzaSyAMgKlCyWw8VZQGJxEyuRE1c_ZOCpDVkVE',
    firebaseAuthDomain: 'jworld-cf60e.firebaseapp.com',
    firebaseProjectId: 'jworld-cf60e',
    firebaseStorageBucket: 'jworld-cf60e.firebasestorage.app',
    firebaseMessagingSenderId: '1096858162907',
    firebaseAppId: '1:1096858162907:web:6af74322cfed32e8365efe',
    firebaseMeasurementId: 'G-C9K7YT9L1M'
  };
})();
