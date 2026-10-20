<?php
/**
 * session.php (API) - Reports the current authentication state.
 *
 * GET  -> 200 { authenticated: true,  user: {...} }
 * GET  -> 200 { authenticated: false }
 *
 * This lets the browser restore the signed-in view without a full page reload.
 */

require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../config/app_session.php';

header('Content-Type: application/json');

if (!isLoggedIn()) {
    echo json_encode(['authenticated' => false]);
    exit;
}

$user = getRecord(
    "SELECT id, user_id, first_name, middle_name, last_name, suffix, username, email,
            mobile_number, role, status, last_login
       FROM system_users WHERE id = ?",
    [$_SESSION['user_id']],
    'i'
);

if (!$user) {
    // The session points at a user that no longer exists.
    $_SESSION = [];
    session_destroy();
    echo json_encode(['authenticated' => false]);
    exit;
}

$fullName = trim(implode(' ', array_filter([
    $user['first_name'] ?? '',
    $user['middle_name'] ?? '',
    $user['last_name'] ?? '',
    $user['suffix'] ?? '',
])));

echo json_encode([
    'authenticated' => true,
    'user' => [
        'id'            => $user['id'],
        'user_id'       => $user['user_id'] ?? null,
        'name'          => $fullName,
        'first_name'    => $user['first_name'] ?? '',
        'last_name'     => $user['last_name'] ?? '',
        'username'      => $user['username'],
        'email'         => $user['email'] ?? null,
        'mobile_number' => $user['mobile_number'] ?? null,
        'role'          => $user['role'],
        'status'        => $user['status'],
    ],
]);
