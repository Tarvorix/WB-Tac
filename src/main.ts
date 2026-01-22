import { Game } from './Game';

async function main(): Promise<void> {
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
  const loadingElement = document.getElementById('loading');

  if (!canvas) {
    console.error('Canvas element #renderCanvas not found');
    return;
  }

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('gesturestart', (e) => {
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('gesturechange', (e) => {
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('gestureend', (e) => {
    e.preventDefault();
  }, { passive: false });

  try {
    const game = new Game(canvas);

    game.onLoadProgress((progress) => {
      if (loadingElement) {
        loadingElement.textContent = `Loading... ${Math.round(progress.percentage)}%`;
      }
    });

    await game.initialize();

    if (loadingElement) {
      loadingElement.classList.add('hidden');
    }

    game.start();

    canvas.focus();

    canvas.addEventListener('click', () => {
      canvas.focus();
    });

    (window as unknown as { game: Game }).game = game;

  } catch (error) {
    console.error('Failed to initialize game:', error);
    if (loadingElement) {
      loadingElement.textContent = 'Failed to load game. Please refresh.';
      loadingElement.style.color = 'red';
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
