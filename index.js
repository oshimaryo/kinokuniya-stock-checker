const puppeteer = require('puppeteer')
const { Cluster } = require('puppeteer-cluster')

const url = process.env.URL

// https://qiita.com/syuilo/items/0800d7e44e93203c7285
process.on('unhandledRejection', console.dir)

if (url == '') {
  process.abort('need URL')
}

;(async () => {
  let storeWithStock = 0
  const { storesPageUrl, storesLength } = await getInfo(url)

  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 10,
    puppeteerOptions: {
      executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium'
    }
  })

  await cluster.task(async ({ page, data: i }) => {
    await page.goto(storesPageUrl, { waitUntil: 'networkidle2' })
    const buttons = await page.$$("[alt^='在庫を確認する']") // 「在庫を確認する」
    Promise.all([await buttons[i].click(), await page.waitForNavigation({ waitUntil: 'networkidle2' })])
    storeWithStock += await checkStock(page)
    await page.goBack({ waitUntil: 'networkidle2' })
  })

  for (let i = 0; i < storesLength; i++) {
    cluster.queue(i)
  }

  await cluster.idle()
  await cluster.close()

  if (storeWithStock === 0) console.log('在庫はありませんでした')
})()

async function getInfo(url) {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()
  await page.setViewport({ width: 1080, height: 1080 })
  await page.goto(url, { waitUntil: 'networkidle2' }) // 指定したURLを開く

  page.click('.shopStockButton2')
  await page.waitForNavigation({ waitUntil: 'networkidle2' })
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
  const statusEl = await page.$('.address b:nth-child(1)').catch((err) => {
    // 在庫状況
    console.warn(err)
  })
  const status = await page.evaluate((el) => el.textContent, statusEl)
  console.log(status)
  if (!status.includes('× 在庫なし')) {
    const shopNameEl = await page.$('.shop_name').catch((err) => {
      // 店名
      console.warn(err)
    })
    const shopName = await page.evaluate((el) => el.textContent, shopNameEl)
    console.log(`${shopName}: ${status}`)
    return 1
  }
  return 0
}
