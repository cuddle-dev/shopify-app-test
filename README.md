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


## Q&A (detailed answers)

### How do you prevent thin content? What happens when fewer than 6 products match?

**Prevention has three layers:**

**A. Hard product minimum (default 6)**  
After matching, if fewer than six catalog products score above zero for that intent, the PLP status is set to **`needs_review`**. Publish is **blocked** in code (`publishPlp` throws; the dashboard won’t publish). The merchant must improve the catalog, pick a better keyword, or lower the threshold in Settings (not recommended for production SEO).

**B. Match quality, not just count**  
Matching in `matcher.ts` weights room/use case, style, attributes, and color against title, description, tags, and collections. For kids-room intent, products tagged “dark”, “moody”, “gothic”, etc. are **penalized** so weak thematic fits don’t count as valid matches.

**C. Content depth gate**  
Even with enough products, generated JSON must pass schema validation: minimum three sections, four FAQs, H1, intro, structured markup — with retries up to three times. Invalid output never publishes.

**When fewer than 6 products:**  
Generation can still run so the merchant can **review** intent and copy, but the page stays **`needs_review`**, HTML gets **`noindex`**, and it does not go live until there are enough matches (or they regenerate after adding products — the DB count updates on re-approve, not automatically when products are added later).

**One-liner:**  
*“We don’t publish listing pages that can’t support six relevant products; they stay in review with noindex until the catalog or keyword is fixed.”*

---

### How does your prompt strategy differentiate pages targeting adjacent queries?

Adjacent queries (e.g. “botanical wallpaper living room” vs “botanical wallpaper bedroom”) are differentiated by **what goes into the prompt**, not by swapping one word in a static template.

- **Structured intent** — Each keyword becomes JSON (style, room, color, attribute, use case, audience), injected as `{intent_json}`.
- **Page-type configs** — `style-room` vs `use-case` have different system prompts and templates.
- **Real product subset** — `{products_json}` is the actual matched SKUs for that query.
- **Locale context** — `{locale_json}` carries currency, measurement system, and market terminology (not just translation).
- **Related PLPs in the prompt** — `{related_plps_json}` tells the model what sibling pages exist.
- **Cannibalization block** — If intent is too similar to an already-published PLP (default ≥85% similarity: field overlap + token Jaccard), status is **`blocked`**.
- **Output rules** — H1 = exact keyword; intro declares topic in first 100 words; H2/H3 expand without repeating H1; FAQs must be **standalone** (citable without page context).

**One-liner:**  
*“Adjacent pages get different intent objects, different products, different page-type prompts, and a similarity guard — not the same template with one word changed.”*

---

### How do related PLPs link to each other internally?

**At generation time** (`internal-links.ts`):

1. Load all **published** PLPs in the **same locale**.
2. Compare **parsed intent** fields (shared style, room, cross style↔room pairs, use case).
3. Score and take top **6** neighbors.
4. Pass them into the LLM prompt and store in `internal_links` on the content JSON.
5. **Rendered HTML** adds a “Related guides” nav with links like `{localePrefix}/pages/plp/{slug}` and anchor text = target keyword.

Example: “botanical wallpaper living room” links toward “botanical wallpaper bedroom” and “living room wallpaper ideas” when those published pages share intent attributes.

**Note:** Links are computed from **published** PLPs at generation time. New publishes don’t automatically rewrite old pages yet — relink-on-publish is a v2 improvement.

**One-liner:**  
*“We score intent similarity across published pages in the same market and inject cross-links when the page is generated, so PageRank flows between related intents.”*

---

### Why did you choose your publishing mechanism?

**Chosen: Shopify Online Store Pages API** (GraphQL `pageCreate` / `pageUpdate`).

| Reason | Explanation |
|--------|-------------|
| **Plug-and-play** | Works on any store after install; no theme code changes required. |
| **Full HTML control** | One body field can carry JSON-LD, hreflang, canonical, noindex, FAQ, product grid. |
| **Merchant familiarity** | Pages appear under **Online Store → Pages** like normal content. |
| **Fast MVP** | Metaobjects or theme app extensions need more storefront integration work. |

**Tradeoffs:**

