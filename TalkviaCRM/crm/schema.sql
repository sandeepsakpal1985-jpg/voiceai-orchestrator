CREATE TABLE IF NOT EXISTS sales_crm_leads (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 campaign VARCHAR(20) NOT NULL DEFAULT 'Unassigned',
 hospital_name VARCHAR(255) NOT NULL, address TEXT NOT NULL,
 city VARCHAR(120) NOT NULL, state VARCHAR(120) NOT NULL, phone VARCHAR(50) NOT NULL, timezone VARCHAR(100) NOT NULL DEFAULT '', queue_due_at DATETIME NULL,
 source_name VARCHAR(160) NOT NULL DEFAULT '', source_title VARCHAR(160) NOT NULL DEFAULT '',
 source_email VARCHAR(254) NOT NULL DEFAULT '', alternate_phone VARCHAR(50) NOT NULL DEFAULT '',
 status VARCHAR(50) NOT NULL DEFAULT 'New / Not Contacted',
 current_software VARCHAR(255) NOT NULL DEFAULT '', requirements TEXT NOT NULL,
 callback_at DATETIME NULL, demo_at DATETIME NULL,
 assigned_to VARCHAR(100) NOT NULL DEFAULT '', notes TEXT NOT NULL,
 last_contact_at DATETIME NULL, version INT UNSIGNED NOT NULL DEFAULT 1,
 created_by VARCHAR(100) NOT NULL, created_at DATETIME NOT NULL,
 updated_at DATETIME NOT NULL,
 INDEX crm_campaign_queue (campaign,status,queue_due_at,id), INDEX crm_owner (assigned_to), INDEX crm_queue_pick (assigned_to,queue_due_at,id), INDEX crm_status (status), INDEX crm_callback (callback_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS sales_crm_activity (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 lead_id BIGINT UNSIGNED NOT NULL, employee_id VARCHAR(100) NOT NULL,
 action VARCHAR(50) NOT NULL, details MEDIUMTEXT NOT NULL,
 created_at DATETIME NOT NULL, INDEX crm_activity (lead_id, id),
 FOREIGN KEY (lead_id) REFERENCES sales_crm_leads(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS sales_crm_emails (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 lead_id BIGINT UNSIGNED NOT NULL, employee_id VARCHAR(100) NOT NULL,
 recipient VARCHAR(1000) NOT NULL, subject VARCHAR(255) NOT NULL, body TEXT NOT NULL,
 delivery_state VARCHAR(30) NOT NULL DEFAULT 'pending', created_at DATETIME NOT NULL,
 sent_at DATETIME NULL, INDEX crm_mail (lead_id, id),
 FOREIGN KEY (lead_id) REFERENCES sales_crm_leads(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_crm_users (
 employee_id VARCHAR(100) PRIMARY KEY, name VARCHAR(160) NOT NULL,
 email VARCHAR(254) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
 campaign_access VARCHAR(20) NOT NULL DEFAULT 'None',
 role VARCHAR(20) NOT NULL DEFAULT 'agent', active TINYINT NOT NULL DEFAULT 1,
 must_change_password TINYINT NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS sales_crm_login_attempts (
 attempt_key CHAR(64) NOT NULL, created_at DATETIME NOT NULL,
 INDEX crm_attempts (attempt_key,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS sales_crm_agent_state (
 employee_id VARCHAR(100) PRIMARY KEY,
 mode VARCHAR(20) NOT NULL DEFAULT 'ready',
 active_lead_id BIGINT UNSIGNED NULL,
 break_reason VARCHAR(80) NOT NULL DEFAULT '', changed_at DATETIME NOT NULL,
 UNIQUE KEY crm_one_active_lead (active_lead_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS sales_crm_agent_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 employee_id VARCHAR(100) NOT NULL, event VARCHAR(40) NOT NULL,
 reason VARCHAR(255) NOT NULL DEFAULT '', lead_id BIGINT UNSIGNED NULL,
 created_at DATETIME NOT NULL, INDEX crm_agent_events (employee_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_crm_dispatch (
 id TINYINT UNSIGNED PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO sales_crm_dispatch (id) VALUES (1);
