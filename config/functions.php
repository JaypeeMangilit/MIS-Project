<?php

/**
 * Get the application root directory path
 * 
 * @return string
 */
function app_root_path(): string {
    return rtrim($_SERVER['DOCUMENT_ROOT'] ?? dirname(__DIR__), DIRECTORY_SEPARATOR);
}

/**
 * Get the full filesystem path for an asset
 * 
 * @param string $file
 * @return string
 */
function asset_path(string $file): string {
    $relative = ltrim(str_replace('\\', '/', $file), '/');
    return app_root_path() . DIRECTORY_SEPARATOR . $relative;
}

/**
 * Auto-versioning function for assets
 *
 * @param string $file
 * @return string
 */
function auto_version(string $file): string {
    $file = ltrim(str_replace('\\', '/', $file), '/');
    $full_path = asset_path($file);

    if (file_exists($full_path)) {
        $version = filemtime($full_path);
        return '/' . $file . '?v=' . $version;
    }

    return '/' . $file;
}

/**
 * Alternative: Version with timestamp (always fresh)
 *
 * @param string $file
 * @return string
 */
function timestamp_version(string $file): string {
    return '/' . ltrim(str_replace('\\', '/', $file), '/') . '?t=' . time();
}

/**
 * For CSS files only - force reload
 *
 * @param string $file
 * @return string
 */
function css_version(string $file): string {
    $full_path = asset_path($file);
    if (file_exists($full_path)) {
        return '/' . ltrim(str_replace('\\', '/', $file), '/') . '?v=' . filemtime($full_path);
    }
    return '/' . ltrim(str_replace('\\', '/', $file), '/');
}

/**
 * For JS files only
 *
 * @param string $file
 * @return string
 */
function js_version(string $file): string {
    $full_path = asset_path($file);
    if (file_exists($full_path)) {
        return '/' . ltrim(str_replace('\\', '/', $file), '/') . '?v=' . filemtime($full_path);
    }
    return '/' . ltrim(str_replace('\\', '/', $file), '/');
}



/**
 * Store a password for a system user.
 *
 * Passwords are kept in plain text on purpose: this system is used by barangay
 * staff who are not programmers, and the owner needs to be able to read and
 * reset a password directly in the database. Do not reintroduce hashing here
 * without the owner's explicit approval.
 *
 * @param string $password
 * @return string
 */
function store_password(string $password): string {
    return $password;
}

/**
 * Verify a password against the stored value.
 *
 * New and current accounts use plain text (see store_password()). Older
 * databases may contain MD5 values, and password_hash() values are accepted
 * for compatibility with accounts created outside this code path.
 *
 * @param string $password
 * @param string $stored
 * @return bool
 */
function verify_password(string $password, string $stored): bool {
    if ($stored === '') {
        return false;
    }

    if (password_verify($password, $stored)) {
        return true;
    }

    if (preg_match('/\A[a-f0-9]{32}\z/i', $stored)) {
        return hash_equals(strtolower($stored), md5($password));
    }

    return hash_equals($stored, $password);
}

// ============================================
// Role-based authentication helpers
// ============================================

/**
 * Map a user_id prefix to its expected role.
 *
 * @param string $prefix  The alphabetic prefix (e.g. 'AD', 'COU')
 * @return string|null    The expected role name, or null if prefix is unknown
 */
function role_prefix_to_role(string $prefix): ?string {
    $map = [
        'AD'   => 'Admin',
        'COU'  => 'Councilor',
        'CAP'  => 'Captain',
        'KAD'  => 'Kagawad',
    ];
    return $map[strtoupper($prefix)] ?? null;
}

/**
 * Extract the alphabetic prefix from a user_id.
 *
 * @param string $userId  e.g. 'AD001', 'COU001'
 * @return string         e.g. 'AD', 'COU'
 */
function extract_role_prefix(string $userId): string {
    $prefix = '';
    foreach (str_split($userId) as $ch) {
        if (ctype_alpha($ch)) {
            $prefix .= strtoupper($ch);
        } else {
            break;
        }
    }
    return $prefix;
}

/**
 * Validate that a user's ID prefix and assigned role are consistent.
 *
 * @param string $userId  The user's ID (e.g. 'AD001')
 * @param string $role    The user's stored role (e.g. 'Admin')
 * @return bool           True if prefix and role agree
 */
function validate_user_role(string $userId, string $role): bool {
    $prefix = extract_role_prefix($userId);
    if ($prefix === '') {
        return false;
    }

    // Current account creation and the default seed use USR IDs with the
    // roles exposed in the user-management form.
    if ($prefix === 'USR') {
        return in_array($role, array_merge(valid_roles(), ['Administrator', 'Secretary', 'Encoder']), true);
    }

    $expectedRole = role_prefix_to_role($prefix);
    if ($expectedRole === null) {
        return false;
    }
    return $expectedRole === $role;
}

/**
 * Get the list of valid role prefixes.
 *
 * @return string[]
 */
function valid_role_prefixes(): array {
    return ['AD', 'COU', 'CAP', 'KAD'];
}

/**
 * Get the list of valid roles.
 *
 * 'Secretary' was added when User Management was wired to system_users: it is
 * the role the barangay uses for the account that runs the system day to day.
 * Additive only - the USR-prefix branch of validate_user_role() already
 * accepted 'Secretary', so no existing account's ability to log in changes.
 *
 * @return string[]
 */
function valid_roles(): array {
    return ['Admin', 'Councilor', 'Captain', 'Kagawad', 'Secretary'];
}

// ============================================
// Activity logging
// ============================================

/**
 * Record an activity for the signed-in user.
 *
 * Shared by every module's endpoint: call it AFTER the write has succeeded, never
 * before, so a failed operation is never recorded as a completed action. Put the
 * module in $type (e.g. 'Resident', 'Certificate') and the record reference in
 * $description - user_activity_log has no separate module/record column.
 *
 * Attribution comes from $_SESSION['user_id'] (the system_users PK that
 * api/login.php sets), never from the request body: a client-supplied id is how
 * one user's actions end up on another user's history. A no-op when nobody is
 * signed in, and it must stay that way for logout, which has to capture the id
 * before the session is cleared.
 *
 * Never put a password, a password hash, a session id or a token in $description.
 *
 * @param string $type         Short machine-readable label, e.g. 'Resident'
 * @param string $description  What happened, safe for any system user to read
 */
function logUserActivity(string $type, string $description): void
{
    if (!function_exists('isLoggedIn') || !isLoggedIn()) {
        return;
    }

    $userId = $_SESSION['user_id'] ?? null;
    if ($userId === null || $userId === '') {
        return;
    }

    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    insertRecord(
        "INSERT INTO user_activity_log (user_id, activity_type, activity_description, ip_address)
         VALUES (?, ?, ?, ?)",
        [(int) $userId, $type, $description, $ip],
        'isss'
    );
}
