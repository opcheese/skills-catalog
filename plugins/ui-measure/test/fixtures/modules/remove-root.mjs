// A --steps module that removes the root element.
export default async (page) => {
  await page.evaluate(() => document.querySelector("#app").remove())
}
