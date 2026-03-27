-- Migration: 006_shares_expiry.sql
-- Description: Voeg expires_at toe aan shares zodat deellinks kunnen verlopen.
--              Voeg ook disabled toe aan users voor account-blokkering zonder verwijdering.

ALTER TABLE shares
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT false;
