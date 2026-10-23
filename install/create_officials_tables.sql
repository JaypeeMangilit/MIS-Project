/* ============================================================================
   Barangay 49 Akasya MIS - Barangay Officials (schema + seed data)
   ----------------------------------------------------------------------------
   Tables : dbo.barangay_officials
            dbo.archived_barangay_officials

   Safe to run as many times as you like:
     * tables        - created only when missing (IF OBJECT_ID ... IS NULL)
     * indexes       - created only when missing (sys.indexes lookup)
     * seed rows     - inserted only when neither the id NOR the official_id
                      is already present, so nothing is duplicated
   There are deliberately NO DELETE / UPDATE / TRUNCATE / DROP statements, so a
   re-run can never remove or overwrite existing records.

   How to run
     SSMS   : select the database you want first (brgy49_db), then execute.
     sqlcmd : sqlcmd -S localhost\SQLEXPRESS -d brgy49_db -E -i create_officials_tables.sql

   Row notes (mirrors the live database exactly)
     * OFF-2026-0007 (Barangay Treasurer) is currently in the ARCHIVE table -
       it was archived from the Officials module on 2026-10-23 13:49:01 by
       "System Admin", so the live table seeds 6 officials and the archive 1.
       To make it live again, restore it from the archive instead of deleting
       this seed line.
     * created_at / updated_at are written explicitly, so a fresh install
       reproduces the same rows byte for byte. Remove those two columns from
       the INSERT column list if you would rather stamp "now".
   ============================================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/* ============================================================================
   1. dbo.barangay_officials
   ============================================================================ */

IF OBJECT_ID('dbo.barangay_officials', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.barangay_officials (
        id             int            NOT NULL IDENTITY(1,1),
        official_id    varchar(20)    NULL,
        first_name     varchar(100)   NOT NULL,
        middle_name    varchar(100)   NULL,
        last_name      varchar(100)   NOT NULL,
        suffix         varchar(20)    NULL,
        gender         varchar(10)    NOT NULL,
        birth_date     date           NULL,
        position       varchar(100)   NOT NULL,
        committee      varchar(100)   NULL,
        term_start     date           NOT NULL,
        term_end       date           NOT NULL,
        mobile_number  varchar(20)    NOT NULL,
        email          varchar(100)   NULL,
        address        varchar(200)   NULL,
        status         varchar(20)    NULL CONSTRAINT DF__barangay___statu__74AE54BC DEFAULT ('Active'),
        profile_image  varchar(255)   NULL,
        created_at     datetime2(7)   NULL CONSTRAINT DF__barangay___creat__75A278F5 DEFAULT (getdate()),
        updated_at     datetime2(7)   NULL CONSTRAINT DF__barangay___updat__76969D2E DEFAULT (getdate()),
        official_type  varchar(20)    NOT NULL CONSTRAINT DF_barangay_officials_type DEFAULT ('Elected'),

        /* constraint names kept exactly as the live database, so schema
           comparisons and sp_help output line up */
        CONSTRAINT PK__barangay__3213E83FEEA600E4 PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ__barangay__2D1096DAAC733D79 UNIQUE NONCLUSTERED (official_id)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('dbo.barangay_officials')
                 AND name = 'idx_officials_name')
    CREATE NONCLUSTERED INDEX idx_officials_name ON dbo.barangay_officials (last_name, first_name);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('dbo.barangay_officials')
                 AND name = 'idx_officials_position')
    CREATE NONCLUSTERED INDEX idx_officials_position ON dbo.barangay_officials (position);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('dbo.barangay_officials')
                 AND name = 'idx_officials_status')
    CREATE NONCLUSTERED INDEX idx_officials_status ON dbo.barangay_officials (status);
GO

/* ============================================================================
   2. dbo.archived_barangay_officials
   ============================================================================ */

