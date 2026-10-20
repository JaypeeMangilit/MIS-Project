<?php
/**
 * bootstrap.php - Shared entry point for every PHP request.
 *
 * Defines the application root and makes the config/ and api/ classes
 * available via spl_autoload_register(), so no file has to guess at a
 * relative path. Safe to require multiple times.
 */

if (!defined('APP_ROOT_DIR')) {
    define('APP_ROOT_DIR', __DIR__);
}

if (!defined('MIS_SYSTEM_DB_PATH')) {
    define('MIS_SYSTEM_DB_PATH', APP_ROOT_DIR . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'brgy49.sqlite');
}

// Support both a project-local php.ini and the one bundled with php.exe.
if (!defined('MIS_SYSTEM_PHP_INI')) {
    $candidate = APP_ROOT_DIR . DIRECTORY_SEPARATOR . 'php.ini';
    if (is_file($candidate)) {
        define('MIS_SYSTEM_PHP_INI', $candidate);
    }
}

spl_autoload_register(function ($name) {
    static $map = [
        'functions.php' => APP_ROOT_DIR . '/config/functions.php',
        'app_session.php' => APP_ROOT_DIR . '/config/app_session.php',
        'db_connection.php' => APP_ROOT_DIR . '/config/db_connection.php',
    ];

    $key = strtolower($name);
    if (isset($map[$key]) && is_file($map[$key])) {
        require_once $map[$key];
    }
});

// Conventional helper aliases.
if (!function_exists('asset_path')) {
    /** Resolve a path relative to the application root. */
    function asset_path(string $file): string
    {
        $relative = ltrim(str_replace('\\\\', '/', $file), '/');
        return APP_ROOT_DIR . DIRECTORY_SEPARATOR . $relative;
    }
}

if (!function_exists('auto_version')) {
    /** Append a filemtime cache-buster to an asset path. */
    function auto_version(string $file): string
    {
        $file = ltrim(str_replace('\\\\', '/', $file), '/');
        $full_path = asset_path($file);

        if (file_exists($full_path)) {
            return '/' . $file . '?v=' . filemtime($full_path);
        }

        return '/' . $file;
    }
}
