# Mini Games

Place each future minigame under `js/minigames/games/`.

Recommended layout:

```text
js/minigames/games/your-game/
  index.html
  main.js
  style.css
```

Then register it from a script loaded after `js/minigames/hub.js` and before `js/app.js`.

Iframe-style registration:

```js
window.LivelySam.MinigamesHub.registerGame({
  id: 'your-game',
  title: 'My Game',
  icon: '🕹️',
  status: 'ready',
  launchType: 'iframe',
  entry: 'js/minigames/games/your-game/index.html',
  description: 'Legacy HTML game',
  scoreLabel: 'High score',
  rankingLabel: 'Top score leaderboard'
});
```

Inline mount-style registration:

```js
window.LivelySam.MinigamesHub.registerGame({
  id: 'your-game-inline',
  title: 'My Inline Game',
  icon: '🎮',
  status: 'ready',
  launchType: 'mount',
  mount(container) {
    container.innerHTML = '<div>Game UI</div>';
    return () => {
      container.innerHTML = '';
    };
  }
});
```
