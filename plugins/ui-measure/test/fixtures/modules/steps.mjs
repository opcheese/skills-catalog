// A --steps module: runs on the Page after load, before measuring.
export default async (page) => {
  await page.click("#go")
}
