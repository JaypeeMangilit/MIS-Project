<?php
/**
 * cleanup_archives.php
 *
 * Permanently removes archived records older than 30 days across all archive tables.
 *
 *   POST   cleanup_archives.php                     -> run cleanup for all tables
 *   POST   cleanup_archives.php?table=residents      -> run cleanup for one table only
 *
 * Supported tables: residents, officials, certificates, users, blotter
 *
 * Returns: { success, deleted, message }
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

require_once __DIR__ . '/../config/functions.php';
require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../config/app_session.php';

requireLogin();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'POST required']);
    exit;
}

// Only admins may purge archives.
$role = strtolower((string) ($_SESSION['role'] ?? ''));
if ($role !== 'admin' && $role !== 'superadmin') {
    echo json_encode(['success' => false, 'message' => 'Admin access required']);
    exit;
}

$allowedTables = [
    'residents',
    'officials',
    'certificates',
    'users',
    'blotter',
];

$table = isset($_GET['table']) ? strtolower((string) $_GET['table']) : '';
if ($table === '' || !in_array($table, $allowedTables, true)) {
    echo json_encode(['success' => false, 'message' => 'Invalid or missing table parameter']);
    exit;
}

$conn = getConnection();
$deleted = 0;

try {
    $conn->beginTransaction();

    switch ($table) {
        case 'residents':
            $stmt = $conn->prepare(
                'DELETE FROM archived_residents WHERE archived_at < DATEADD(day, -30, GETDATE())'
            );
            $stmt->execute();
            $deleted = $stmt->rowCount();
            break;

        case 'officials':
            $stmt = $conn->prepare(
                'DELETE FROM archived_barangay_officials WHERE archived_at < DATEADD(day, -30, GETDATE())'
            );
            $stmt->execute();
            $deleted = $stmt->rowCount();
            break;

        case 'certificates':
            $stmt = $conn->prepare(
                'DELETE FROM archived_certificate_issuances WHERE archived_at < DATEADD(day, -30, GETDATE())'
            );
            $stmt->execute();
            $deleted = $stmt->rowCount();
            break;

        case 'users':
            $stmt = $conn->prepare(
                'DELETE FROM archived_system_users WHERE archived_at < DATEADD(day, -30, GETDATE())'
            );
            $stmt->execute();
            $deleted = $stmt->rowCount();
            break;

        case 'blotter':
            // Hard-delete soft-deleted blotter cases older than 30 days.
            $stmt = $conn->prepare(
                'DELETE FROM blotter_cases WHERE archived = 1 AND archived_at < DATEADD(day, -30, GETDATE())'
            );
            $stmt->execute();
            $deleted = $stmt->rowCount();
            break;
    }

    $conn->commit();

    logUserActivity('Archive', 'Auto-cleaned archived ' . $table . ' records older than 30 days (' . $deleted . ' removed)');

    echo json_encode([
        'success' => true,
        'deleted' => $deleted,
        'message' => 'Archived ' . $table . ' records older than 30 days have been permanently deleted.',
    ]);
} catch (Throwable $e) {
    $conn->rollBack();
    error_log('Cleanup archives error: ' . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'Cleanup failed: ' . $e->getMessage(),
    ]);
}
