import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  headless: true
});

const page = await browser.newPage();

try {
  await page.goto('http://localhost:8000/games/kudbee-angrybirds/index.html', {
    waitUntil: 'domcontentloaded'
  });

  // Wait for game and KAB to initialize
  await page.waitForFunction(() => window.KABGame && window.KAB, { timeout: 15000 });

  // Give it a moment for the first frame to render
  await page.waitForTimeout(1000);

  // Check initial game state
  const initialState = await page.evaluate(() => {
    const game = window.KABGame;
    const ui = window.KAB.UI;
    return {
      hasGame: !!game,
      screen: game?.screen,
      buttonCount: ui?.buttons?.length || 0
    };
  });

  console.log('Initial game state:', JSON.stringify(initialState, null, 2));

  // Navigate to play screen first to get to the actual game
  console.log('Navigating to play screen...');
  await page.click('canvas', { position: { x: 480, y: 300 } }); // Click to start
  await page.waitForTimeout(500);

  // Check state after starting
  const playState = await page.evaluate(() => {
    const game = window.KABGame;
    const ui = window.KAB.UI;
    return {
      screen: game?.screen,
      worldActive: !!game?.world,
      buttonCount: ui?.buttons?.length || 0,
      buttons: (ui?.buttons || []).map((b, i) => ({
        index: i,
        id: b.id,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h
      }))
    };
  });

  console.log('Play screen state:', JSON.stringify(playState, null, 2));

  // Now click on canvas center (not on pause button)
  console.log('Clicking center canvas...');
  await page.click('canvas', { position: { x: 200, y: 400 } });
  await page.waitForTimeout(500);

  // Check if game is still in play or paused
  const afterClickState = await page.evaluate(() => {
    const game = window.KABGame;
    return {
      screen: game?.screen
    };
  });

  console.log('After canvas click:', JSON.stringify(afterClickState, null, 2));

  // Test hitting the pause button directly
  console.log('Clicking pause button...');
  await page.click('canvas', { position: { x: 926, y: 36 } });
  await page.waitForTimeout(500);

  const afterPauseClickState = await page.evaluate(() => {
    const game = window.KABGame;
    return {
      screen: game?.screen
    };
  });

  console.log('After pause button click:', JSON.stringify(afterPauseClickState, null, 2));

} catch (e) {
  console.error('Error:', e.message);
} finally {
  await browser.close();
}
