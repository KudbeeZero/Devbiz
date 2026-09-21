const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  
  // Listen for console messages
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle0' });
  await page.waitForSelector('#startBtn', { visible: true });
  
  console.log('Button found, clicking...');
  await page.click('#startBtn');
  
  await new Promise(r => setTimeout(r, 2000));
  
  const state = await page.evaluate(() => window.__kbTest.state());
  console.log('Game state after click:', state);
  
  await browser.close();
})().catch(e => console.error('Error:', e));
