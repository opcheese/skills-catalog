// The only network call in the design path. The token is sent as a header and
// is never logged, echoed or put in an error message.

export async function fetchNode(
  fileKey: string,
  nodeId: string,
  token: string,
): Promise<unknown> {
  const url =
    `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}` +
    `/nodes?ids=${encodeURIComponent(nodeId)}`
  const res = await fetch(url, { headers: { "X-Figma-Token": token } })
  if (!res.ok) {
    // Status only: the URL carries the file key and the headers carry the token.
    throw new Error(`Figma API request failed with HTTP ${res.status}`)
  }
  return res.json()
}
