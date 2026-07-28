-- Migration to support multiple participants (Borrower, Guarantor, Co-borrower) in the same tables.

-- 1. Create Participants Registry
CREATE TABLE IF NOT EXISTS proposal_participants (
    id SERIAL PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    entity_type CHAR(1) NOT NULL, -- 'G' for Guarantor, 'C' for Co-borrower
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_entity_type CHECK (entity_type IN ('G', 'C'))
);

-- 2. Refactor proposal_personal_info
DO $$ 
BEGIN
    -- Change PK to surrogate ID
    ALTER TABLE proposal_personal_info DROP CONSTRAINT IF EXISTS proposal_personal_info_pkey CASCADE;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='proposal_personal_info' AND column_name='id') THEN
        ALTER TABLE proposal_personal_info ADD COLUMN id SERIAL PRIMARY KEY;
    END IF;
    
    -- Add entity columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='proposal_personal_info' AND column_name='entity_type') THEN
        ALTER TABLE proposal_personal_info ADD COLUMN entity_type CHAR(1) DEFAULT 'B';
        ALTER TABLE proposal_personal_info ADD COLUMN participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE;
    END IF;

    -- Update unique constraint
    ALTER TABLE proposal_personal_info DROP CONSTRAINT IF EXISTS uq_personal_entity;
    ALTER TABLE proposal_personal_info ADD CONSTRAINT uq_personal_entity UNIQUE (proposal_id, entity_type, participant_id);
END $$;

-- 3. Refactor proposal_financial_info
DO $$ 
BEGIN
    ALTER TABLE proposal_financial_info DROP CONSTRAINT IF EXISTS proposal_financial_info_pkey CASCADE;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='proposal_financial_info' AND column_name='id') THEN
        ALTER TABLE proposal_financial_info ADD COLUMN id SERIAL PRIMARY KEY;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='proposal_financial_info' AND column_name='entity_type') THEN
        ALTER TABLE proposal_financial_info ADD COLUMN entity_type CHAR(1) DEFAULT 'B';
        ALTER TABLE proposal_financial_info ADD COLUMN participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE;
    END IF;

    ALTER TABLE proposal_financial_info DROP CONSTRAINT IF EXISTS uq_financial_entity;
    ALTER TABLE proposal_financial_info ADD CONSTRAINT uq_financial_entity UNIQUE (proposal_id, entity_type, participant_id);
END $$;

-- 4. Modify proposal_credit_info
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='proposal_credit_info' AND column_name='entity_type') THEN
        ALTER TABLE proposal_credit_info ADD COLUMN entity_type CHAR(1) DEFAULT 'B';
        ALTER TABLE proposal_credit_info ADD COLUMN participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE;
    END IF;
    
    -- Drop the old unique constraint on proposal_id if it exists
    ALTER TABLE proposal_credit_info DROP CONSTRAINT IF EXISTS proposal_credit_info_proposal_id_key;
    
    ALTER TABLE proposal_credit_info DROP CONSTRAINT IF EXISTS uq_credit_entity;
    ALTER TABLE proposal_credit_info ADD CONSTRAINT uq_credit_entity UNIQUE (proposal_id, entity_type, participant_id);
END $$;

-- 5. Modify proposal_property_info
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='proposal_property_info' AND column_name='entity_type') THEN
        ALTER TABLE proposal_property_info ADD COLUMN entity_type CHAR(1) DEFAULT 'B';
        ALTER TABLE proposal_property_info ADD COLUMN participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 6. Modify Income Tables
DO $$ 
DECLARE
    income_tables text[] := ARRAY['proposal_income_job', 'proposal_income_business', 'proposal_income_agriculture', 'proposal_income_rent', 'proposal_income_milk', 'proposal_income_other'];
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY income_tables
    LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=tbl AND column_name='entity_type') THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN entity_type CHAR(1) DEFAULT %L', tbl, 'B');
            EXECUTE format('ALTER TABLE %I ADD COLUMN participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE', tbl);
        END IF;
    END LOOP;
END $$;
