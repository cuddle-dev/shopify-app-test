# PLP SEO Generator — Shopify App

Plug-and-play Shopify app that generates SEO-optimized **Product Listing Pages (PLPs)** at scale: keyword ingestion → intent parsing → catalog matching → LLM generation → validation → publish. Built on the **Shopify CLI Remix template**.

For a full technical walkthrough, see [docs/HOW_THE_APP_WORKS.md](docs/HOW_THE_APP_WORKS.md).

---

## Quick start

```bash
cp .env.example .env
# SHOPIFY_API_KEY, SHOPIFY_API_SECRET, and LLM key (ANTHROPIC_API_KEY, etc.)

npm install
npx prisma migrate dev
shopify app dev
```

Install on a development store via the CLI preview URL, then open the embedded admin app.

| Route | Purpose |
|-------|---------|
| `/app` | Dashboard — PLPs, status, publish |
| `/app/keywords` | Discover, import, approve, generate |
| `/app/plp/:id` | Review matches and content |
| `/app/settings` | Thresholds, brand tone, default locales |
| `/app/ai-presence` | Preview `llms.txt` and `sitemap-ai.xml` |

**LLM provider** (`.env` only): `LLM_PROVIDER=anthropic|openai|gemini` + matching API key.

---

## How do you prevent thin content? What happens when a query matches fewer than 6 products?

Thin PLPs are blocked at **three layers**: catalog fit, generation quality gates, and publish enforcement.

### 1. Minimum product threshold (default 6)

`app/lib/matching/matcher.ts` scores every catalog product against structured intent (style, room, use case, color, attribute, audience) with **negative rules** (e.g. kids-room queries penalize “dark”, “moody”, “gothic” products). Only products with score &gt; 0 are ranked.

After ranking, if `products.length < minCount` (default **6**, from `ShopSettings.minProductCount` or `MIN_PRODUCT_COUNT`):

- PLP status is set to **`needs_review`**
- Content may still be generated for merchant review, but **publish is hard-blocked** in `publishPlp()` and on the dashboard action
- Rendered HTML for non-published states includes **`noindex,nofollow`** so weak pages are not meant to be indexed

### 2. Cannibalization and keyword clustering

- **Pre-generation clustering** (`keywords/clustering.ts`): near-duplicate keywords (Jaccard on tokens, threshold ~0.72) collapse to one canonical keyword per cluster — fewer near-identical pages.
- **Pre-publish similarity** (`seo/cannibalization.ts`): new intent vs all published PLPs; score = 60% structured field overlap + 40% keyword token Jaccard. If ≥ `similarityThreshold` (default **0.85**), status **`blocked`** — no publish.

### 3. Schema-validated long-form content

Generation must pass **Ajv** validation against `config/page-types/*.json` `output_schema` (min 3 sections, min 4 FAQ items, H1, intro, JSON-LD payload, etc.). Invalid JSON is retried up to 3×, then fails — nothing invalid enters the publish path.

### When fewer than 6 products match

| Step | Behavior |
|------|----------|
| Approve keyword | Pipeline runs; PLP saved as **`needs_review`** |
| Dashboard / PLP detail | Badge shows needs review; publish button fails with explicit error |
| Merchant options | Adjust catalog/tags, lower threshold in **Settings** (not recommended for SEO), or use `manualProductIds` (DB field; UI wiring is a known gap) |
| Publish | **Rejected** until `productCount ≥ minProductCount` and status is not `blocked` |

---

## How does your prompt strategy differentiate pages targeting adjacent queries?

Adjacent queries (e.g. “botanical wallpaper living room” vs “botanical wallpaper bedroom”) must not read like find-and-replace variants. Differentiation comes from **structured intent + page-type templates + locale context + related-PLP awareness**, not from varying the keyword string alone.

### Structured intent in every prompt

`approveAndGeneratePlp` parses each keyword into `ParsedIntent` (rules first in `intent/rules.ts`, LLM fallback in `intent/parser.ts`). The full `intent_json` is injected into the user prompt so the model writes for **room, style, color, attribute, audience** — not just the raw query.

### Page-type-specific system prompts

| Page type | File | Differentiation |
|-----------|------|-----------------|
| `style-room` | `config/page-types/style-room.json` | Style × room framing; interior-design expert; H1 = exact keyword |
| `use-case` | `config/page-types/use-case.json` | Emphasizes use case, audience, attributes; explicitly must differ from “style-only” pages; slightly higher temperature (0.55) |

