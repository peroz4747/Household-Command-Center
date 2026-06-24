export async function GET() {
  try {
    const RSS_URL = "https://www.24ur.com/rss";
    const res = await fetch(RSS_URL);
    if (!res.ok) return new Response(JSON.stringify([]), { status: 502 });

    const xml = await res.text();

    const itemRe = /<item[\s\S]*?<\/item>/g;
    const rawItems = Array.from(xml.match(itemRe) || []);

    const items = rawItems
      .map((block) => {
        const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
        const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);

        // try common image containers: media:content, enclosure, or img in description
        const mediaMatch = block.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*>/i);
        const enclosureMatch = block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i);
        const descMatch = block.match(/<description>([\s\S]*?)<\/description>/i);
        let imgMatch = null;
        if (descMatch) {
          let desc = descMatch[1];
          desc = desc.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
          desc = desc.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
          imgMatch = desc.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
        }

        const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
        const link = linkMatch ? linkMatch[1].trim() : "";
        const pubDate = dateMatch ? dateMatch[1].trim() : "";
        const image = (mediaMatch && mediaMatch[1]) || (enclosureMatch && enclosureMatch[1]) || (imgMatch && imgMatch[1]) || "";

        return { title, link, pubDate, image };
      })
      .slice(0, 20);

    return new Response(JSON.stringify(items), { headers: { "content-type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: "failed to fetch or parse RSS" }), { status: 500 });
  }
}
