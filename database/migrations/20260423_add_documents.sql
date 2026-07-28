-- Migration to add Document Management tables
-- 1. Document Master
CREATE TABLE IF NOT EXISTS document_master (
    id SERIAL PRIMARY KEY,
    doc_name VARCHAR(255) NOT NULL,
    description TEXT,
    is_mandatory BOOLEAN DEFAULT FALSE,
    entity_type CHAR(1) DEFAULT 'A', -- 'B': Borrower, 'G': Guarantor, 'C': Co-borrower, 'A': All
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Proposal Documents
CREATE TABLE IF NOT EXISTS proposal_documents (
    id SERIAL PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    document_master_id INT REFERENCES document_master(id) ON DELETE SET NULL,
    custom_doc_name VARCHAR(255), -- Used if document_master_id is NULL
    entity_type CHAR(1) NOT NULL, -- 'B', 'G', 'C'
    participant_id INT REFERENCES proposal_participants(id) ON DELETE CASCADE,
    
    file_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    mime_type VARCHAR(100),
    file_size BIGINT,
    
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'verified', 'rejected'
    verification_remarks TEXT,
    verified_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Initial Seed Data
INSERT INTO document_master (doc_name, entity_type, is_mandatory, sort_order) VALUES
('Aadhaar Card', 'A', TRUE, 1),
('PAN Card', 'A', TRUE, 2),
('Recent Photo', 'A', TRUE, 3),
('Salary Slip (Last 3 Months)', 'B', FALSE, 4),
('ITR / Form 16', 'B', FALSE, 5),
('Business License', 'B', FALSE, 6),
('Property Documents', 'B', FALSE, 7)
ON CONFLICT DO NOTHING;
