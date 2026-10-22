<?php
/**
 * create_certificates_table.php - Creates the certificate issuance tables in brgy49_db.
 *
 * Creates:
 *   certificate_issuances          - live certificate issuance records
 *   archived_certificate_issuances - archived copies (mirrors archived_residents)
 *
 * Safe to run repeatedly: each object is created only when it does not exist.
 * It never drops, alters or deletes anything.
 *
 * Usage:  php install/create_certificates_table.php
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

/** Create a table when it is missing. */
function createTableIfMissing(PDO $conn, string $table, string $ddl, array &$log): void
{
    $exists = getRecord("SELECT OBJECT_ID(?) AS oid", [$table], 's');
    if (!empty($exists['oid'])) {
        $log[] = "SKIP  $table (already exists)";
        return;
    }

    $conn->exec($ddl);
    $log[] = "CREATE $table";
}

/** Create an index when it is missing. */
function createIndexIfMissing(PDO $conn, string $table, string $index, string $columns, array &$log): void
{
    $exists = getRecord(
        "SELECT i.name AS name FROM sys.indexes i
         WHERE i.object_id = OBJECT_ID(?) AND i.name = ?",
        [$table, $index],
        'ss'
    );
    if ($exists) {
        $log[] = "SKIP  index $index";
        return;
    }

    $conn->exec("CREATE INDEX $index ON $table ($columns)");
    $log[] = "CREATE index $index on $table ($columns)";
}

$log = [];

// Columns shared by the live and the archived table, so the archive stays a 1:1 copy.
$sharedColumns = "
    id INT IDENTITY(1,1) NOT NULL,
    resident_id INT NOT NULL,
    certificate_type VARCHAR(100) NOT NULL,
    purpose VARCHAR(255) NOT NULL,
    or_number VARCHAR(50) NULL,
    amount_paid DECIMAL(10,2) NOT NULL CONSTRAINT DF_%s_amount DEFAULT (0),
    date_issued DATE NOT NULL,
    valid_until DATE NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT DF_%s_status DEFAULT ('Valid'),
    issued_by VARCHAR(150) NULL,
    created_at DATETIME NOT NULL CONSTRAINT DF_%s_created DEFAULT (GETDATE()),
    updated_at DATETIME NULL";

createTableIfMissing($conn, 'certificate_issuances', sprintf("
    CREATE TABLE certificate_issuances (
        %s,
        CONSTRAINT PK_certificate_issuances PRIMARY KEY (id),
        CONSTRAINT FK_certificate_issuances_residents FOREIGN KEY (resident_id) REFERENCES residents(id)
    )", sprintf($sharedColumns, 'cert_iss', 'cert_iss', 'cert_iss')), $log);

createTableIfMissing($conn, 'archived_certificate_issuances', sprintf("
    CREATE TABLE archived_certificate_issuances (
        %s,
        archived_at DATETIME NOT NULL CONSTRAINT DF_arch_cert_archived DEFAULT (GETDATE()),
        archived_by VARCHAR(150) NULL,
        CONSTRAINT PK_archived_certificate_issuances PRIMARY KEY (id)
    )", sprintf($sharedColumns, 'arch_cert', 'arch_cert', 'arch_cert')), $log);

createIndexIfMissing($conn, 'certificate_issuances', 'idx_certificate_issuances_date', 'date_issued', $log);
createIndexIfMissing($conn, 'certificate_issuances', 'idx_certificate_issuances_type', 'certificate_type', $log);
createIndexIfMissing($conn, 'certificate_issuances', 'idx_certificate_issuances_status', 'status', $log);
createIndexIfMissing($conn, 'certificate_issuances', 'idx_certificate_issuances_resident', 'resident_id', $log);
createIndexIfMissing($conn, 'archived_certificate_issuances', 'idx_arch_cert_date', 'date_issued', $log);
createIndexIfMissing($conn, 'archived_certificate_issuances', 'idx_arch_cert_resident', 'resident_id', $log);

foreach ($log as $line) {
    echo $line . "\n";
}

echo "\nDone. Existing rows were not touched.\n";
