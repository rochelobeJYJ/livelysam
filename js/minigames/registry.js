(function () {
  'use strict';

  const hub = window.LivelySam?.MinigamesHub;
  if (!hub?.registerGame) return;
  const TOP_THREE_HALL_NOTICE = '개인당 최고 점수 3개를 기록합니다.';

  const games = [
    {
      id: 'dino-run-1',
      seriesId: 'dino-run',
      seriesTitle: 'Dino Run',
      seriesDescription: '기본, 확장, 하드 모드를 한곳에서 바로 플레이할 수 있습니다.',
      seriesIcon: '🦖',
      title: 'Dino Run',
      icon: '🦖',
      status: 'ready',
      launchType: 'iframe',
      entry: 'js/minigames/games/DinoRun1.html',
      description: '가장 기본이 되는 클래식 공룡 러닝 모드입니다.',
      scoreLabel: '생존 점수',
      rankingLabel: 'Firebase Firestore 명예의 전당',
      tags: ['firebase', 'hall-of-fame']
    },
    {
      id: 'dino-run-2',
      seriesId: 'dino-run',
      seriesTitle: 'Dino Run',
      seriesDescription: '기본, 확장, 하드 모드를 한곳에서 바로 플레이할 수 있습니다.',
      seriesIcon: '🦖',
      title: 'Dino Run 2',
      icon: '🌵',
      status: 'ready',
      launchType: 'iframe',
      entry: 'js/minigames/games/DinoRun2.html',
      description: '장애물 패턴이 확장된 두 번째 공룡 러닝 모드입니다.',
      scoreLabel: '생존 점수',
      rankingLabel: 'Firebase Firestore 명예의 전당',
      tags: ['firebase', 'hall-of-fame']
    },
    {
      id: 'dino-run-hard',
      seriesId: 'dino-run',
      seriesTitle: 'Dino Run',
      seriesDescription: '기본, 확장, 하드 모드를 한곳에서 바로 플레이할 수 있습니다.',
      seriesIcon: '🦖',
      title: 'Dino Run Hard',
      icon: '🔥',
      status: 'ready',
      launchType: 'iframe',
      entry: 'js/minigames/games/DinoRunHard.html',
      description: '속도와 난도가 높은 하드 모드입니다.',
      scoreLabel: '하드 모드 점수',
      rankingLabel: 'Firebase Firestore 명예의 전당',
      tags: ['firebase', 'hall-of-fame', 'hard']
    },
    {
      id: 'wing-tap-1',
      seriesId: 'wing-tap',
      seriesTitle: 'Wing Tap',
      seriesDescription: '클래식, 확장, 보스전을 같은 흐름 안에서 고를 수 있습니다.',
      seriesIcon: '🐦',
      title: 'Wing Tap Classic',
      icon: '🐦',
      status: 'ready',
      launchType: 'iframe',
      entry: 'js/minigames/games/WingTap1.html',
      description: '가장 기본 조작의 비행 탭 게임입니다.',
      scoreLabel: '비행 점수',
      rankingLabel: 'Firebase Firestore 명예의 전당',
      tags: ['firebase', 'hall-of-fame']
    },
    {
      id: 'wing-tap-2',
      seriesId: 'wing-tap',
      seriesTitle: 'Wing Tap',
      seriesDescription: '클래식, 확장, 보스전을 같은 흐름 안에서 고를 수 있습니다.',
      seriesIcon: '🐦',
      title: 'Wing Tap 2',
      icon: '⚡',
      status: 'ready',
      launchType: 'iframe',
      entry: 'js/minigames/games/WingTap2.html',
      description: '속도와 장애물이 강화된 확장 비행 모드입니다.',
      scoreLabel: '비행 점수',
      rankingLabel: 'Firebase Firestore 명예의 전당',
      tags: ['firebase', 'hall-of-fame']
    },
    {
      id: 'wing-boss',
      seriesId: 'wing-tap',
      seriesTitle: 'Wing Tap',
      seriesDescription: '클래식, 확장, 보스전을 같은 흐름 안에서 고를 수 있습니다.',
      seriesIcon: '🐦',
      title: 'Wing Boss',
      icon: '👾',
      status: 'ready',
      launchType: 'iframe',
      entry: 'js/minigames/games/WingBoss.html',
      description: '보스전 중심의 비행 배틀 모드입니다.',
      scoreLabel: '보스전 점수',
      rankingLabel: 'Firebase Firestore 명예의 전당',
      tags: ['firebase', 'hall-of-fame', 'boss']
    },
    {
      id: 'parcel-stack',
      seriesId: 'parcel-stack',
      seriesTitle: 'Parcel Stack',
      seriesDescription: '짧게 플레이하면서 정확한 타이밍과 균형 감각을 겨루는 적재 게임입니다.',
      seriesIcon: 'PS',
      title: 'Parcel Stack',
      icon: 'PK',
      status: 'ready',
      launchType: 'iframe',
      entry: 'js/minigames/games/ParcelStack.html',
      description: '움직이는 상자를 떨어뜨려 배송 카트 위에 최대한 오래 쌓아 올리세요.',
      scoreLabel: '적재 점수',
      rankingLabel: 'Firebase Firestore 명예의 전당',
      leaderboardMode: 'all-scores',
      hallNotice: 'Parcel Stack는 개인당 최고 점수 3개만 기록합니다.',
      tags: ['firebase', 'hall-of-fame', 'new']
    },
    {
      id: 'lane-dash',
      seriesId: 'lane-dash',
      seriesTitle: 'Lane Dash',
      seriesDescription: '짧게 반복 플레이하기 좋은 3레인 회피 아케이드입니다.',
      seriesIcon: '🚘',
      title: 'Lane Dash',
      icon: '🚘',
      status: 'ready',
      launchType: 'iframe',
      entry: 'js/minigames/games/LaneDash.html',
      description: '레인을 바꾸며 장벽을 피하고 에너지 코어를 먹는 신작입니다.',
        scoreLabel: '질주 점수',
        rankingLabel: 'Firebase Firestore 명예의 전당',
        leaderboardMode: 'all-scores',
        hallNotice: 'Lane Dash는 개인당 최고 점수 3개만 기록합니다.',
        tags: ['firebase', 'hall-of-fame', 'new']
      }
  ];

  games.forEach((game) => {
    hub.registerGame({
      ...game,
      leaderboardMode: 'all-scores',
      hallNotice: TOP_THREE_HALL_NOTICE
    });
  });
})();
