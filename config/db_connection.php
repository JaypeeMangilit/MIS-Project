<?php
// Local development configuration for manual PHP server usage.
// Falls back to SQLite automatically if SQL Server/MySQL drivers are unavailable.
define('DB_HOST', 'localhost\\SQLEXPRESS'); // Update to 'localhost\SQLEXPRESS' if using SQL Server Express
define('DB_NAME', 'brgy49_db');
define('DB_USER', 'mis_user');
define('DB_PASS', 'YourMISPassword');
define('APP_ROOT', dirname(__DIR__));
define('DB_SQLITE_PATH', APP_ROOT . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'brgy49.sqlite');

// ODBC driver used to reach SQL Server when php_sqlsrv.dll is not installed.
define('DB_ODBC_DRIVER', 'ODBC Driver 17 for SQL Server');

$db_connected = false;
$db_connection = null;
$last_db_error = '';

/**
 * The message captured by the most recent failed database operation.
 *
 * APIs return JSON; without this the only signal a caller gets from
 * insertRecord()/executeQuery() is `false`, which is impossible to debug
 * from the browser. Empty string means nothing has failed yet.
 *
 * @return string
 */
function lastDbError(): string
{
    global $last_db_error;

    return $last_db_error;
}

function recordDbError(string $message): void
{
    global $last_db_error;

    $last_db_error = $message;
    error_log($message);
}

function getAvailableDbDriver() {
    if (!class_exists('PDO')) {
        return null;
    }

    $drivers = PDO::getAvailableDrivers();

    if (in_array('sqlsrv', $drivers, true)) {
        return 'sqlsrv';
    }

    // SQL Server is reachable through PDO_ODBC on machines without php_sqlsrv.
    if (in_array('odbc', $drivers, true)) {
        return 'odbc';
    }

    if (in_array('mysql', $drivers, true)) {
        return 'mysql';
    }

    if (in_array('sqlite', $drivers, true)) {
        return 'sqlite';
    }

    return null;
}

/**
 * The PDO driver name of the connection currently in use.
 *
 * @return string|null
 */
function currentDbDriver() {
    global $db_connection;

    if (!$db_connection instanceof PDO) {
        return null;
    }

    return $db_connection->getAttribute(PDO::ATTR_DRIVER_NAME);
}

/**
 * SQL expression for "the current timestamp", valid for the active driver.
 * SQL Server has no NOW(); MySQL/SQLite do.
 *
 * @return string
 */
function db_now_sql() {
    $driver = currentDbDriver();

    if (in_array($driver, ['sqlsrv', 'odbc', 'dblib', 'mssql'], true)) {
        return 'GETDATE()';
    }

    if ($driver === 'sqlite') {
        return 'CURRENT_TIMESTAMP';
    }

    return 'NOW()';
}

/**
 * Normalise a value for a SQL Server `time` column, yielding "H:i:s".
 *
 * ODBC Driver 17 refuses to cast "HH:MM" or "" into a `time` column, raising
 * SQLSTATE[22018] "Invalid character value for cast specification". "HH:MM" is what
 * a browser <input type="time"> returns for a value the user typed by hand, and ""
 * is what an untouched optional field sends - both are common, and both abort the
 * INSERT. Returns null for an empty or unparseable value so a nullable column
 * stores NULL instead of an empty string.
 *
 * @param mixed $value
 * @return string|null
 */
function to_db_time($value): ?string
{
    $value = trim((string) $value);

    if ($value === '') {
        return null;
    }

    $timestamp = strtotime($value);

    if ($timestamp === false) {
        return null;
    }

    return date('H:i:s', $timestamp);
}

/**
 * Normalise a value for a SQL Server `date` column, yielding "Y-m-d".
 *
 * Same contract as to_db_time(). Accepts ISO ("2026-10-24") and US-style
 * ("10/24/2026") input; ODBC rejects the latter outright with SQLSTATE[22018].
 *
 * @param mixed $value
 * @return string|null
 */
function to_db_date($value): ?string
{
    $value = trim((string) $value);

    if ($value === '') {
        return null;
    }

    $timestamp = strtotime($value);

    if ($timestamp === false) {
        return null;
    }

    return date('Y-m-d', $timestamp);
}

