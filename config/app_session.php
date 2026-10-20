<?php
// app_session.php - Shared session helpers for the BMIS application.
// Always load this AFTER config/functions.php.

if (session_status() === PHP_SESSION_NONE) {
    $sessionName = 'BMIS_SESSION';
    session_name($sessionName);
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_set_cookie_params([
        'lifetime' => 8 * 3600,
        'path'     => '/',
        'httponly' => true,
        'secure'   => $https,
        'samesite' => 'Lax',
    ]);
    session_start();
}

/**
 * Whether the current request has a valid authenticated session.
 */
function isLoggedIn(): bool
{
    return !empty($_SESSION['user_id']) && !empty($_SESSION['username']);
}

/**
 * Ensure an authenticated session, or terminate with a JSON error.
 * Used by every api/*.php endpoint.
 */
function requireLogin(): void
{
    header('Content-Type: application/json');
    if (!isLoggedIn()) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'message' => 'Session expired. Please sign in again.',
            'code'    => 'AUTH_REQUIRED',
        ]);
        exit;
    }
}

/**
 * Require the current user to have one of the allowed roles.
 * If no roles are specified, any authenticated user is accepted.
 *
 * @param string[] $allowedRoles
 */
function requireRole(array $allowedRoles = []): void
{
    requireLogin();

    if (empty($allowedRoles)) {
        return;
    }

    $userRole = $_SESSION['role'] ?? '';
    if (!in_array($userRole, $allowedRoles, true)) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'message' => 'You do not have permission to access this resource.',
            'code'    => 'FORBIDDEN',
        ]);
        exit;
    }
}

/**
 * Require an authenticated session for a non-API page request.
 * Redirects back to the login screen instead of printing JSON.
 */
function requireLoginOrRedirect(): void
{
    if (isLoggedIn()) {
        return;
    }
    header('Location: login.php');
    exit;
}
