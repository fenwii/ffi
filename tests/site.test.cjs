const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { chromium } = require('playwright');
let browser, server, baseURL, context, page, errors;
const root = path.resolve(__dirname, '..');

before(async () => {
  server = spawn('python3', ['-u', '-c', "from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler\ns=ThreadingHTTPServer(('127.0.0.1',0),SimpleHTTPRequestHandler)\nprint(s.server_address[1],flush=True)\ns.serve_forever()"], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  baseURL = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Test HTTP server did not start')), 10000);
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Test server exited: ${code}`)); });
    server.stdout.on('data', chunk => { output += chunk; if (/^\d+\n/.test(output)) { clearTimeout(timer); resolve(`http://127.0.0.1:${parseInt(output, 10)}`); } });
    server.stderr.resume();
  });
  browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {}), headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); server?.kill(); });
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage(); errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL);
});
afterEach(async () => { await context?.close(); assert.deepEqual(errors, [], 'No browser JavaScript errors'); });
async function openInquiry() { await page.locator('.nav-cta').click(); }
async function fillRequired() {
  await page.locator('#next-step').click();
  await page.locator('[name="company"]').fill('深圳示例企业');
  await page.locator('[name="goals"]').fill('希望围绕实际业务构建原型并验证效果。');
}
async function generate() { await page.locator('#inquiry-form button[type="submit"]').click(); }

test('all business entries open matching, substantive details and inquiry context', async () => {
  assert.equal(await page.locator('[data-detail-title]').count(), 16);
  for (const button of await page.locator('[data-detail-title]').all()) {
    const title = await button.getAttribute('data-detail-title');
    await button.click();
    assert.equal(await page.locator('#detail-title').textContent(), title);
    assert.equal(await page.locator('#detail-modules li').count(), 3);
    assert.equal(await page.locator('#detail-outcomes li').count(), 3);
    await page.locator('#detail-inquiry').click();
    assert.equal(await page.locator('[name="course"]').inputValue(), title);
    const type = await page.locator('[name="type"]').inputValue();
    const plan = await page.locator('[name="plan"]').inputValue();
    if (type === 'technology') assert.equal(plan, '技术项目 · 按需求报价');
    if (type === 'advisory') assert(plan.includes(title));
    await page.keyboard.press('Escape');
  }
});

test('topic category and text search combine, empty search resets', async () => {
  await page.locator('[data-filter="技术实战"]').click();
  assert.equal(await page.locator('.program-card:visible, .learning-grid article:visible').count(), 3);
  await page.locator('#course-search').fill('工具');
  assert.equal(await page.locator('.program-card:visible, .learning-grid article:visible').count(), 1);
  await page.locator('#course-search').fill('不存在的主题zzzz');
  assert(await page.locator('#course-empty').isVisible());
  await page.locator('#reset-search').click();
  assert.equal(await page.locator('.program-card:visible, .learning-grid article:visible').count(), 8);
  await page.locator('[data-filter="系统学习"]').click();
  assert.equal(await page.locator('.learning-grid article:visible').count(), 3);
  assert.equal(await page.locator('.program-card:visible').count(), 0);
});

test('direct public service link, share fallback and back navigation', async () => {
  await page.goto(`${baseURL}/#service/small-model`);
  assert.equal(await page.locator('#detail-title').textContent(), '小模型训练');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } }, configurable: true }));
  await page.locator('#share-detail').click();
  assert.equal(await page.locator('#share-url').inputValue(), 'https://openagix.com/#service/small-model');
  await page.keyboard.press('Escape');
  assert(!await page.locator('#detail-dialog').isVisible());
  await page.locator('[data-detail-title="AI 编程"]').click();
  await page.goBack();
  assert(!await page.locator('#detail-dialog').isVisible());
});

test('plan matching explains large hands-on groups and carries selection', async () => {
  await page.locator('#finder-goal').selectOption('prototype');
  await page.locator('#finder-audience').selectOption('leaders');
  await page.locator('#finder-size').fill('60');
  await page.locator('#plan-finder-form button[type="submit"]').click();
  assert((await page.locator('#finder-title').textContent()).includes('3.5'));
  assert((await page.locator('#finder-reason').textContent()).includes('分组'));
  await page.locator('#finder-inquiry').click();
  assert((await page.locator('[name="plan"]').inputValue()).includes('训练营'));
  assert.equal(await page.locator('[name="people"]').inputValue(), '60');
  await page.keyboard.press('Escape');
  await page.locator('#finder-size').fill('101');
  await page.locator('#plan-finder-form button[type="submit"]').click();
  assert(!await page.locator('#finder-result').isVisible());
  assert.equal(await page.locator('#finder-size').evaluate(el => el.checkValidity()), false);
  await page.locator('#finder-size').fill('25');
  for (const [goal, expected] of [['awareness', '2 万元'], ['business', '5 万元']]) {
    await page.locator('#finder-goal').selectOption(goal);
    await page.locator('#plan-finder-form button[type="submit"]').click();
    assert((await page.locator('#finder-title').textContent()).includes(expected));
  }
});

