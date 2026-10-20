<?php
/**
 * login.php (API) - Authenticates a user against system_users.
 *
 * POST { "username": "...", "password": "..." }
 * Returns 200 { success: true, user: {...} } or 401 { success: false, message: "..." }
 */

require_once __DIR__ . '/../config/functions.php';
require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../config/app_session.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// --- Basic brute force protection -------------------------------------------
$ipKey = 'login_attempts_' . md5($_SERVER['REMOTE_ADDR'] ?? 'unknown');
$attempts = (int) ($_SESSION[$ipKey]['count'] ?? 0);
$lastAttempt = (int) ($_SESSION[$ipKey]['time'] ?? 0);

if ($attempts >= 10 && (time() - $lastAttempt) < 900) {
    http_response_code(429);
    echo json_encode([
        'success' => false,
        'message' => 'Too many attempts. Please try again in 15 minutes.',
    ]);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid request body']);
    exit;
}

$username = trim((string) ($data['username'] ?? ''));
$password = (string) ($data['password'] ?? '');

if ($username === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Username and password are required']);
    exit;
}

// --- Look the user up ---------------------------------------------------------
$sql = "SELECT * FROM system_users WHERE (username = ? OR email = ?) AND status = 'Active'";
$user = getRecord($sql, [$username, $username], 'ss');

if (!$user || !verify_password($password, (string) $user['password'])) {
    $_SESSION[$ipKey] = [
        'count' => $attempts + 1,
        'time'  => time(),
    ];

    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Invalid username or password']);
    exit;
}

// --- Validate role prefix consistency -----------------------------------------
$userId = (string) ($user['user_id'] ?? '');
$role = (string) ($user['role'] ?? '');

if (!validate_user_role($userId, $role)) {
    $_SESSION[$ipKey] = [
        'count' => $attempts + 1,
        'time'  => time(),
    ];

    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'Account role configuration is invalid. Contact an administrator.',
    ]);
    exit;
}

// --- Upgrade a legacy MD5 hash to a modern bcrypt hash on successful login ----
if (needs_password_rehash((string) $user['password'])) {
    $newHash = hash_password($password);
    $updateHash = "UPDATE system_users SET password = ? WHERE id = ?";
    executeStatement($updateHash, [$newHash, $user['id']], 'si');
}

// --- Record the session ------------------------------------------------------
session_regenerate_id(true);

$fullName = trim(implode(' ', array_filter([
    $user['first_name'] ?? '',
    $user['middle_name'] ?? '',
    $user['last_name'] ?? '',
    $user['suffix'] ?? '',
])));

$_SESSION['user_id']  = $user['id'];
$_SESSION['username'] = $user['username'];
$_SESSION['role']     = $role;
$_SESSION['name']     = $fullName;
$_SESSION['login_at'] = time();

// --- Housekeeping ------------------------------------------------------------
$updateSql = "UPDATE system_users SET last_login = " . db_now_sql() . " WHERE id = ?";
executeStatement($updateSql, [$user['id']], 'i');

$logSql = "INSERT INTO user_activity_log (user_id, activity_type, activity_description, ip_address)
           VALUES (?, 'Login', 'User logged in successfully', ?)";
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
insertRecord($logSql, [$user['id'], $ip], 'is');

// Clear the failed-attempt counter for this client.
unset($_SESSION[$ipKey]);

echo json_encode([
    'success' => true,
    'user' => [
        'id'            => $user['id'],
        'user_id'       => $user['user_id'] ?? null,
        'name'          => $fullName,
        'first_name'    => $user['first_name'] ?? '',
        'last_name'     => $user['last_name'] ?? '',
        'username'      => $user['username'],
        'email'         => $user['email'] ?? null,
        'mobile_number' => $user['mobile_number'] ?? null,
        'role'          => $role,
        'status'        => $user['status'],
    ],
]);
