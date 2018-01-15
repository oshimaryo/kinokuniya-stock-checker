const puppeteer = require('puppeteer');
const url = process.env.URL;

const wait = 1000;

// https://qiita.com/syuilo/items/0800d7e44e93203c7285
process.on('unhandledRejection', console.dir);

if (url == "") {
  process.abort("need URL");
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 300
  });
  const page = await browser.newPage();
  await page.setViewport({width: 1080, height: 1080});
  await page.goto(url, {waitUntil: 'networkidle2'}); // 指定したURLを開く
  await page.click(".shopStockButton2");
  await page.waitFor(wait * 2);

  let stocker = 0;
  const stockButtons = await page.$$("[alt^='在庫を確認する']"); // 「在庫を確認する」
  console.log(`店舗数: ${stockButtons.length}`);
  await page.waitFor(wait);
  let i = 0;
  while(true) {
    const stockButtons = await page.$$(`[alt^='在庫を確認する']`);
    await stockButtons[i].click();
    await　page.waitFor(wait * 3);
    stocker += await checkStock(page);
    await page.goBack({waitUntil: 'networkidle2'});
    i++;

    if(i >= stockButtons.length) break;
  }

  if (stocker === 0) console.log('在庫はありませんでした');
  await browser.close();
})();


async function checkStock(page) {
  const statusEl = await page.$(".address b:nth-child(1)").catch(err => { // 在庫状況
    console.warn(err);
  });
  const status = await page.evaluate(el => el.textContent, statusEl);
  console.log(status);
  if (!status.includes("× 在庫なし")) {
    const shopNameEl = await page.$(".shop_name").catch(err => { // 店名
      console.warn(err);
    });
    const shopName = await page.evaluate(el => el.textContent, shopNameEl);
    console.log(`${shopName}: ${status}`);
    return 1;
  }
  return 0;
}
