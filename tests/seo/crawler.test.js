/**
 * SEO / crawler infrastructure checks against the repo tree (source of truth for Pages deploy).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'https://thebabeldragon.github.io/BabelCodec';

describe('crawler infrastructure', () => {
  it('robots.txt exists and declares sitemap', () => {
    const path = join(root, 'robots.txt');
    assert.ok(existsSync(path), 'robots.txt missing');
    const text = readFileSync(path, 'utf8');
    assert.match(text, /User-agent:\s*\*/i);
    assert.match(text, /Allow:\s*\//i);
    assert.match(text, new RegExp(`Sitemap:\s*${BASE}/sitemap\.xml`));
  });

  it('sitemap.xml is well-formed and uses absolute canonical URLs', () => {
    const path = join(root, 'sitemap.xml');
    assert.ok(existsSync(path), 'sitemap.xml missing');
    const text = readFileSync(path, 'utf8');
    assert.match(text, /<urlset[\s\S]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
    const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.ok(locs.length >= 5, 'expected multiple sitemap URLs');
    for (const loc of locs) {
      assert.ok(loc.startsWith(BASE + '/'), `non-canonical or wrong base: ${loc}`);
      assert.ok(!loc.includes('?'), `query variant not allowed: ${loc}`);
    }
    assert.ok(locs.includes(BASE + '/'), 'homepage missing from sitemap');
    assert.ok(locs.includes(BASE + '/tools/'), 'tools index missing from sitemap');
  });

  it('llms.txt exists and names the project', () => {
    const path = join(root, 'llms.txt');
    assert.ok(existsSync(path), 'llms.txt missing');
    const text = readFileSync(path, 'utf8');
    assert.match(text, /BabelCodec/i);
    assert.match(text, new RegExp(BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('every sitemap tool URL has a corresponding HTML file', () => {
    const text = readFileSync(join(root, 'sitemap.xml'), 'utf8');
    const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    for (const loc of locs) {
      const pathPart = loc.slice(BASE.length); // e.g. / or /tools/foo.html
      let filePath;
      if (pathPart === '/' || pathPart === '') {
        filePath = join(root, 'index.html');
      } else if (pathPart.endsWith('/')) {
        filePath = join(root, pathPart.slice(1), 'index.html');
      } else {
        filePath = join(root, pathPart.slice(1));
      }
      assert.ok(existsSync(filePath), `missing file for sitemap URL ${loc} → ${filePath}`);
    }
  });

  it('landing pages have unique title and canonical', () => {
    const pages = [
      'tools/binary-to-text.html',
      'tools/text-to-binary.html',
      'tools/base64.html',
      'tools/hexadecimal-converter.html',
      'docs/encoding-reference.html',
    ];
    const titles = new Set();
    for (const rel of pages) {
      const html = readFileSync(join(root, rel), 'utf8');
      const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
      assert.ok(title, `missing title: ${rel}`);
      assert.ok(!titles.has(title), `duplicate title: ${title}`);
      titles.add(title);
      assert.match(html, /rel="canonical"/i, `missing canonical: ${rel}`);
      assert.match(html, /meta name="description"/i, `missing description: ${rel}`);
    }
  });

  it('homepage has structured data and canonical', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html, /rel="canonical"/i);
    assert.match(html, /application\/ld\+json/i);
    assert.match(html, /SoftwareApplication/);
    assert.match(html, /WebSite/);
  });
});
