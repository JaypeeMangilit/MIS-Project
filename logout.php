<?php
/**
 * logout.php - Ends the current session and returns to the sign-in screen.
 */

require_once __DIR__ . '/config/functions.php';
require_once __DIR__ . '/config/app_session.php';

// Clear every session variable, then destroy the session.
$_SESSION = [];

if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        time() - 42000,
        $params['path'],
        $params['domain'],
        $params['secure'],
        $params['httponly']
    );
}

session_destroy();

// If the request is an API call, answer with JSON; otherwise redirect.
if (stripos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false) {
    header('Content-Type: application/json');
    echo json_encode(['success' => true, 'message' => 'Signed out']);
    exit;
}

header('Location: login.php');
exit;
