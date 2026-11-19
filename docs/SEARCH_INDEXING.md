# Search indexing guide for BabelCodec

BabelCodec is deployed at:

**https://thebabeldragon.github.io/BabelCodec/**

Crawler files (after this release is merged and Pages deploys):

| Resource | URL |
|----------|-----|
| robots.txt | https://thebabeldragon.github.io/BabelCodec/robots.txt |
| sitemap.xml | https://thebabeldragon.github.io/BabelCodec/sitemap.xml |
| llms.txt | https://thebabeldragon.github.io/BabelCodec/llms.txt |

Submitting a sitemap **does not guarantee** indexing. Search engines choose what to crawl and index based on quality, uniqueness, and demand.

## Google Search Console

1. Open [Google Search Console](https://search.google.com/search-console).
2. Add a **URL prefix** property: `https://thebabeldragon.github.io/BabelCodec/`
   - Or use a Domain property for `thebabeldragon.github.io` if you control DNS verification.
3. Verify ownership (HTML file, meta tag, or Google Analytics — pick one method you control).
4. **Sitemaps** → submit: `https://thebabeldragon.github.io/BabelCodec/sitemap.xml`
5. **URL inspection** → test key URLs (homepage, `/tools/`, individual tool pages).
6. Request indexing for important new or updated URLs (rate-limited by Google).
7. Monitor **Coverage / Pages**, **Performance** (queries, impressions, CTR).

### Crawl diagnostics (Google)

- Check `robots.txt` tester in Search Console.
- Confirm canonical URLs use the `/BabelCodec/` base path.
- Look for soft 404s (SPA routes that return 200 with empty content) — prefer real static HTML for landing pages.
- Watch for duplicate titles/descriptions across tools.

## Bing Webmaster Tools

1. Open [Bing Webmaster Tools](https://www.bing.com/webmasters).
2. Add the site `https://thebabeldragon.github.io/BabelCodec/`.
3. Verify ownership.
4. Submit the same sitemap URL.
5. Use **URL Inspection** and **Site Scan** as needed.

Bing can optionally import verified GSC sites.

## Canonical URL rules

- Always prefer: `https://thebabeldragon.github.io/BabelCodec/...`
- Do not mix trailing-slash variants in the sitemap for the same content.
- Tool pages are static HTML under `/tools/`; the main app remains `/`.

## After deploy checklist

1. HTTP 200 for robots.txt, sitemap.xml, llms.txt, and every sitemap `<loc>`.
2. Validate sitemap XML (well-formed, absolute URLs).
3. Spot-check Open Graph / canonical tags in page source.
4. Optional: Rich Results Test / Schema validator for JSON-LD on homepage and tool pages.
5. Re-submit sitemap only when the URL set changes materially.

## Troubleshooting delays

- New GitHub Pages sites can take days to weeks for first meaningful crawl.
- Thin or near-duplicate pages are often ignored — keep explanations and examples unique.
- Do not cloak content or serve different bodies to bots vs users.
- Core app remains a client-side SPA; discovery relies on the static tool/docs pages plus accurate metadata on `index.html`.

## Privacy note for operators

Do not add analytics or search-console verification tags that leak user conversion content. Verification meta tags on static pages are fine; avoid third-party scripts that receive form input.
