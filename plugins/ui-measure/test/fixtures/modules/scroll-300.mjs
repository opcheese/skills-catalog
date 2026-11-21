// A --steps module that scrolls the page 300px before measuring.
export default async (page) => {
  await page.evaluate(() => window.scrollTo(0, 300))
}
