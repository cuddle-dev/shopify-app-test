-- Normalize category source after removing starter packs
UPDATE "ShopCategory" SET "source" = 'ai_generated' WHERE "source" = 'starter_pack';
