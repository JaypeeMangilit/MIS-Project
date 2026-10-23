<?php
/**
 * create_officials_tables.php - Prepares the Barangay Officials storage in brgy49_db.
 *
 * Does three things, each only when it is actually needed, and never drops,
 * alters destructively or deletes anything:
 *
 *   1. adds barangay_officials.official_type  ('Elected' | 'Appointed')
 *   2. creates archived_barangay_officials    (mirror of the live table + archive metadata)
 *   3. seeds the seven officials that used to be hardcoded in modules/officials.js,
 *      but only while barangay_officials is still empty
 *
 * Usage:  php install/create_officials_tables.php
 */

require_once __DIR__ . '/../config/functions.php';
require_once __DIR__ . '/../config/db_connection.php';

header('Content-Type: text/plain');

$conn = getConnection();
if (!$conn) {
    echo "Could not connect to the database.\n";
    exit(1);
}

echo "Connected: " . currentDbDriver() . " / " . DB_NAME . "\n\n";
$log = [];

// ---------------------------------------------------------------------------
// 1. barangay_officials.official_type
// ---------------------------------------------------------------------------
$hasType = getRecord(
    "SELECT c.name AS name FROM sys.columns c
     WHERE c.object_id = OBJECT_ID('barangay_officials') AND c.name = 'official_type'"
);
if ($hasType) {
    $log[] = "SKIP  barangay_officials.official_type (already exists)";
} else {
    $conn->exec(
        "ALTER TABLE barangay_officials
         ADD official_type VARCHAR(20) NOT NULL
             CONSTRAINT DF_barangay_officials_type DEFAULT ('Elected')"
    );
    $log[] = "ALTER barangay_officials ADD official_type VARCHAR(20) NOT NULL DEFAULT ('Elected')";
}

// ---------------------------------------------------------------------------
// 2. archived_barangay_officials
// ---------------------------------------------------------------------------
$archiveExists = getRecord("SELECT OBJECT_ID(?) AS oid", ['archived_barangay_officials'], 's');
if (!empty($archiveExists['oid'])) {
    $log[] = "SKIP  archived_barangay_officials (already exists)";
} else {
    $conn->exec("
        CREATE TABLE archived_barangay_officials (
            id            INT IDENTITY(1,1) NOT NULL,
            official_id   VARCHAR(20)  NULL,
            first_name    VARCHAR(100) NOT NULL,
            middle_name   VARCHAR(100) NULL,
            last_name     VARCHAR(100) NOT NULL,
            suffix        VARCHAR(20)  NULL,
            gender        VARCHAR(10)  NOT NULL,
            birth_date    DATE         NULL,
            position      VARCHAR(100) NOT NULL,
            committee     VARCHAR(100) NULL,
            term_start    DATE         NOT NULL,
            term_end      DATE         NOT NULL,
            mobile_number VARCHAR(20)  NOT NULL,
            email         VARCHAR(100) NULL,
            address       VARCHAR(200) NULL,
            status        VARCHAR(20)  NULL CONSTRAINT DF_arch_officials_status DEFAULT ('Active'),
            profile_image VARCHAR(255) NULL,
            official_type VARCHAR(20)  NOT NULL CONSTRAINT DF_arch_officials_type DEFAULT ('Elected'),
            created_at    DATETIME2    NULL CONSTRAINT DF_arch_officials_created DEFAULT (GETDATE()),
            updated_at    DATETIME2    NULL CONSTRAINT DF_arch_officials_updated DEFAULT (GETDATE()),
            archived_at   DATETIME2    NOT NULL CONSTRAINT DF_arch_officials_archived DEFAULT (GETDATE()),
            archived_by   VARCHAR(150) NULL,
            CONSTRAINT PK_archived_barangay_officials PRIMARY KEY (id)
        )
    ");
    $log[] = "CREATE archived_barangay_officials";

    $conn->exec("CREATE INDEX idx_arch_officials_archived_at ON archived_barangay_officials (archived_at)");
    $log[] = "CREATE index idx_arch_officials_archived_at";
    $conn->exec("CREATE INDEX idx_arch_officials_position ON archived_barangay_officials (position)");
    $log[] = "CREATE index idx_arch_officials_position";
}

// ---------------------------------------------------------------------------
// 3. seed the seven officials that were hardcoded in modules/officials.js
//    (only while the table is empty - never touches existing rows)
// ---------------------------------------------------------------------------
$count = getRecord("SELECT COUNT(*) AS n FROM barangay_officials");
if ((int) ($count['n'] ?? 0) > 0) {
    $log[] = "SKIP  seed (" . $count['n'] . " row(s) already in barangay_officials)";
} else {
    // first, middle, last, suffix, gender, birth_date (left NULL - not in the old mock
    // data, fill it in through the Edit form), position, committee,
    // mobile, email, address, status, type, term_start, term_end
    $seed = [
        ['Roberto', null, 'Santos',    null, 'Male',   null, 'Punong Barangay',    'Peace and Order',    '0917-123-4567', 'rsantos@brgy49.gov.ph',     null, 'Active', 'Elected',   '2023-07-01', '2026-06-30'],
        ['Maria',   null, 'Cruz',      null, 'Female', null, 'Barangay Kagawad',   'Health',             '0918-234-5678', 'mcruz@brgy49.gov.ph',       null, 'Active', 'Elected',   '2023-07-01', '2026-06-30'],
        ['Jose',    null, 'Reyes',     null, 'Male',   null, 'Barangay Kagawad',   'Infrastructure',     '0919-345-6789', 'jreyes@brgy49.gov.ph',      null, 'Active', 'Elected',   '2023-07-01', '2026-06-30'],
        ['Anna',    null, 'Bautista',  null, 'Female', null, 'Barangay Kagawad',   'Women and Family',   '0920-456-7890', 'abautista@brgy49.gov.ph',   null, 'Active', 'Elected',   '2023-07-01', '2026-06-30'],
        ['Mark',    null, 'Villanueva',null, 'Male',   null, 'SK Chairman',        'Youth and Sports',   '0921-567-8901', 'mvillanueva@brgy49.gov.ph', null, 'Active', 'Elected',   '2023-07-01', '2026-06-30'],
        ['Elena',   null, 'Valdez',    null, 'Female', null, 'Barangay Secretary', null,                 '0922-678-9012', 'sec.valdez@brgy49.gov.ph',  null, 'Active', 'Appointed', '2023-07-01', '2026-06-30'],
        ['Ricardo', null, 'Gomez',     null, 'Male',   null, 'Barangay Treasurer', null,                 '0923-789-0123', 'treas.gomez@brgy49.gov.ph', null, 'Active', 'Appointed', '2023-07-01', '2026-06-30'],
    ];

    $year = date('Y');
    $seq = 1;
    foreach ($seed as $row) {
        $officialId = 'OFF-' . $year . '-' . str_pad((string) $seq, 4, '0', STR_PAD_LEFT);
        $ok = insertRecord(
            "INSERT INTO barangay_officials
                (official_id, first_name, middle_name, last_name, suffix, gender, birth_date,
                 position, committee, mobile_number, email, address, status, official_type,
                 term_start, term_end)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            array_merge([$officialId], array_slice($row, 0, 15)),
            'ssssssssssssssss'
        );
        $log[] = ($ok ? "SEED  " : "FAIL  ") . $officialId . "  " . $row[0] . ' ' . $row[2] . "  (" . $row[12] . ")";
        $seq++;
    }
}

foreach ($log as $line) {
    echo $line . "\n";
}

echo "\nDone. Nothing was dropped, altered destructively or deleted.\n";
