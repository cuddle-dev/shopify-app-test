-- CreateTable
CREATE TABLE "ShopCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'ai_generated',
    "facetConfig" TEXT NOT NULL,
    "promptConfig" TEXT NOT NULL,
    "productFilter" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ProductCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ShopCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Keyword" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "rawKeyword" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "clusterId" TEXT,
    "parsedIntent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "pageTypeId" TEXT,
    "categoryId" TEXT,
    "localeId" TEXT NOT NULL DEFAULT 'en-us',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Keyword_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ShopCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Keyword" ("clusterId", "createdAt", "id", "localeId", "pageTypeId", "parsedIntent", "rawKeyword", "shop", "source", "status", "updatedAt") SELECT "clusterId", "createdAt", "id", "localeId", "pageTypeId", "parsedIntent", "rawKeyword", "shop", "source", "status", "updatedAt" FROM "Keyword";
DROP TABLE "Keyword";
ALTER TABLE "new_Keyword" RENAME TO "Keyword";
CREATE INDEX "Keyword_shop_status_idx" ON "Keyword"("shop", "status");
CREATE INDEX "Keyword_shop_clusterId_idx" ON "Keyword"("shop", "clusterId");
CREATE INDEX "Keyword_shop_categoryId_idx" ON "Keyword"("shop", "categoryId");
CREATE UNIQUE INDEX "Keyword_shop_rawKeyword_localeId_key" ON "Keyword"("shop", "rawKeyword", "localeId");
CREATE TABLE "new_PlpPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "pageTypeId" TEXT NOT NULL,
    "categoryId" TEXT,
    "localeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "productIds" TEXT,
    "manualProductIds" TEXT,
    "intentJson" TEXT NOT NULL,
    "contentJson" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "canonicalLocaleId" TEXT,
    "similarityScore" REAL,
    "shopifyPageId" TEXT,
    "shopifyPageUrl" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlpPage_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlpPage_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ShopCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PlpPage" ("canonicalLocaleId", "contentJson", "createdAt", "id", "intentJson", "keywordId", "localeId", "manualProductIds", "metaDescription", "metaTitle", "pageTypeId", "productCount", "productIds", "publishedAt", "shop", "shopifyPageId", "shopifyPageUrl", "similarityScore", "slug", "status", "updatedAt") SELECT "canonicalLocaleId", "contentJson", "createdAt", "id", "intentJson", "keywordId", "localeId", "manualProductIds", "metaDescription", "metaTitle", "pageTypeId", "productCount", "productIds", "publishedAt", "shop", "shopifyPageId", "shopifyPageUrl", "similarityScore", "slug", "status", "updatedAt" FROM "PlpPage";
DROP TABLE "PlpPage";
ALTER TABLE "new_PlpPage" RENAME TO "PlpPage";
CREATE UNIQUE INDEX "PlpPage_keywordId_key" ON "PlpPage"("keywordId");
CREATE INDEX "PlpPage_shop_status_idx" ON "PlpPage"("shop", "status");
CREATE INDEX "PlpPage_shop_localeId_idx" ON "PlpPage"("shop", "localeId");
CREATE INDEX "PlpPage_shop_categoryId_idx" ON "PlpPage"("shop", "categoryId");
CREATE UNIQUE INDEX "PlpPage_shop_slug_localeId_key" ON "PlpPage"("shop", "slug", "localeId");
CREATE TABLE "new_ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "llmProvider" TEXT NOT NULL DEFAULT 'anthropic',
    "llmModel" TEXT,
    "defaultLocales" TEXT NOT NULL DEFAULT 'en-us',
    "brandTone" TEXT NOT NULL DEFAULT 'premium, knowledgeable, warm',
    "competitorUrls" TEXT,
    "minProductCount" INTEGER NOT NULL DEFAULT 6,
    "similarityThreshold" REAL NOT NULL DEFAULT 0.85,
    "defaultPageTypeId" TEXT NOT NULL DEFAULT 'style-room',
    "catalogAnalyzedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ShopSettings" ("brandTone", "competitorUrls", "createdAt", "defaultLocales", "id", "llmModel", "llmProvider", "minProductCount", "shop", "similarityThreshold", "updatedAt") SELECT "brandTone", "competitorUrls", "createdAt", "defaultLocales", "id", "llmModel", "llmProvider", "minProductCount", "shop", "similarityThreshold", "updatedAt" FROM "ShopSettings";
DROP TABLE "ShopSettings";
ALTER TABLE "new_ShopSettings" RENAME TO "ShopSettings";
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ShopCategory_shop_status_idx" ON "ShopCategory"("shop", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShopCategory_shop_slug_key" ON "ShopCategory"("shop", "slug");

-- CreateIndex
CREATE INDEX "ProductCategory_shop_categoryId_idx" ON "ProductCategory"("shop", "categoryId");

-- CreateIndex
CREATE INDEX "ProductCategory_shop_productId_idx" ON "ProductCategory"("shop", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_shop_productId_categoryId_key" ON "ProductCategory"("shop", "productId", "categoryId");