IF OBJECT_ID('dbo.archived_barangay_officials', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.archived_barangay_officials (
        id             int            NOT NULL IDENTITY(1,1),
        official_id    varchar(20)    NULL,
        first_name     varchar(100)   NOT NULL,
        middle_name    varchar(100)   NULL,
        last_name      varchar(100)   NOT NULL,
        suffix         varchar(20)    NULL,
        gender         varchar(10)    NOT NULL,
        birth_date     date           NULL,
        position       varchar(100)   NOT NULL,
        committee      varchar(100)   NULL,
        term_start     date           NOT NULL,
        term_end       date           NOT NULL,
        mobile_number  varchar(20)    NOT NULL,
        email          varchar(100)   NULL,
        address        varchar(200)   NULL,
        status         varchar(20)    NULL CONSTRAINT DF_arch_officials_status DEFAULT ('Active'),
        profile_image  varchar(255)   NULL,
        official_type  varchar(20)    NOT NULL CONSTRAINT DF_arch_officials_type DEFAULT ('Elected'),
        created_at     datetime2(7)   NULL CONSTRAINT DF_arch_officials_created DEFAULT (getdate()),
        updated_at     datetime2(7)   NULL CONSTRAINT DF_arch_officials_updated DEFAULT (getdate()),
        archived_at    datetime2(7)   NOT NULL CONSTRAINT DF_arch_officials_archived DEFAULT (getdate()),
        archived_by    varchar(150)   NULL,

        CONSTRAINT PK_archived_barangay_officials PRIMARY KEY CLUSTERED (id)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('dbo.archived_barangay_officials')
                 AND name = 'idx_arch_officials_archived_at')
    CREATE NONCLUSTERED INDEX idx_arch_officials_archived_at ON dbo.archived_barangay_officials (archived_at);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('dbo.archived_barangay_officials')
                 AND name = 'idx_arch_officials_position')
    CREATE NONCLUSTERED INDEX idx_arch_officials_position ON dbo.archived_barangay_officials (position);
GO

/* ============================================================================
   3. Seed data - dbo.barangay_officials
      IDENTITY_INSERT is switched on only for the statement that needs it, and
      each INSERT is wrapped in its own guard so a second run changes nothing.
   ============================================================================ */

IF NOT EXISTS (SELECT 1 FROM dbo.barangay_officials WHERE id = 1 OR official_id = 'OFF-2026-0001')
BEGIN
    SET IDENTITY_INSERT dbo.barangay_officials ON;
    INSERT INTO dbo.barangay_officials
        (id, official_id, first_name, middle_name, last_name, suffix, gender, birth_date,
         position, committee, term_start, term_end, mobile_number, email, address, status,
         profile_image, created_at, updated_at, official_type)
    VALUES
        (1, 'OFF-2026-0001', 'Roberto', '', 'Santos', '', 'Male', NULL,
         'Punong Barangay', 'Peace and Order', '2023-07-01', '2026-06-30', '09171234567',
         'rsantos@brgy49.gov.ph', NULL, 'Inactive',
         NULL, '2026-10-23T12:32:32', '2026-10-23T15:10:28', 'Elected');
    SET IDENTITY_INSERT dbo.barangay_officials OFF;
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.barangay_officials WHERE id = 2 OR official_id = 'OFF-2026-0002')
BEGIN
    SET IDENTITY_INSERT dbo.barangay_officials ON;
    INSERT INTO dbo.barangay_officials
        (id, official_id, first_name, middle_name, last_name, suffix, gender, birth_date,
         position, committee, term_start, term_end, mobile_number, email, address, status,
         profile_image, created_at, updated_at, official_type)
    VALUES
        (2, 'OFF-2026-0002', 'Maria', NULL, 'Cruz', NULL, 'Female', NULL,
         'Barangay Kagawad', 'Health', '2023-07-01', '2026-06-30', '0918-234-5678',
         'mcruz@brgy49.gov.ph', NULL, 'Active',
         NULL, '2026-10-23T12:32:32', '2026-10-23T12:32:32', 'Elected');
    SET IDENTITY_INSERT dbo.barangay_officials OFF;
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.barangay_officials WHERE id = 3 OR official_id = 'OFF-2026-0003')
BEGIN
    SET IDENTITY_INSERT dbo.barangay_officials ON;
    INSERT INTO dbo.barangay_officials
        (id, official_id, first_name, middle_name, last_name, suffix, gender, birth_date,
         position, committee, term_start, term_end, mobile_number, email, address, status,
         profile_image, created_at, updated_at, official_type)
    VALUES
        (3, 'OFF-2026-0003', 'Jose', NULL, 'Reyes', NULL, 'Male', NULL,
         'Barangay Kagawad', 'Infrastructure', '2023-07-01', '2026-06-30', '0919-345-6789',
         'jreyes@brgy49.gov.ph', NULL, 'Active',
         NULL, '2026-10-23T12:32:32', '2026-10-23T12:32:32', 'Elected');
    SET IDENTITY_INSERT dbo.barangay_officials OFF;
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.barangay_officials WHERE id = 4 OR official_id = 'OFF-2026-0004')
BEGIN
    SET IDENTITY_INSERT dbo.barangay_officials ON;
    INSERT INTO dbo.barangay_officials
        (id, official_id, first_name, middle_name, last_name, suffix, gender, birth_date,
         position, committee, term_start, term_end, mobile_number, email, address, status,
         profile_image, created_at, updated_at, official_type)
    VALUES
        (4, 'OFF-2026-0004', 'Anna', NULL, 'Bautista', NULL, 'Female', NULL,
         'Barangay Kagawad', 'Women and Family', '2023-07-01', '2026-06-30', '0920-456-7890',
         'abautista@brgy49.gov.ph', NULL, 'Active',
         NULL, '2026-10-23T12:32:32', '2026-10-23T12:32:32', 'Elected');
    SET IDENTITY_INSERT dbo.barangay_officials OFF;
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.barangay_officials WHERE id = 5 OR official_id = 'OFF-2026-0005')
BEGIN
    SET IDENTITY_INSERT dbo.barangay_officials ON;
    INSERT INTO dbo.barangay_officials
        (id, official_id, first_name, middle_name, last_name, suffix, gender, birth_date,
         position, committee, term_start, term_end, mobile_number, email, address, status,
         profile_image, created_at, updated_at, official_type)
    VALUES
        (5, 'OFF-2026-0005', 'Mark', NULL, 'Villanueva', NULL, 'Male', NULL,
         'SK Chairman', 'Youth and Sports', '2023-07-01', '2026-06-30', '0921-567-8901',
         'mvillanueva@brgy49.gov.ph', NULL, 'Active',
         NULL, '2026-10-23T12:32:32', '2026-10-23T12:32:32', 'Elected');
    SET IDENTITY_INSERT dbo.barangay_officials OFF;
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.barangay_officials WHERE id = 6 OR official_id = 'OFF-2026-0006')
BEGIN
    SET IDENTITY_INSERT dbo.barangay_officials ON;
    INSERT INTO dbo.barangay_officials
        (id, official_id, first_name, middle_name, last_name, suffix, gender, birth_date,
         position, committee, term_start, term_end, mobile_number, email, address, status,
         profile_image, created_at, updated_at, official_type)
    VALUES
        (6, 'OFF-2026-0006', 'Elena', NULL, 'Valdez', NULL, 'Female', NULL,
         'Barangay Secretary', NULL, '2023-07-01', '2026-06-30', '0922-678-9012',
         'sec.valdez@brgy49.gov.ph', NULL, 'Active',
         NULL, '2026-10-23T12:32:32', '2026-10-23T12:32:32', 'Appointed');
    SET IDENTITY_INSERT dbo.barangay_officials OFF;
