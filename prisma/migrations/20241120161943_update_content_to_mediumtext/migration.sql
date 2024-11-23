/*
  Warnings:

  - You are about to drop the column `img` on the `Post` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Category` ADD COLUMN `keywords` VARCHAR(800) NULL,
    MODIFY `description` VARCHAR(800) NULL;

-- AlterTable
ALTER TABLE `Post` DROP COLUMN `img`,
    ADD COLUMN `imgUrl` VARCHAR(191) NULL,
    ADD COLUMN `keywords` VARCHAR(800) NULL,
    MODIFY `slug` VARCHAR(320) NOT NULL,
    MODIFY `content` MEDIUMTEXT NOT NULL,
    MODIFY `description` VARCHAR(800) NULL;

-- AlterTable
ALTER TABLE `Tag` ADD COLUMN `keywords` VARCHAR(800) NULL,
    MODIFY `description` VARCHAR(800) NULL;
