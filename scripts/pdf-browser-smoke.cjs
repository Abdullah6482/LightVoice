// Optional smoke test: node scripts/pdf-browser-smoke.cjs <path-to-playwright>
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
async function main() {
  const { chromium } = require(process.argv[2] || 'playwright');
  const browser = await chromium.launch({ headless: true, ...(process.env.PDF_TEST_BROWSER_CHANNEL ? { channel: process.env.PDF_TEST_BROWSER_CHANNEL } : {}) });
  try {
    const page = await browser.newPage();
    const messages = []; const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.exposeFunction('nativeMessage', message => messages.push(JSON.parse(message)));
    await page.evaluate(() => { window.ReactNativeWebView = { postMessage: message => window.nativeMessage(message) }; });
    const moduleText = fs.readFileSync(path.join(__dirname, '../src/services/pdf/runtime.generated.ts'), 'utf8');
    await page.setContent(JSON.parse(moduleText.slice(moduleText.indexOf('export default ') + 15).trim().replace(/;$/, '')));
    await page.waitForFunction(() => typeof window.lightVoiceExtract === 'function');
    const stream = 'BT /F1 12 Tf 72 700 Td (Browser PDF extraction works.) Tj ET';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Count 1 /Kids [4 0 R] >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = '%PDF-1.4\n'; const offsets = [0];
    objects.forEach((value, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${value}\nendobj\n`; });
    const start = pdf.length;
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
    await page.evaluate(base64 => window.lightVoiceExtract(base64), Buffer.from(pdf).toString('base64'));
    const result = messages.find(message => message.type === 'result');
    assert.ok(result, JSON.stringify(messages));
    assert.match(result.book.chapters[0].text, /Browser PDF extraction works/);
    assert.deepEqual(requests, [], 'PDF import must not request remote resources');
    console.log('Browser PDF bundle: extracted text, bridge messages delivered, no network requests.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