Templates also receive `products_json` (top matched SKUs), `locale_json` (currency, measurements, `promptContext`, terminology), `brand_tone`, and `related_plps_json`.

### Locale and market copy

`config/locales/{market}/market.json` supplies `terminology` and `promptContext` (e.g. US imperial vs AU metric). **en-us** and **en-au** are separate pages with different slugs and market copy — not machine translation of one template.

### Cannibalization as a hard stop

Even with good prompts, if two intents score too similarly against an already-published PLP, generation completes but status is **`blocked`** — preventing adjacent-query collision at publish time.

### Output shape forces depth

Shared schema requires: topic-clear **intro** (system prompt: first 100 words declare the page topic), **≥3 sections** with distinct H2s, **≥4 standalone FAQ answers** (citable without page context), separate **meta_title** / **meta_description**, and per-product **alt text** keyed by product id.

---

## How do related PLPs link to each other internally?

Internal links are computed **at generation time**, then rendered in HTML and stored in content JSON.

### 1. Scoring related published PLPs

`app/lib/seo/internal-links.ts` — `computeInternalLinks()`:

- Considers only **published** PLPs in the **same locale**
- Scores by **shared intent attributes** (style, room, use case): same style +2, same room +1, cross style/room combinations +1
- Keeps top **6** links with score &gt; 0

### 2. Injected into generation and HTML

- Passed to the LLM as `related_plps_json` so anchors can align with real neighbors
- Saved on `content.internal_links`
- Rendered in `render-page.ts` as a “Related guides” nav:

  `{locale.urlPrefix}/pages/plp/{slug}` with keyword as anchor text

This creates a **topical cluster mesh** (e.g. same style, different rooms) without relying on the model to invent URLs.

---

## Why did you choose your publishing mechanism?

**Mechanism:** Shopify **Online Store Pages API** (`app/lib/publishing/pages.server.ts`) — `pageCreate` / `pageUpdate` with a full HTML body.

**Why Pages API**

| Benefit | Detail |
|---------|--------|
| **Plug-and-play** | Works on any theme without Liquid rewrites or metaobject definitions in the theme |
| **Full HTML control** | Single payload: JSON-LD stack, hreflang, canonical, FAQ markup, product grid, internal links, `noindex` for non-published |
| **Merchant-familiar** | Pages appear in Shopify admin → Online Store → Pages |
| **Fastest path for evaluation** | One GraphQL mutation per publish; no storefront app block required for core PLP content |

**Alternatives considered**

| Option | Why not primary |
|--------|----------------|
| **Metaobjects** | Stronger structured data model, but heavier theme integration and merchant setup |
| **Smart collections** | Good for product grids, weak for long-form SEO copy, FAQ, and custom JSON-LD narrative |
| **App proxy theme templates** | More flexible URLs, but every store needs theme edits — conflicts with “install on any dev store” goal |

**Tradeoffs**

- Published URL is Shopify’s page handle (`/pages/{handle}`), while canonical/hreflang in HTML may use configured `urlPrefix` + `PLP_URL_PREFIX` — merchants may align redirects in theme or app proxy.
- `llms.txt` / `sitemap-ai.xml` are served from the **app** (`/llms.txt?shop=…`); storefront root mapping requires App Proxy or theme redirect (see below).

---

## How does adding a new locale work — what does the merchant actually do?

Locales are **configuration-driven**. Most work is developer/deploy-side; the merchant uses the admin UI for **per-keyword locale selection** and settings.

### Developer / deploy steps (new market)

1. Add `config/locales/{locale-id}/market.json` with:
   - `language`, `region`, `currency`, `currencySymbol`, `measurementSystem`
   - `urlPrefix` (e.g. `/fr-be`), `hreflang` (e.g. `fr-BE`)
   - `terminology`, `promptContext`
2. Register the id in `config/locales/index.ts`
3. Redeploy or restart the app (no application code changes for prompts/SEO)

### What the merchant does

1. **Keywords** — choose **locale** in the dropdown when running auto-discover, CSV import, or paste (each keyword is stored with `localeId`).
2. **Approve** — generation uses that locale’s market config in prompts and matching labels.
3. **Publish** — hreflang alternates in HTML include all configured locales from `listLocaleIds()`; canonical can use `canonicalLocaleId` when set.
4. **Settings** — set **default locales** (comma-separated) for workflow defaults; tune min products and similarity threshold per shop.

There is **no** self-serve “add France” button in admin today — new markets require the config folder + index registration (intentional for evaluation: markets are versioned config, not merchant-edited JSON).

