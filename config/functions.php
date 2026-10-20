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
 * Hash a password with the algorithm PHP supports.
 *
 * @param string $password
 * @return string
 */
function hash_password(string $password): string {
    return password_hash($password, PASSWORD_DEFAULT);
}

/**
 * Verify a plain password against a stored value.
 *
 * Supports three formats:
 * - Modern bcrypt (password_hash / password_verify)
 * - Legacy MD5 (32-char hex)
 * - Plaintext (direct comparison, for beginner-friendly setup)
 *
 * @param string $password
 * @param string $hash
 * @return bool
 */
function verify_password(string $password, string $hash): bool {
    if ($hash === '') {
        return false;
    }

    // bcrypt hash
    if (str_starts_with($hash, '$2y$') || str_starts_with($hash, '$2a$')) {
        return password_verify($password, $hash);
    }

    // Legacy MD5 hashes
    if (strlen($hash) === 32 && ctype_xdigit($hash)) {
        return hash_equals($hash, md5($password));
    }

    // Plaintext comparison (for beginner-friendly setup)
    return hash_equals($hash, $password);
}

/**
 * Whether a stored value should be upgraded to password_hash() on next login.
 *
 * @param string $hash
 * @return bool
 */
function needs_password_rehash(string $hash): bool {
    if ($hash === '') {
        return true;
    }

    // bcrypt hash
    if (str_starts_with($hash, '$2y$') || str_starts_with($hash, '$2a$')) {
        return password_needs_rehash($hash, PASSWORD_DEFAULT);
    }

    // MD5 or plaintext — both should be upgraded
    return true;
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
 * @return string[]
 */
function valid_roles(): array {
    return ['Admin', 'Councilor', 'Captain', 'Kagawad'];
}