END
GO

/* ============================================================================
   4. Seed data - dbo.archived_barangay_officials
   ============================================================================ */

IF NOT EXISTS (SELECT 1 FROM dbo.archived_barangay_officials WHERE id = 7 OR official_id = 'OFF-2026-0007')
BEGIN
    SET IDENTITY_INSERT dbo.archived_barangay_officials ON;
    INSERT INTO dbo.archived_barangay_officials
        (id, official_id, first_name, middle_name, last_name, suffix, gender, birth_date,
         position, committee, term_start, term_end, mobile_number, email, address, status,
         profile_image, official_type, created_at, updated_at, archived_at, archived_by)
    VALUES
        (7, 'OFF-2026-0007', 'Ricardo', NULL, 'Gomez', NULL, 'Male', NULL,
         'Barangay Treasurer', NULL, '2023-07-01', '2026-06-30', '0923-789-0123',
         'treas.gomez@brgy49.gov.ph', NULL, 'Active',
         NULL, 'Appointed', '2026-10-23T12:32:32', '2026-10-23T12:32:32',
         '2026-10-23T13:49:01', 'System Admin');
    SET IDENTITY_INSERT dbo.archived_barangay_officials OFF;
END
GO

/* ============================================================================
   5. Verify what is there (read-only)
   ============================================================================ */

SELECT 'barangay_officials' AS table_name,
       COUNT(*)              AS row_count,
       MAX(id)               AS max_id
FROM dbo.barangay_officials
UNION ALL
SELECT 'archived_barangay_officials',
       COUNT(*),
       MAX(id)
FROM dbo.archived_barangay_officials;
GO

SELECT id, official_id, first_name, last_name, position, status, official_type
FROM dbo.barangay_officials
ORDER BY id;
GO

SELECT id, official_id, first_name, last_name, position, status, official_type, archived_at, archived_by
FROM dbo.archived_barangay_officials
ORDER BY id;
GO