test('comparison is actionable and preserves plan and keyboard focus', async () => {
  await page.locator('#compare-plans').click();
  assert.equal(await page.locator('#compare-dialog table tbody tr').count(), 7);
  await page.locator('#compare-dialog [data-inquiry]').nth(2).click();
  assert((await page.locator('[name="plan"]').inputValue()).includes('企业定制'));
  await page.keyboard.press('Escape');
  assert(!await page.locator('#inquiry-dialog').isVisible());
  assert(!await page.locator('body').evaluate(el => el.classList.contains('modal-open')));
});

test('wizard rejects blank fields, past dates, invalid email and oversized cohorts', async () => {
  await openInquiry(); await page.locator('#next-step').click(); await generate();
  assert.equal(await page.locator('[aria-invalid="true"]').count(), 2);
  await page.locator('[name="company"]').fill('   '); await generate();
  assert((await page.locator('#company-error').textContent()).includes('请填写'));
  await page.locator('[name="company"]').fill('示例企业');
  await page.locator('[name="goals"]').fill('验证一个工作流');
  await page.locator('[name="people"]').fill('101');
  await page.locator('[name="date"]').fill('2020-01-01');
  await page.locator('.optional-contact summary').click();
  await page.locator('[name="contactMethod"]').selectOption('email');
  await page.locator('[name="contactValue"]').fill('invalid-email'); await generate();
  assert.equal(await page.locator('[aria-invalid="true"]').count(), 3);
  await page.locator('[name="people"]').fill('35');
  await page.locator('[name="date"]').fill('');
  await page.locator('[name="contactValue"]').fill('someone@example.com'); await generate();
  assert(await page.locator('#brief-result').isVisible());
  const text = await page.locator('#brief-text').inputValue();
  assert(text.includes('35')); assert(text.includes('someone@example.com')); assert(text.includes('尚未发送'));
});

test('inquiry persists across generic reopen, type changes exclude irrelevant training values', async () => {
  await openInquiry(); await fillRequired(); await page.locator('[name="people"]').fill('25');
  await page.keyboard.press('Escape'); await openInquiry();
  await page.locator('[name="type"]').selectOption('technology');
  await page.locator('[name="course"]').selectOption('小模型训练');
  await page.locator('#next-step').click();
  assert.equal(await page.locator('[name="company"]').inputValue(), '深圳示例企业');
  assert(!await page.locator('#people-label').isVisible()); await generate();
  assert(!(await page.locator('#brief-text').inputValue()).includes('单场预计人数'));
  await page.locator('#edit-brief').click(); await page.locator('#previous-step').click();
  await page.locator('[name="type"]').selectOption('advisory');
  await page.locator('[name="plan"]').selectOption('转化率顾问 · 项目约定 2%–5%');
  assert.equal(await page.locator('[name="course"]').inputValue(), '转化率顾问');
  await page.locator('#next-step').click(); await generate();
  assert((await page.locator('#brief-text').inputValue()).includes('比例计费'));
});

test('explicit drafts restore after reload, delete preserves edits, expired drafts are removed', async () => {
  await openInquiry(); await fillRequired();
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  await page.locator('#save-draft').click();
  await page.reload(); await openInquiry(); assert(await page.locator('#draft-notice').isVisible());
  await page.locator('#restore-draft').click();
  assert.equal(await page.locator('[name="company"]').inputValue(), '深圳示例企业');
  await page.locator('#delete-draft').click();
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.equal(await page.locator('[name="company"]').inputValue(), '深圳示例企业');
  await page.evaluate(() => localStorage.setItem('openagix-inquiry-v1', JSON.stringify({version:1,savedAt:Date.now()-8*86400000,values:{company:'expired'}})));
  await page.reload(); await openInquiry(); assert(!await page.locator('#draft-notice').isVisible());
  assert.equal(await page.evaluate(() => localStorage.length), 0);
});