- Styling follows the theme’s default page template (less “on-brand” than a custom section).
- Not as structured for headless reuse as Metaobjects.
- Smart Collections alone don’t give long-form SEO copy.

**Alternatives considered:** Metaobjects (better structure, heavier integration); Collections (wrong fit for editorial PLPs).

**One-liner:**  
*“Pages API was the fastest path to a real, indexable URL on any Shopify store with full SEO markup in the HTML body.”*

---

### How does adding a new locale work — what does the merchant actually do?

**Two different things:**

#### A. Markets already in the app (en-us, en-au, fr-fr, fr-be, nl-be, de-de, …)

**What the merchant does today:**

1. On **Keywords**, pick **Locale** in the dropdown (e.g. `fr-be`).
2. Auto-discover, import CSV, or paste keywords **for that market**.
3. Approve & generate → PLP is created with that `localeId`.
4. Publish → page URL uses that market’s prefix (e.g. `/fr-be/...`), prompts use local terminology, currency, measurements, etc.

They do **not** edit JSON config files — that is an engineering/deploy step.

#### B. Brand-new country (not in config yet)

**Not a merchant self-serve flow in v1.** Engineering adds `config/locales/{id}/market.json` and registers it in `config/locales/index.ts`, then redeploys. The new locale then appears in the Keywords dropdown.

**hreflang:** Published HTML references alternates for all configured locales; optional `canonicalLocaleId` for consolidation across language variants.

**One-liner:**  
*“Merchants choose the market per keyword in the app; launching a wholly new country is a config deploy for us today, not a button in admin — that’s a sensible v2 feature.”*

---

### How is content optimized for AI retrieval, not just Google?

**On-page structure (LLM + schema):**

- Intro must state the topic clearly in the **first 100 words** (system prompt).
- **FAQ answers are standalone** — written so AI interfaces can cite them without surrounding context.
- **JSON-LD**: CollectionPage, ItemList (products), FAQPage, BreadcrumbList.

**AI presence files (beyond sitemap.xml):**

| File | Purpose |
|------|---------|
| **`llms.txt`** | Plain-language index: store summary, collections, each published PLP with keyword, slug, locale, intent summary, product count, URL. |
| **`sitemap-ai.xml`** | Curated XML with AI metadata: primary keyword, intent summary, product count, locale — only published PLPs. |

Served at `/llms.txt?shop=...` and `/sitemap-ai.xml?shop=...` (mapping to store root via app proxy/redirect is a deploy step).

**Policy line in llms.txt:** Only published PLPs are listed — drafts and thin pages excluded.

**One-liner:**  
*“We optimize for citation-ready FAQs and topic-clear intros, plus machine-readable indexes — llms.txt and sitemap-ai.xml — not only Google’s HTML crawler.”*

---

### Known gaps and what you’d build next

| Gap | Today | Next |
|-----|--------|------|
| **Long LLM in HTTP request** | Approve can take 30–90s; dev tunnels may timeout | Background jobs (queue), progress UI |
| **SQLite** | Fine for dev | PostgreSQL on Railway |
| **Stale product count** | Preview shows 8 products but DB may still say `needs_review` until regenerate | “Refresh matches” button |
| **Manual product overrides** | Field exists in DB | UI on PLP detail |
| **Internal links** | Fixed at generation time | Relink all affected PLPs when a new sibling publishes |
| **Matching** | Rule-based + token scoring | Embeddings + reranker for catalog |
| **Auto-discovery** | Biased toward wallpaper-style n-grams | Domain-agnostic discovery |
| **Storefront presentation** | Pages API HTML | Theme app extension or metaobjects |
| **llms.txt at store root** | App URL + query param | Shopify app proxy |
| **New locale** | Developer adds config | Merchant “Add market” in Settings |
| **Cannibalization** | Jaccard + field overlap | Embedding similarity on full intent |
| **Dockerfile** | From Shopify template | Optional; Railway can use Nixpacks |

**Prioritized v2:**  
1) Job queue for generation, 2) Postgres, 3) relink-on-publish, 4) embedding-based matching + similarity, 5) theme/metaobject publishing for brand control.

**Closing line:**  
*“V1 proves the full pipeline on a dev store; v2 is about scale, resilience, and merchant self-service for markets and product overrides.”*
