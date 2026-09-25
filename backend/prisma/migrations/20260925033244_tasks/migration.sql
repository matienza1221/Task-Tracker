-- CreateEnum
CREATE TYPE "TaskProgressMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_task_id" UUID,
    "milestone_id" UUID,
    "number" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status_id" UUID NOT NULL,
    "priority_id" UUID NOT NULL,
    "type_id" UUID NOT NULL,
    "assignee_id" UUID,
    "reporter_id" UUID,
    "start_date" DATE,
    "due_date" DATE,
    "completed_at" TIMESTAMPTZ(6),
    "estimated_hours" DECIMAL(6,2),
    "actual_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "progress_mode" "TaskProgressMode" NOT NULL DEFAULT 'MANUAL',
    "next_step" TEXT,
    "verification_note" TEXT,
    "code_references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_labels" (
    "task_id" UUID NOT NULL,
    "label_id" UUID NOT NULL,

    CONSTRAINT "task_labels_pkey" PRIMARY KEY ("task_id","label_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tasks_key_key" ON "tasks"("key");

-- CreateIndex
CREATE INDEX "tasks_project_id_status_id_idx" ON "tasks"("project_id", "status_id");

-- CreateIndex
CREATE INDEX "tasks_project_id_assignee_id_idx" ON "tasks"("project_id", "assignee_id");

-- CreateIndex
CREATE INDEX "tasks_project_id_parent_task_id_idx" ON "tasks"("project_id", "parent_task_id");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_due_date_idx" ON "tasks"("assignee_id", "due_date");

-- CreateIndex
CREATE INDEX "tasks_milestone_id_idx" ON "tasks"("milestone_id");

-- CreateIndex
CREATE INDEX "tasks_deleted_at_idx" ON "tasks"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_project_id_number_key" ON "tasks"("project_id", "number");

-- CreateIndex
CREATE INDEX "task_labels_label_id_idx" ON "task_labels"("label_id");

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "task_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_priority_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "task_priorities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "task_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Raw constraints and indexes not expressible in the Prisma schema (§6.6/6.7)
-- ---------------------------------------------------------------------------

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_progress_range" CHECK ("progress" >= 0 AND "progress" <= 100);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_hours_non_negative" CHECK (("estimated_hours" IS NULL OR "estimated_hours" >= 0) AND "actual_hours" >= 0);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_dates_valid" CHECK ("due_date" IS NULL OR "start_date" IS NULL OR "due_date" >= "start_date");
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_key_format" CHECK ("key" ~ '^[A-Z][A-Z0-9]{1,9}-[0-9]+$');

CREATE INDEX "tasks_title_trgm_idx" ON "tasks" USING gin ("title" gin_trgm_ops);
CREATE INDEX "tasks_description_trgm_idx" ON "tasks" USING gin ("description" gin_trgm_ops);
CREATE INDEX "tasks_code_references_gin" ON "tasks" USING gin ("code_references");
CREATE INDEX "tasks_open_due_idx" ON "tasks" ("due_date") WHERE "deleted_at" IS NULL AND "completed_at" IS NULL;
CREATE INDEX "tasks_assignee_open_idx" ON "tasks" ("assignee_id", "due_date") WHERE "deleted_at" IS NULL AND "completed_at" IS NULL;
