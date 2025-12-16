const puppeteer = require('puppeteer')
const { Cluster } = require('puppeteer-cluster')
const program = require('commander')

program.parse(process.argv)
const url = program.args[0]

// https://qiita.com/syuilo/items/0800d7e44e93203c7285
process.on('unhandledRejection', console.dir)

if (!url || url == '') {
  process.abort('need URL')
}

;(async () => {
  let storeWithStock = 0
  const { storesPageUrl, storesLength } = await getInfo(url)

  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 10,
    puppeteerOptions: {
      defaultViewport: { width: 1080, height: 1080 }
    }
  })

  await cluster.task(async ({ page, data: i }) => {
    page.setDefaultTimeout(60000)
    page.setDefaultNavigationTimeout(60000)
    await page.goto(storesPageUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector("[alt^='在庫を確認する']")
    const buttons = await page.$$("[alt^='在庫を確認する']") // 「在庫を確認する」

    // waitForNavigation を先に登録してから click を実行
    const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded' })
    await buttons[i].click()
    await navigationPromise

    // ナビゲーション後、要素が読み込まれるまで待機
    await page.waitForSelector('.address')
    storeWithStock += await checkStock(page)
  })

  for (let i = 0; i < storesLength; i++) {
    cluster.queue(i)
  }

  await cluster.idle()
  await cluster.close()

  if (storeWithStock === 0) console.log('在庫はありませんでした')
})()

async function getInfo(url) {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  page.setDefaultTimeout(60000) // 全体のタイムアウトを60秒に
  page.setDefaultNavigationTimeout(60000)
  await page.setViewport({ width: 1080, height: 1080 })
  await page.goto(url, { waitUntil: 'domcontentloaded' }) // 指定したURLを開く

  // ボタンが表示されるまで待機
  await page.waitForSelector('.shopStockButton2')
  await Promise.all([
    page.click('.shopStockButton2'),
    page.waitForNavigation({ waitUntil: 'domcontentloaded' })
  ])
  const storesPageUrl = page.url()

  const buttons = await page.$$("[alt^='在庫を確認する']") // 「在庫を確認する」
  console.log(`店舗数: ${buttons.length}`)

  await browser.close()

  return {
    storesPageUrl,
    storesLength: buttons.length
  }
}

async function checkStock(page) {
  try {
    const statusEl = await page.$('.address b:nth-child(1)')
    if (!statusEl) return 0

    const status = await page.evaluate((el) => el.textContent, statusEl)
    if (!status || status.includes('× 在庫なし') || status.includes('在庫非表示')) {
      return 0
    }

    const shopNameEl = await page.$('.shop_name')
    const shopName = shopNameEl
      ? await page.evaluate((el) => el.textContent, shopNameEl)
      : '不明'
    console.log(`${shopName}: ${status}`)
    return 1
  } catch (err) {
    console.warn('checkStock error:', err.message)
    return 0
  }
}
