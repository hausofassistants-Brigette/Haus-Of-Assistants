export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return res.status(503).json({ error: "Instagram feed is not configured" });

  const fields = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
  const endpoint = new URL("https://graph.instagram.com/me/media");
  endpoint.searchParams.set("fields", fields);
  endpoint.searchParams.set("limit", "12");
  endpoint.searchParams.set("access_token", token);

  try {
    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    const body = await response.json();
    if (!response.ok) {
      console.error("Instagram API error", response.status, body?.error?.type || "unknown");
      return res.status(502).json({ error: "Instagram feed unavailable" });
    }
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    return res.status(200).json({ data: body.data || [] });
  } catch (error) {
    console.error("Instagram feed request failed");
    return res.status(502).json({ error: "Instagram feed unavailable" });
  }
}
