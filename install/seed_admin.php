<?php
/**
 * seed_admin.php - Creates the default administrator account in brgy49_db.
 *
 * Safe to run repeatedly: it skips the insert when the username already exists.
 *
 * Usage:  php install/seed_admin.php
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

$username = 'admin';
$password = 'admin1234';

$existing = getRecord(
    "SELECT id, username, role, status, password FROM system_users WHERE username = ?",
    [$username],
    's'
);

if ($existing) {
    echo "User '{$username}' already exists (id={$existing['id']}, role={$existing['role']}, status={$existing['status']}).\n";
    echo "Nothing to do.\n";
    exit(0);
}

// Next USR-xxxx identifier.
$countRow = getRecord("SELECT COUNT(*) AS n FROM system_users", []);
$next = (int) ($countRow['n'] ?? 0) + 1;
$userId = 'USR-' . str_pad((string) $next, 4, '0', STR_PAD_LEFT);

$storedPassword = store_password($password);

$sql = "INSERT INTO system_users
            (user_id, first_name, middle_name, last_name, suffix, username, password,
             email, mobile_number, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, " . db_now_sql() . ", " . db_now_sql() . ")";

$params = [
    $userId,
    'System',
    '',
    'Admin',
    '',
    $username,
    $storedPassword,
    'admin@barangay.local',
    '',
    'Administrator',
    'Active',
];

try {
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);

    echo "Created administrator account:\n";
    echo "  user_id   : {$userId}\n";
    echo "  username  : {$username}\n";
    echo "  password  : {$password}\n";
    echo "  role      : Administrator\n";
    echo "  status    : Active\n";
    echo "\nChange this password after the first sign-in.\n";
} catch (Throwable $e) {
    echo "Failed to create the account: " . $e->getMessage() . "\n";
    exit(1);
}