function ensureSqliteDatabase() {
    $directory = dirname(DB_SQLITE_PATH);
    if (!is_dir($directory) && !mkdir($directory, 0777, true) && !is_dir($directory)) {
        throw new RuntimeException('Unable to create SQLite database directory.');
    }

    $conn = new PDO('sqlite:' . DB_SQLITE_PATH);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $conn->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    $conn->exec("
        CREATE TABLE IF NOT EXISTS system_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            first_name TEXT,
            middle_name TEXT,
            last_name TEXT,
            suffix TEXT,
            username TEXT UNIQUE,
            password TEXT,
            email TEXT,
            mobile_number TEXT,
            role TEXT,
            status TEXT,
            address TEXT,
            last_login DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $conn->exec("
        CREATE TABLE IF NOT EXISTS residents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id TEXT,
            first_name TEXT,
            middle_name TEXT,
            last_name TEXT,
            suffix TEXT,
            gender TEXT,
            birth_date TEXT,
            age INTEGER,
            place_of_birth TEXT,
            civil_status TEXT,
            nationality TEXT,
            occupation TEXT,
            voter_status TEXT,
            resident_status TEXT,
            purok TEXT,
            street_name TEXT,
            house_no TEXT,
            mobile_number TEXT,
            email TEXT,
            emergency_person TEXT,
            emergency_relation TEXT,
            emergency_contact TEXT,
            profile_image TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $conn->exec("
        CREATE TABLE IF NOT EXISTS blotter_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_number TEXT,
            case_type TEXT,
            location TEXT,
            incident_date TEXT,
            incident_time TEXT,
            complainant_name TEXT,
            complainant_contact TEXT,
            complainant_address TEXT,
            respondent_name TEXT,
            respondent_contact TEXT,
            respondent_address TEXT,
            incident_summary TEXT,
            assigned_officer TEXT,
            status TEXT,
            schedule_date TEXT,
            schedule_time TEXT,
            reported_date TEXT,
            reported_time TEXT,
            archived INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $conn->exec("
        CREATE TABLE IF NOT EXISTS user_activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            activity_type TEXT,
            activity_description TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $conn->exec("
        CREATE TABLE IF NOT EXISTS archived_residents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id TEXT,
            first_name TEXT,
            middle_name TEXT,
            last_name TEXT,
            suffix TEXT,
            gender TEXT,
            birth_date TEXT,
            age INTEGER,
            place_of_birth TEXT,
            civil_status TEXT,
            nationality TEXT,
            occupation TEXT,
            voter_status TEXT,
            resident_status TEXT,
            purok TEXT,
            street_name TEXT,
            house_no TEXT,
            mobile_number TEXT,
            email TEXT,
            emergency_person TEXT,
            emergency_relation TEXT,
            emergency_contact TEXT,
            profile_image TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $count = (int) $conn->query('SELECT COUNT(*) FROM system_users')->fetchColumn();
    if ($count === 0) {
        $conn->prepare("INSERT INTO system_users (user_id, first_name, last_name, username, password, email, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            ->execute(['USR-0001', 'System', 'Admin', 'admin', 'admin1234', 'admin@barangay.local', 'Administrator', 'Active']);
    }

    ensureSqliteResidentsColumns($conn);

    return $conn;
}

/**
 * Bring an existing SQLite residents table up to date.
 *
 * CREATE TABLE IF NOT EXISTS cannot add columns to a table that already exists,
 * and the fallback database predates age / place_of_birth / profile_image.
 * ADD COLUMN is non-destructive: existing rows and data are left untouched.
 */
function ensureSqliteResidentsColumns(PDO $conn) {
    $additions = [
        'residents' => [
            'age' => 'INTEGER',
            'place_of_birth' => 'TEXT',
            'profile_image' => 'TEXT',
        ],
        'archived_residents' => [
            'age' => 'INTEGER',
            'place_of_birth' => 'TEXT',
            'profile_image' => 'TEXT',
        ],
    ];

    foreach ($additions as $table => $columns) {
        $existing = [];
        foreach ($conn->query("PRAGMA table_info($table)") as $row) {
            $existing[] = $row['name'];
        }

        foreach ($columns as $column => $type) {
            if (!in_array($column, $existing, true)) {
                $conn->exec("ALTER TABLE $table ADD COLUMN $column $type");
            }
        }
    }
}

function getConnection() {
    global $db_connected, $db_connection;

    if ($db_connection !== null && $db_connected) {
        return $db_connection;
    }

    // Candidate connections, tried in order. The first one that actually
    // connects wins, so an unreachable SQL Server or MySQL falls through to the
    // next option instead of taking the whole application offline.
    $candidates = [];

    if (in_array('sqlsrv', PDO::getAvailableDrivers(), true)) {
        $candidates[] = function () {
            $dsn = 'sqlsrv:Server=' . DB_HOST . ';Database=' . DB_NAME;
            $conn = empty(DB_USER) ? new PDO($dsn) : new PDO($dsn, DB_USER, DB_PASS);
            $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $conn->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            return $conn;
        };
    }

    // SQL Server through ODBC (used when php_sqlsrv.dll is not installed).
    if (in_array('odbc', PDO::getAvailableDrivers(), true)) {
        $candidates[] = function () {
            $server = DB_HOST;
            // An ODBC server name may include an instance, e.g. localhost\SQLEXPRESS.
            $dsn = 'odbc:Driver={' . DB_ODBC_DRIVER . '};'
                 . 'Server=' . $server . ';'
                 . 'Database=' . DB_NAME . ';'
                 . 'Trusted_Connection=yes;'
                 . 'TrustServerCertificate=yes;'
                 . 'ConnectTimeout=5';
            $conn = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            return $conn;
        };
    }

    if (in_array('mysql', PDO::getAvailableDrivers(), true)) {
        $candidates[] = function () {
            $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
            $conn = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            return $conn;
        };
    }

    // SQLite is the guaranteed local fallback; it already holds the schema and
    // is created on demand by ensureSqliteDatabase().
    $candidates[] = function () {
        return ensureSqliteDatabase();
    };

    foreach ($candidates as $index => $factory) {
        try {
            $conn = $factory();
            $db_connected = true;
            $db_connection = $conn;
            return $conn;
        } catch (Throwable $e) {
            error_log('Database connection attempt ' . ($index + 1) . ' failed: ' . $e->getMessage());
        }
    }

    $db_connected = false;
    $db_connection = null;
    error_log('All database connection attempts failed.');
    return null;
}

function isDatabaseConnected() {
    global $db_connected;
    if (!$db_connected) {
        getConnection();
    }
    return $db_connected;
}

/**
 * Execute a query with parameters
 * 
 * @param string $sql
 * @param array $params
 * @param string $types
 * @return PDOStatement|false
 */
function executeQuery(string $sql, array $params = [], string $types = '') {
    $conn = getConnection();
    if (!$conn) {
        return false;
    }

    try {
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    } catch (Throwable $e) {
        recordDbError('Query error: ' . $e->getMessage());
        return false;
    }
}

/**
 * Fetch a single record
 * 
 * @param string $sql
 * @param array $params
 * @param string $types
 * @return array|null
 */
function getRecord(string $sql, array $params = [], string $types = '') {
    $stmt = executeQuery($sql, $params, $types);
    if ($stmt === false) {
        return null;
    }

    $row = $stmt->fetch();
    return $row ?: null;
}

/**
 * Fetch all records
 * 
 * @param string $sql
 * @param array $params
 * @param string $types
 * @return array
 */
function getRecords(string $sql, array $params = [], string $types = '') {
    $stmt = executeQuery($sql, $params, $types);
    if ($stmt === false) {
        return [];
    }

    return $stmt->fetchAll();
}

/**
 * Insert a record and return the new identity value.
 *
 * SQL Server drivers cannot report the id through PDO::lastInsertId(), so the
 * identity is read back with @@IDENTITY instead.
 *
 * @param string $sql
 * @param array $params
 * @param string $types
 * @return string|false
 */
function insertRecord(string $sql, array $params = [], string $types = '') {
    $conn = getConnection();
    if (!$conn) {
        recordDbError('Insert error: no database connection is available.');
        return false;
    }

    try {
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        recordDbError('');

        $driver = currentDbDriver();

        // SQLite and MySQL expose the new row id through PDO::lastInsertId().
        if ($driver === 'sqlite' || $driver === 'mysql') {
            $id = $conn->lastInsertId();
            return ($id === false || $id === '' || $id === '0' || $id === 0) ? false : $id;
        }

        // SQL Server (sqlsrv / odbc / dblib / mssql) has no working lastInsertId():
        // PDO_ODBC throws "driver does not support lastInsertId()". @@IDENTITY is
        // session-scoped, so it still returns the id written by the INSERT above
        // even though this is a separate statement.
        $row = $conn->query('SELECT @@IDENTITY AS id')->fetch();
        $id = $row['id'] ?? null;

        return ($id === null || $id === false || $id === '' || $id === '0') ? false : $id;
    } catch (Throwable $e) {
        // Throwable, not PDOException: a PHP Error (e.g. calling a method the
        // driver does not implement) would otherwise escape this handler, abort
        // the script mid-response and turn the JSON body into a fatal-error page.
        recordDbError('Insert error: ' . $e->getMessage());
        return false;
    }
}

/**
 * Execute an UPDATE/DELETE statement and return affected row count
 * 
 * @param string $sql
 * @param array $params
 * @param string $types
 * @return int|false
 */
function executeStatement(string $sql, array $params = [], string $types = '') {
    $stmt = executeQuery($sql, $params, $types);
    if ($stmt === false) {
        return false;
    }

    return $stmt->rowCount();
}
?>
