-- Each restored version gets a new epoch; older offline edits cannot overwrite it.
ALTER TABLE "Board" ADD COLUMN "epoch" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BoardUpdate" ADD COLUMN "epoch" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BoardSnapshot" ADD COLUMN "epoch" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "BoardUpdate_boardId_epoch_id_idx" ON "BoardUpdate"("boardId", "epoch", "id");
