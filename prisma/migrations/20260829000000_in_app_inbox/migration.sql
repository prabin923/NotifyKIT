-- AlterEnum
-- Postgres cannot use a newly added enum value inside the transaction that adds
-- it, so this statement must run on its own before anything below references it.
ALTER TYPE "Channel" ADD VALUE 'IN_APP';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "seen_at" TIMESTAMP(3),
ADD COLUMN     "read_at" TIMESTAMP(3),
ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "data" JSONB;

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_read_at_created_at_idx" ON "notifications"("tenant_id", "user_id", "read_at", "created_at");
