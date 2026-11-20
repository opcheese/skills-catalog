// A --mock module: runs on the BrowserContext before any page opens.
export default async (context) => {
  await context.route("**/api/x", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ label: "mocked" }) }))
}
