const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER [' + msg.type() + ']:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle0' });
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Try to manually create VOID to see if assignment works
  const result = await page.evaluate(() => {
    try {
      window.VOID = { test: 'works' };
      return 'assignment worked';
    } catch (e) {
      return 'assignment failed: ' + e.message;
    }
  });
  console.log('Manual assignment:', result);
  
  const voidCheck = await page.evaluate(() => window.VOID);
  console.log('VOID after manual:', voidCheck);
  
  await browser.close();
})().catch(e => console.error('Error:', e));
