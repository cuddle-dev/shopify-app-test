-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "llmProvider" TEXT NOT NULL DEFAULT 'anthropic',
    "llmModel" TEXT,
    "defaultLocales" TEXT NOT NULL DEFAULT 'en-us',
    "brandTone" TEXT NOT NULL DEFAULT 'premium, knowledgeable, warm',
    "competitorUrls" TEXT,
    "minProductCount" INTEGER NOT NULL DEFAULT 6,
    "similarityThreshold" REAL NOT NULL DEFAULT 0.85,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "rawKeyword" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "clusterId" TEXT,
    "parsedIntent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "pageTypeId" TEXT,
    "localeId" TEXT NOT NULL DEFAULT 'en-us',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlpPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "pageTypeId" TEXT NOT NULL,
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
    CONSTRAINT "PlpPage_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KeywordCluster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "canonicalKeyword" TEXT NOT NULL,
    "memberKeywords" TEXT NOT NULL,
    "localeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");

-- CreateIndex
CREATE INDEX "Keyword_shop_status_idx" ON "Keyword"("shop", "status");

-- CreateIndex
CREATE INDEX "Keyword_shop_clusterId_idx" ON "Keyword"("shop", "clusterId");

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_shop_rawKeyword_localeId_key" ON "Keyword"("shop", "rawKeyword", "localeId");

-- CreateIndex
CREATE UNIQUE INDEX "PlpPage_keywordId_key" ON "PlpPage"("keywordId");

-- CreateIndex
CREATE INDEX "PlpPage_shop_status_idx" ON "PlpPage"("shop", "status");

-- CreateIndex
CREATE INDEX "PlpPage_shop_localeId_idx" ON "PlpPage"("shop", "localeId");

-- CreateIndex
CREATE UNIQUE INDEX "PlpPage_shop_slug_localeId_key" ON "PlpPage"("shop", "slug", "localeId");

-- CreateIndex
CREATE INDEX "KeywordCluster_shop_localeId_idx" ON "KeywordCluster"("shop", "localeId");