test('renamed organization advisory preserves shared links and migrates saved inquiries', async () => {
  await page.goto(`${baseURL}/#service/native-value-advisor`);
  assert.equal(await page.locator('#detail-title').textContent(), '原生组织顾问');
  assert((await page.locator('#detail-modules').textContent()).includes('岗位职责'));
  assert.equal(await page.locator('#detail-price').textContent(), '30 万元 / 年');
  await page.keyboard.press('Escape');
  await page.evaluate(() => localStorage.setItem('openagix-inquiry-v1', JSON.stringify({
    version: 1, savedAt: Date.now(), values: {
      type: 'advisory', course: '原生最值顾问', plan: '原生最值顾问 · 30 万元/年',
      company: '组织升级团队', goals: '梳理组织与人机协作机制', city: '长沙'
    }
  })));
  await openInquiry();
  await page.locator('#restore-draft').click();
  assert.equal(await page.locator('[name="course"]').inputValue(), '原生组织顾问');
  assert.equal(await page.locator('[name="plan"]').inputValue(), '原生组织顾问 · 30 万元/年');
  assert.equal(await page.locator('[name="city"]').inputValue(), '长沙');
  await generate();
  const text = await page.locator('#brief-text').inputValue();
  assert(text.includes('原生组织顾问'));
  assert(!text.includes('原生最值顾问'));
  const mail = new URL(await page.locator('#email-brief').getAttribute('href'));
  assert.equal(mail.searchParams.get('body'), text);
});

test('blocked browser storage does not prevent finishing an inquiry', async () => {
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('storage blocked'); }; });
  await openInquiry(); await fillRequired(); await page.locator('#save-draft').click();
  assert((await page.locator('#form-status').textContent()).includes('无法保存'));
  await generate(); assert(await page.locator('#brief-result').isVisible());
});

test('exported text, encoded email, clipboard failures and print contain actual inquiry', async () => {
  await openInquiry(); await fillRequired();
  await page.locator('[name="goals"]').fill('研发需求 & 评估 <script>alert(1)</script>'); await generate();
  const text = await page.locator('#brief-text').inputValue();
  const mail = new URL(await page.locator('#email-brief').getAttribute('href'));
  assert.equal(mail.protocol, 'mailto:'); assert.equal(mail.searchParams.get('body'), text);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-brief').click()]);
  assert.equal(download.suggestedFilename(), '分微未来智能-合作需求单.txt');
  assert.equal((await fs.readFile(await download.path(), 'utf8')).replace(/^\uFEFF/, ''), text);
  await page.evaluate(() => { window.print = () => { window.printCalled = true; }; Object.defineProperty(navigator, 'clipboard', {value:{writeText:async()=>{throw new Error('denied')}},configurable:true}); });
  await page.locator('#copy-brief').click(); assert((await page.locator('#copy-status').textContent()).includes('手动复制'));
  await page.locator('#print-brief').click(); assert(await page.evaluate(() => window.printCalled));
  assert.equal(await page.locator('#print-area pre').textContent(), text);
  assert.equal(await page.locator('#print-area script').count(), 0);
  await page.emulateMedia({ media: 'print' });
  assert(await page.locator('#print-area').isVisible());
  assert(!await page.locator('main').isVisible());
});

test('mobile menu, clipboard success, FAQ and responsive dialogs', async () => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({width:390,height:844});
  await page.locator('.menu-toggle').click(); assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');
  await page.locator('.mobile-contact [data-copy-wechat]').click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()),'samirtan');
  await page.locator('#faq-search').fill('不存在的问题'); assert.equal(await page.locator('#faq-list details:visible').count(),0);
  await page.locator('#faq-search').fill('编程'); assert(await page.locator('#faq-list details:visible').count()>0);
  for (const width of [320,390,600,768,850,1024,1440]) {
    await page.setViewportSize({width,height:900});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),`page fits ${width}`);
    await openInquiry();
    assert(await page.locator('#inquiry-dialog').evaluate(el => el.scrollWidth<=el.clientWidth),`inquiry fits ${width}`);
    await page.keyboard.press('Escape');
  }
});

test('static content, assets, anchors and structured metadata work without JavaScript', async () => {
  for (const link of await page.locator('a[href^="#"]').evaluateAll(links=>links.map(link=>link.getAttribute('href')).filter(hash=>hash!=='#'))) assert(await page.locator(link).count(),link);
  for (const asset of ['/catalog.js','/app.js','/styles.css','/assets/公司业务说明.md','/robots.txt','/sitemap.xml']) assert.equal((await page.request.get(baseURL+asset)).status(),200,asset);
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://openagix.com/');
  const schema = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent()); assert.equal(schema.name,'分微未来智能');
  const noJS=await browser.newContext({javaScriptEnabled:false}); const fallback=await noJS.newPage(); await fallback.goto(baseURL);
  assert.equal(await fallback.locator('.program-card:visible, .learning-grid article:visible').count(),8);
  assert(await fallback.locator('.contact-methods a[href="mailto:samir.tan.it@gmail.com"]').isVisible());
  assert(!await fallback.locator('#course-discovery').isVisible()); await noJS.close();
});
