# Search indexing guide (BabelCodec)

After merging Search Discovery and deploying GitHub Pages, use this checklist.

## Deployed URLs

Base: `https://thebabeldragon.github.io/BabelCodec/`

| Resource | URL |
|----------|-----|
| Homepage | `/` |
| robots.txt | `/robots.txt` |
| sitemap.xml | `/sitemap.xml` |
| llms.txt | `/llms.txt` |
| Tools index | `/tools/` |

Confirm HTTP 200 for each before submitting to search engines.

## Google Search Console

1. Add property: URL-prefix `https://thebabeldragon.github.io/BabelCodec/`
2. Verify ownership (HTML file or DNS as preferred).
3. **Sitemaps** → submit `https://thebabeldragon.github.io/BabelCodec/sitemap.xml`
4. **URL Inspection** → test `/` and `/tools/` → Request indexing if eligible.

Submitting a sitemap does **not** guarantee indexing. Coverage and ranking depend on Google’s systems.

## Bing Webmaster Tools

1. Add the same site URL.
2. Submit the sitemap URL above.
3. Optionally import GSC verification if available.

## What not to claim

- Do not promise rankings or that AI crawlers will cite the project.
- Do not block `src/` or WASM assets in `robots.txt` if the SPA needs them at runtime for tool pages.

## Privacy

No analytics tags were added for SEO. Core conversion remains client-side.
