ALTER TABLE "CollectionRouteHeartbeat"
ADD COLUMN "lastErrorCode" TEXT;

ALTER TABLE "DataSnapshot"
ADD COLUMN "structuredDataJson" JSONB,
ADD COLUMN "structuredDataVersion" TEXT;