**Belgium example:** separate `fr-be` and `nl-be` folders for French vs Dutch Flanders/Wallonia copy, currency, and terminology — not one “Belgium” locale.

---

## How is your content structure optimized for AI retrieval, not just Google?

The app targets **both** traditional SEO (JSON-LD, hreflang, canonical) and **emerging AI crawler discovery** (llms.txt, enriched sitemap, citable content shape).

### On-page structure (LLM-friendly)

| Element | AI / SEO purpose |
|---------|------------------|
| **Intro** | System prompt requires topic clarity in first ~100 words — easy chunk for citations |
| **FAQ** | Min 4 Q&As; answers must be **standalone** (readable without page context) — matches FAQPage schema and RAG-style snippets |
| **Sections** | H2/H3 expand subtopics without repeating H1 — broader entity coverage |
| **Product alt text** | Intent-aware alts per SKU, not duplicate product titles |
| **JSON-LD** | `CollectionPage`, `ItemList`, `FAQPage`, `BreadcrumbList` in `seo/jsonld.ts` |

### AI presence files (beyond Google)

| Asset | Route | Role |
|-------|-------|------|
| **llms.txt** | `/llms.txt?shop={shop}` | Markdown index: keyword, URL, locale, intent summary, product count per published PLP |
| **sitemap-ai.xml** | `/sitemap-ai.xml?shop={shop}` | XML sitemap with custom `ai:` fields (`primary_keyword`, `intent_summary`, `product_count`, `locale`) |

Regenerated from published PLPs via `buildAiPresenceFiles()`; preview in **AI presence** admin page.

Only **published** PLPs are listed (`llms.txt` policy line: quality-approved only).

### Storefront wiring (merchant / ops)

Map storefront root to the app (App Proxy or theme redirect):

- `https://{shop}/llms.txt` → `https://{app_url}/llms.txt?shop={shop}`
- `https://{shop}/sitemap-ai.xml` → `https://{app_url}/sitemap-ai.xml?shop={shop}`

---

## Known gaps and what we'd build next

| Gap | Current state | Next step |
|-----|---------------|-----------|
| **Manual product override UI** | `manualProductIds` on PLP model; matcher respects it | PLP detail UI to pin/replace products when below threshold |
| **Locale admin** | Markets are code config only | Optional merchant-facing locale editor or metafield-driven market config |
| **Canonical URL vs Shopify handle** | HTML canonical uses `urlPrefix` + `PLP_URL_PREFIX`; live page is `/pages/{handle}` | Theme redirects or app proxy so public URL matches canonical |
| **AI files at store root** | Served from app host with `?shop=` | One-click App Proxy setup in onboarding |
| **Multi-locale generation workflow** | One locale per keyword; hreflang on publish | Bulk “generate all locales for this cluster” with `canonicalLocaleId` wizard |
| **Collection sync in llms.txt** | `collections: []` placeholder | Pull live collection list from Admin API |
| **Publish threshold hardcoded** | `publishPlp` also checks `productCount < 6` literal | Use `settings.minProductCount` consistently |
| **Real-time webhooks** | Uninstall / scopes only | Product update webhook to flag stale PLP matches |
| **Analytics** | None | GSC / Search Console integration, PLP performance dashboard |
| **A/B meta titles** | Single meta per PLP | Variant testing from `seo.title_template` |

---

## Architecture (summary)

```
config/locales/       # Per-market JSON (prompt + URL + hreflang)
config/page-types/    # Prompts + output_schema per PLP shape
app/lib/
  keywords/           # Discovery, import, clustering
  intent/             # Rules + LLM parsing
  matching/           # Scoring + min threshold
  generation/         # Pipeline + Ajv validation
  seo/                # render-page, jsonld, cannibalization, internal-links
  publishing/         # Shopify Pages API
  ai-presence/        # llms.txt, sitemap-ai.xml
  plp/                # Orchestration (service.server.ts)
```

## Environment variables

See `.env.example`. Key values:

| Variable | Default | Role |
|----------|---------|------|
| `MIN_PRODUCT_COUNT` | 6 | Thin-content floor |
| `SIMILARITY_THRESHOLD` | 0.85 | Cannibalization block |
| `PLP_URL_PREFIX` | `/pages/plp` | Path segment in canonical URLs |
| `LLM_PROVIDER` / `LLM_MODEL` | anthropic | AI backend |

**Scopes:** `read_products`, `write_products`, `read_content`, `write_content`.

## Scripts

```bash
shopify app dev    # recommended local dev
npm run build
npm run setup      # prisma migrate deploy
```

## License

Private — client evaluation build.
