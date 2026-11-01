-- Separate enum migration: commit new value before any later use.
ALTER TYPE "TelegramAdvertiserContactType" ADD VALUE IF NOT EXISTS 'INSTAGRAM';
