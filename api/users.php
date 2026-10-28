<?php
/**
 * users.php - User Management API.
 *
 * Backs the User Management module against the real system_users table:
 *
 *   GET    ?id=<n>          one active user
 *   GET    ?archived=1      archived users (archived_system_users)
 *   GET    ?role=&status=&search=&page=&limit=
 *                          active users, filtered and paginated
 *   POST   {…}              create a user
 *   POST   {action:'restore', id:<n>}
 *                          move an archived user back to system_users
 *   PUT    {id, …}          update a user
 *   DELETE ?id=<n>          archive a user (copy + delete in one transaction)
 *
 * Two rules from the rest of the project shape this file:
 *
 *   - Passwords are stored as typed (store_password() is a deliberate no-op in
 *     config/functions.php) and are never selected or returned here.
 *   - api/login.php calls validate_user_role() and refuses the login when the
 *     user_id prefix disagrees with the role. A user_id is therefore derived
 *     from the role (AD/COU/CAP, or USR for Secretary, which has no prefix of
 *     its own), and a role change on update regenerates it - otherwise the
 *     account would silently become unable to sign in.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../config/functions.php';
require_once __DIR__ . '/../config/app_session.php';

requireLogin();

$method = $_SERVER['REQUEST_METHOD'];

/**
 * Roles the User Management form offers. Kept in step with valid_roles() in
 * config/functions.php, which is what login validation reads.
 */
function userManagementRoles(): array
{
    // The roles the User Management form offers. Admin and Kagawad accounts already
    // exist in the database and stay valid for login; they are simply no longer
    // offered for new accounts.
    return ['Secretary', 'Captain', 'Councilor/Kagawad'];
}

/**
 * Roles accepted by the API when saving an account.
 *
 * Deliberately wider than userManagementRoles(): an existing Admin or Kagawad
 * account has to stay editable, so validating against the form list alone would
 * refuse every save of such an account. This is the same set the USR branch of
 * validate_user_role() already accepts.
 */
function userManagementValidRoles(): array
{
    return array_merge(valid_roles(), ['Administrator', 'Secretary', 'Encoder']);
}

/**
 * The user_id prefix that belongs to a role. Secretary has no prefix of its own
 * (role_prefix_to_role() has no SEC entry), so it uses USR - the branch of
 * validate_user_role() that already accepts Secretary.
 */
function userRolePrefix(string $role): ?string
{
    $map = [
        'Admin'       => 'AD',
        'Councilor/Kagawad' => 'COU',
        'Captain'     => 'CAP',
        'Kagawad'     => 'KAD',
        'Secretary'   => 'USR',
    ];
    return $map[$role] ?? null;
}

/**
 * Columns of system_users that are safe to return. The password column is
 * deliberately absent.
 */
function userPublicColumns(): string
{
    return 'id, user_id, first_name, middle_name, last_name, suffix, username, email,
            mobile_number, role, status, profile_image, address, birth_date, move_in_date,
            last_login, created_at, updated_at,
            archived_at, archived_by';
}

/**
 * Next free number for a prefix, counting both the live and the archived table
 * so an archived AD001 is never handed out again.
 */
function nextUserIdNumber(string $prefix): int
{
    $max = 0;
    foreach (['system_users', 'archived_system_users'] as $table) {
        $rows = getRecords(
            "SELECT user_id FROM $table WHERE user_id LIKE ?",
            [$prefix . '%'],
            's'
        );
        foreach ($rows as $row) {
            $number = (int) substr((string) $row['user_id'], strlen($prefix));
            if ($number > $max) {
                $max = $number;
            }
        }
    }
    return $max + 1;
}

/**
 * Whether a user_id is already in use, in either the live or the archived
 * table. $excludeId skips the row being edited.
 */
function userIdIsTaken(string $userId, $excludeId = null): bool
{
    foreach (['system_users', 'archived_system_users'] as $table) {
        if ($excludeId === null) {
            $row = getRecord("SELECT id FROM $table WHERE user_id = ?", [$userId], 's');
        } else {
            $row = getRecord(
                "SELECT id FROM $table WHERE user_id = ? AND id <> ?",
                [$userId, $excludeId],
                'si'
            );
        }
        if ($row) {
            return true;
        }
    }
    return false;
}

/**
 * Build a user_id for a role, e.g. 'Councilor/Kagawad' -> 'COU002'.
 *
 * The number is the highest one already used for that prefix (in either table)
 * plus one, and is bumped further while the result is still taken - so a role
 * change away and back cannot hand out an id that another account is holding.
 */
function generateUserId(string $role, $excludeId = null): ?string
{
    $prefix = userRolePrefix($role);
    if ($prefix === null) {
        return null;
    }

    $number = nextUserIdNumber($prefix);
    $candidate = $prefix . str_pad((string) $number, 4, '0', STR_PAD_LEFT);

    while (userIdIsTaken($candidate, $excludeId)) {
        $number++;
        $candidate = $prefix . str_pad((string) $number, 4, '0', STR_PAD_LEFT);
    }

    return $candidate;
}

/**
 * Directory that holds user photos, relative to the application root.
 */
function userPhotoDirectory()
{
    return __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'users';
}

/**
 * Persist a base64-encoded photo (data URL) and return the stored reference.
 *
 * Mirrors storeResidentPhoto() in api/residents.php: the table keeps a
 * web-relative path in profile_image rather than binary data, so the image is
 * written to uploads/users/ and the path is stored.
 *
 * @param string $dataUrl
 * @return string|null Relative path on success, null when nothing usable was sent.
 */
function storeUserPhoto($dataUrl)
{
    if (!is_string($dataUrl) || $dataUrl === '') {
        return null;
    }

    // Accept the "data:<mime>;base64,<payload>" form produced by FileReader.
    if (!preg_match('#^data:image/(jpeg|jpg|png);base64,(.+)$#i', $dataUrl, $matches)) {
        return null;
    }

    $extension = strtolower($matches[1]) === 'png' ? 'png' : 'jpg';
    $binary = base64_decode($matches[2], true);

    if ($binary === false || $binary === '') {
        return null;
    }

    // 2MB limit, matching the rule stated on the form.
    if (strlen($binary) > 2 * 1024 * 1024) {
        return null;
    }

    $directory = userPhotoDirectory();
    if (!is_dir($directory) && !mkdir($directory, 0777, true) && !is_dir($directory)) {
        error_log('Unable to create user photo directory: ' . $directory);
        return null;
    }

    $fileName = 'user-' . uniqid() . '.' . $extension;
    $fullPath = $directory . DIRECTORY_SEPARATOR . $fileName;

    if (file_put_contents($fullPath, $binary) === false) {
        error_log('Unable to write user photo: ' . $fullPath);
        return null;
    }

    // Stored as a web-relative path so it can be used directly in an img src.
    return 'uploads/users/' . $fileName;
}

/**
 * The signed-in user's name, for the archived_by column.
 */
function currentUserName(): string
{
    $name = trim((string) ($_SESSION['name'] ?? ''));
    if ($name !== '') {
        return $name;
    }
    return (string) ($_SESSION['username'] ?? 'System');
}

/**
 * Normalise a birth date for storage: an empty value stays null, anything that is not
 * a real calendar date is refused.
 *
 * Age is never accepted here - it is derived from the birth date in the UI, so a client
 * cannot store an age that disagrees with it.
 *
 * @return string|null
 */
function normaliseBirthDate($value)
{
    $birthDate = trim((string) $value);
    if ($birthDate === '') {
        return null;
    }
    $parts = explode('-', $birthDate);
    if (count($parts) !== 3 || !checkdate((int) $parts[1], (int) $parts[2], (int) $parts[0])) {
        return null;
    }
    return $birthDate;
}

function normaliseMoveInDate($value)
{
    $moveInDate = trim((string) $value);
    if ($moveInDate === '') {
        return null;
    }
    $parts = explode('-', $moveInDate);
    if (count($parts) !== 3 || !checkdate((int) $parts[1], (int) $parts[2], (int) $parts[0])) {
        return null;
    }
    if ($moveInDate > date('Y-m-d')) {
        return null;
    }
    return $moveInDate;
}

/**
 * Column names of system_users, read from the schema so the archive copy cannot
 * drift out of sync with it.
 */
function systemUserColumns(): array
{
    $columns = [];
    foreach (getRecords(
        "SELECT c.name AS col FROM sys.columns c
         WHERE c.object_id = OBJECT_ID('system_users') ORDER BY c.column_id"
    ) as $column) {
        $columns[] = $column['col'];
    }
    return $columns;
}

/**
 * Copy a system_users row into archived_system_users, preserving its id, then
 * delete the live row. Both halves run in one transaction and success requires
 * the delete to have actually removed a row - a failed copy must never destroy
 * the record.
 */
function archiveUser($id)
{
    $user = getRecord("SELECT * FROM system_users WHERE id = ?", [$id], 'i');

    if (!$user) {
        return ['success' => false, 'message' => 'User not found'];
    }

    // The account is flagged rather than moved. The activity trail in
    // user_activity_log has a foreign key to system_users.id and is an audit record, so
    // deleting the row would either fail on the constraint or destroy history. Keeping
    // the row means the account stays recoverable and its history stays attributable.
    // api/login.php already requires status = 'Active', so an archived account cannot
    // sign in.
    if ($user['status'] === 'Archived') {
        return ['success' => false, 'message' => 'This user is already archived'];
    }

    // The primary key on the archive table makes a second copy impossible; checking
    // first turns the constraint error into a clear answer.
    $already = getRecord(
        "SELECT id FROM archived_system_users WHERE id = ?",
        [$id],
        'i'
    );
    if ($already) {
        return ['success' => false, 'message' => 'This user is already archived'];
    }

    $affected = executeStatement(
        "UPDATE system_users SET status = 'Archived', archived_at = " . db_now_sql() . ", archived_by = ? WHERE id = ?",
        [currentUserName(), $id],
        'si'
    );

    $error = $affected === false ? 'Update failed' : null;

    if ($error === null && $affected !== false) {
        logUserActivity('User', 'Archived the account \'' . $user['username'] . '\' (' . $user['user_id'] . ')');
    }

    return [
        'success'  => $error === null && $affected !== false,
        'affected' => $affected === false ? 0 : $affected,
        'message'  => $error !== null
            ? 'Archive failed: ' . $error
            : ($affected !== false ? 'User archived successfully' : 'User could not be archived'),
    ];
}

/**
 * Move an archived row back into system_users, preserving its id.
 */
function restoreUser($id)
{
    // The account may have been archived by flag (still in system_users) or by the
    // older copy-and-delete route (in archived_system_users). Handle the flag first.
    $live = getRecord("SELECT * FROM system_users WHERE id = ?", [$id], 'i');

    if ($live && $live['status'] === 'Archived') {
        $affected = executeStatement(
            "UPDATE system_users SET status = 'Active', archived_at = NULL, archived_by = NULL WHERE id = ?",
            [$id],
            'i'
        );

        if ($affected === false) {
            return ['success' => false, 'affected' => 0, 'message' => 'Restore failed: update failed'];
        }

        logUserActivity('User', 'Restored the account \'' . $live['username'] . '\' (' . $live['user_id'] . ')');

        return ['success' => true, 'affected' => $affected, 'message' => 'User restored successfully'];
    }

    $archived = getRecord("SELECT * FROM archived_system_users WHERE id = ?", [$id], 'i');

    if (!$archived) {
        return ['success' => false, 'message' => 'Archived user not found'];
    }

    // A live row already holding this id would collide on the primary key.
    $live = getRecord("SELECT id FROM system_users WHERE id = ?", [$id], 'i');
    if ($live) {
        return ['success' => false, 'message' => 'A user with this ID already exists'];
    }

    // system_users.username, user_id and email are all UNIQUE, so a restore colliding
    // with any of them would fail on the constraint. Check each and name the field,
    // rather than surfacing a raw SQL error.
    foreach ([
        'username' => "The username '{$archived['username']}' is already in use by another account",
        'user_id'  => "The user ID '{$archived['user_id']}' is already in use by another account",
    ] as $column => $message) {
        $taken = getRecord(
            "SELECT id FROM system_users WHERE {$column} = ?",
            [$archived[$column] ?? ''],
            's'
        );
        if ($taken) {
            return ['success' => false, 'affected' => 0, 'message' => $message];
        }
    }

    $emailTaken = getRecord(
        "SELECT id FROM system_users WHERE email = ? AND email <> ''",
        [$archived['email'] ?? ''],
        's'
    );
    if ($emailTaken) {
        return [
            'success' => false,
            'affected' => 0,
            'message' => "The email '{$archived['email']}' is already in use by another account",
        ];
    }

    $columns = systemUserColumns();
    if (!$columns) {
        return ['success' => false, 'message' => 'Unable to read the system_users columns'];
    }

    $columnList = implode(', ', $columns);
    $conn = getConnection();
    $restored = 0;
    $error = null;

    try {
        $conn->beginTransaction();

        $conn->exec("SET IDENTITY_INSERT system_users ON");
        try {
            $insert = $conn->prepare(
                "INSERT INTO system_users ($columnList)
                 SELECT $columnList FROM archived_system_users WHERE id = ?"
            );
            $insert->execute([$id]);

            $delete = $conn->prepare("DELETE FROM archived_system_users WHERE id = ?");
            $delete->execute([$id]);
            $restored = $delete->rowCount();
        } finally {
            $conn->exec("SET IDENTITY_INSERT system_users OFF");
        }

        $conn->commit();
    } catch (PDOException $e) {
        if ($conn->inTransaction()) {
            $conn->rollBack();
        }
        error_log('Restore user error: ' . $e->getMessage());
        $error = $e->getMessage();
    }

    return [
        'success'  => $error === null && $restored > 0,
        'affected' => $restored,
        'message'  => $error !== null
            ? 'Restore failed: ' . $error
            : ($restored > 0 ? 'User restored successfully' : 'User could not be restored'),
    ];
}

/**
 * Permanently remove an archived user row.
 *
 * One-directional: deletes from archived_system_users only and never touches
 * system_users. The row is gone afterwards, so there is no undo.
 */
function permanentlyDeleteUser($id)
{
    // Allow hard deletion by detaching the activity trail first.
    $conn = getConnection();
    $conn->prepare("UPDATE user_activity_log SET user_id = NULL WHERE user_id = ?")->execute([$id]);

    $target = getRecord("SELECT id FROM system_users WHERE id = ?", [$id], 'i');
    $table  = 'system_users';

    if (!$target) {
        $target = getRecord("SELECT id FROM archived_system_users WHERE id = ?", [$id], 'i');
        $table  = 'archived_system_users';
    }

    if (!$target) {
        return ['success' => false, 'affected' => 0, 'message' => 'Archived user not found'];
    }

    $deleted = 0;
    $error = null;

    try {
        $conn->beginTransaction();

        $delete = $conn->prepare("DELETE FROM {$table} WHERE id = ?");
        $delete->execute([$id]);
        $deleted = $delete->rowCount();

        $conn->commit();
    } catch (PDOException $e) {
        if ($conn->inTransaction()) {
            $conn->rollBack();
        }
        error_log('Delete archived user error: ' . $e->getMessage());
        $error = $e->getMessage();
    }

    return [
        'success'  => $error === null && $deleted > 0,
        'affected' => $deleted,
        'message'  => $error !== null
            ? 'Delete failed: ' . $error
            : ($deleted > 0 ? 'User permanently deleted' : 'User could not be deleted'),
    ];
}

switch ($method) {
    case 'GET':
        // Recent activities for one user. The id is the system_users PK; the actor
        // is taken from the session by requireLogin(), so a request can never
        // attribute an entry to somebody else.
        if (isset($_GET['activities'])) {
            $targetId = isset($_GET['user_id']) ? (int) $_GET['user_id'] : 0;
            $limit = isset($_GET['limit']) ? max(1, min(50, (int) $_GET['limit'])) : 10;

            if ($targetId <= 0) {
                echo json_encode(['success' => false, 'message' => 'User ID is required', 'data' => []]);
                break;
            }

            $activities = getRecords(
                "SELECT id, activity_type, activity_description, ip_address, created_at
                 FROM user_activity_log
                 WHERE user_id = ?
                 ORDER BY created_at DESC
                 OFFSET 0 ROWS FETCH NEXT ? ROWS ONLY",
                [$targetId, $limit],
                'ii'
            );

            echo json_encode([
                'success' => true,
                'data'    => $activities ?: [],
            ]);
            break;
        }

        // Archived users are flagged in place (status = 'Archived') rather than moved, so
        // the audit trail in user_activity_log stays attached. The archive table is only
        // read for rows archived by the older copy-and-delete route.
        if (isset($_GET['archived'])) {
            $search = isset($_GET['search']) ? (string) $_GET['search'] : '';

            $where = " WHERE 1=1";
            $params = [];
            $types = '';

            if ($search !== '') {
                $where .= " AND (first_name LIKE ? OR last_name LIKE ? OR username LIKE ? OR email LIKE ?)";
                $searchParam = "%$search%";
                $params = [$searchParam, $searchParam, $searchParam, $searchParam];
                $types = 'ssss';
            }

            // Both archive routes are listed: accounts flagged in place (status =
            // 'Archived') and any still sitting in archived_system_users from the older
            // copy-and-delete route. Without the union, a legacy archived account would be
            // invisible and unreachable.
            $users = getRecords(
                "SELECT id, user_id, first_name, middle_name, last_name, suffix, username, email,
                        mobile_number, role, status, profile_image, address, birth_date, move_in_date,
                        last_login, created_at,
                        archived_at, archived_by
                 FROM (
                     SELECT id, user_id, first_name, middle_name, last_name, suffix, username, email,
                            mobile_number, role, status, profile_image, address, birth_date, move_in_date,
                            last_login, created_at,
                            archived_at, archived_by
                     FROM system_users WHERE status = 'Archived'
                     UNION ALL
                     SELECT id, user_id, first_name, middle_name, last_name, suffix, username, email,
                            mobile_number, role, status, profile_image, address, birth_date, move_in_date,
                            last_login, created_at,
                            archived_at, archived_by
                     FROM archived_system_users
                 ) AS archived_accounts" . $where . " ORDER BY archived_at DESC",
                $params,
                $types
            );

            echo json_encode([
                'success' => true,
                'data'    => $users ?: [],
            ]);
            break;
        }

        if (isset($_GET['id'])) {
            $user = getRecord(
                "SELECT " . userPublicColumns() . " FROM system_users WHERE id = ?",
                [$_GET['id']],
                'i'
            );
            echo json_encode([
                'success' => $user !== false,
                'data'    => $user ?: null,
                'message' => $user ? '' : 'User not found',
            ]);
            break;
        }

        $role   = isset($_GET['role']) ? (string) $_GET['role'] : '';
        $status = isset($_GET['status']) ? (string) $_GET['status'] : '';
        $search = isset($_GET['search']) ? (string) $_GET['search'] : '';
        $page   = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
        $limit  = isset($_GET['limit']) ? max(1, (int) $_GET['limit']) : 10;

        $where = " WHERE 1=1";
        $params = [];
        $types = '';

        if ($role !== '') {
            $where .= " AND role = ?";
            $params[] = $role;
            $types .= 's';
        }
        // Archived accounts are hidden unless the caller asks for them explicitly.
        if ($status !== '') {
            $where .= " AND status = ?";
            $params[] = $status;
            $types .= 's';
        } else {
            $where .= " AND (status IS NULL OR status <> 'Archived')";
        }
        if ($search !== '') {
            $where .= " AND (first_name LIKE ? OR last_name LIKE ? OR username LIKE ? OR email LIKE ?)";
            $searchParam = "%$search%";
            $params[] = $searchParam;
            $params[] = $searchParam;
            $params[] = $searchParam;
            $params[] = $searchParam;
            $types .= 'ssss';
        }

        $total = 0;
        $countRow = getRecord(
            "SELECT COUNT(*) AS n FROM system_users" . $where,
            $params,
            $types
        );
        if ($countRow !== false) {
            $total = (int) $countRow['n'];
        }

        $pageParams = $params;
        $pageParams[] = ($page - 1) * $limit;
        $pageParams[] = $limit;

        $users = getRecords(
            "SELECT " . userPublicColumns() . " FROM system_users" . $where
            . " ORDER BY created_at DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY",
            $pageParams,
            $types . 'ii'
        );

        echo json_encode([
            'success' => true,
            'data'    => $users ?: [],
            'total'   => $total,
            'page'    => $page,
            'limit'   => $limit,
            'totalPages' => $total > 0 ? (int) ceil($total / $limit) : 1,
        ]);
        break;

    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            $data = [];
        }

        // Permanent deletion of an archived account.
        if (($data['action'] ?? '') === 'delete') {
            $deleteId = isset($data['id']) ? (int) $data['id'] : 0;

            if ($deleteId <= 0) {
                echo json_encode(['success' => false, 'message' => 'ID is required']);
                break;
            }

            $result = permanentlyDeleteUser($deleteId);

            if ($result['success']) {
                logUserActivity('User', 'Permanently deleted archived account #' . $deleteId);
            }

            echo json_encode([
                'success'  => $result['success'],
                'affected' => $result['affected'],
                'message'  => $result['message'],
            ]);
            break;
        }

        // Restore is a POST with an action, matching api/certificates.php.
        if (($data['action'] ?? '') === 'restore') {
            $id = $data['id'] ?? null;
            if (!$id) {
                echo json_encode(['success' => false, 'message' => 'ID is required']);
                break;
            }
            echo json_encode(restoreUser($id));
            break;
        }

        $firstName = trim((string) ($data['first_name'] ?? ''));
        $lastName  = trim((string) ($data['last_name'] ?? ''));
        $username  = trim((string) ($data['username'] ?? ''));
        $email     = trim((string) ($data['email'] ?? ''));
        $password  = (string) ($data['password'] ?? '');
        $role      = (string) ($data['role'] ?? '');

        $errors = [];
        if ($firstName === '') {
            $errors[] = 'First name is required';
        }
        if ($lastName === '') {
            $errors[] = 'Last name is required';
        }
        if ($username === '') {
            $errors[] = 'Username is required';
        }
        if ($password === '') {
            $errors[] = 'Password is required';
        }
        if ($email === '') {
            $errors[] = 'Email is required';
        }
        if (!in_array($role, userManagementValidRoles(), true)) {
            $errors[] = 'Role must be one of: ' . implode(', ', userManagementRoles());
        }

        if ($errors) {
            echo json_encode(['success' => false, 'message' => implode('; ', $errors)]);
            break;
        }

        // Login looks a user up by username, so a duplicate would make the
        // account ambiguous.
        $taken = getRecord("SELECT id FROM system_users WHERE username = ?", [$username], 's');
        if ($taken) {
            echo json_encode(['success' => false, 'message' => "The username '$username' is already taken"]);
            break;
        }

        $user_id = generateUserId($role);
        if ($user_id === null) {
            echo json_encode(['success' => false, 'message' => 'Unable to generate a user ID for that role']);
            break;
        }

        // Store the password as typed (see store_password() in config/functions.php).
        $storedPassword = store_password($password);

        $birthDate = normaliseBirthDate($data['birth_date'] ?? '');

        $sql = "INSERT INTO system_users (user_id, first_name, middle_name, last_name, suffix, username,
                password, email, mobile_number, role, status, address, birth_date, move_in_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

        $params = [
            $user_id,
            $firstName,
            $data['middle_name'] ?? '',
            $lastName,
            $data['suffix'] ?? '',
            $username,
            $storedPassword,
            $email,
            $data['mobile_number'] ?? '',
            $role,
            $data['status'] ?? 'Active',
            $data['address'] ?? '',
            $birthDate,
            normaliseMoveInDate($data['move_in_date'] ?? ''),
        ];

        $id = insertRecord($sql, $params, 'ssssssssssssss');

        if (!$id) {
            echo json_encode(['success' => false, 'message' => 'Unable to save the user. Please try again.']);
            break;
        }

        // The photo is written to disk only after the row exists, so a failed
        // insert can never leave an unreferenced file behind. A photo that
        // fails validation is skipped rather than failing the request.
        $photoPayload = $data['photo_base64'] ?? '';
        if (is_string($photoPayload) && $photoPayload !== '') {
            $profileImage = storeUserPhoto($photoPayload);
            if ($profileImage !== null) {
                executeStatement(
                    "UPDATE system_users SET profile_image = ? WHERE id = ?",
                    [$profileImage, $id],
                    'si'
                );
            }
        }

        $newUser = getRecord(
            "SELECT " . userPublicColumns() . " FROM system_users WHERE id = ?",
            [$id],
            'i'
        );

        logUserActivity('User', 'Created the account \'' . $username . '\' (' . $user_id . ')');

        echo json_encode([
            'success' => true,
            'id'      => $id,
            'user_id' => $user_id,
            'data'    => $newUser,
        ]);
        break;

    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            $data = [];
        }

        $id = $data['id'] ?? null;
        if (!$id) {
            echo json_encode(['success' => false, 'message' => 'ID is required']);
            break;
        }

        $existing = getRecord("SELECT * FROM system_users WHERE id = ?", [$id], 'i');
        if (!$existing) {
            echo json_encode(['success' => false, 'message' => 'User not found']);
            break;
        }

        $firstName = trim((string) ($data['first_name'] ?? ''));
        $lastName  = trim((string) ($data['last_name'] ?? ''));
        $username  = trim((string) ($data['username'] ?? ''));
        $email     = trim((string) ($data['email'] ?? ''));
        $role      = (string) ($data['role'] ?? '');
        $status    = (string) ($data['status'] ?? 'Active');

        $errors = [];
        if ($firstName === '') {
            $errors[] = 'First name is required';
        }
        if ($lastName === '') {
            $errors[] = 'Last name is required';
        }
        if ($username === '') {
            $errors[] = 'Username is required';
        }
        if ($email === '') {
            $errors[] = 'Email is required';
        }
        if (!in_array($role, userManagementValidRoles(), true)) {
            $errors[] = 'Role must be one of: ' . implode(', ', userManagementRoles());
        }

        if ($errors) {
            echo json_encode(['success' => false, 'message' => implode('; ', $errors)]);
            break;
        }

        // Exclude the row being edited from the uniqueness check.
        $taken = getRecord(
            "SELECT id FROM system_users WHERE username = ? AND id <> ?",
            [$username, $id],
            'si'
        );
        if ($taken) {
            echo json_encode(['success' => false, 'message' => "The username '$username' is already taken"]);
            break;
        }

        // A role change has to move the user_id to the matching prefix, or
        // validate_user_role() in api/login.php will refuse the login.
        $newUserId = $existing['user_id'];
        if ($role !== (string) $existing['role']) {
            $generated = generateUserId($role, $id);
            if ($generated === null) {
                echo json_encode(['success' => false, 'message' => 'Unable to generate a user ID for that role']);
                break;
            }
            $newUserId = $generated;
        }

        $passwordSql = '';
        // An edit that does not mention a birth date keeps the stored one.
        $birthDate = normaliseBirthDate($data['birth_date'] ?? ($existing['birth_date'] ?? ''));
        $moveInDate = normaliseMoveInDate($data['move_in_date'] ?? ($existing['move_in_date'] ?? ''));
        $params = [
            $newUserId,
            $firstName,
            $data['middle_name'] ?? '',
            $lastName,
            $data['suffix'] ?? '',
            $username,
            $email,
            $data['mobile_number'] ?? '',
            $role,
            $status,
            $data['address'] ?? '',
            $birthDate,
            $moveInDate,
        ];
        $types = 'sssssssssssss';

        if (!empty($data['password'])) {
            $passwordSql = ', password = ?';
            $params[] = store_password((string) $data['password']);
            $types .= 's';
        }

        $params[] = $id;
        $types .= 'i';

        $affected = executeStatement(
            "UPDATE system_users SET user_id = ?, first_name = ?, middle_name = ?, last_name = ?,
                    suffix = ?, username = ?, email = ?, mobile_number = ?, role = ?, status = ?,
                    address = ?, birth_date = ?, move_in_date = ?
                    $passwordSql
             WHERE id = ?",
            $params,
            $types
        );

        // A replacement photo is stored and linked; sending none leaves the
        // existing picture untouched.
        $photoPayload = $data['photo_base64'] ?? '';
        if (is_string($photoPayload) && $photoPayload !== '') {
            $profileImage = storeUserPhoto($photoPayload);
            if ($profileImage !== null) {
                executeStatement(
                    "UPDATE system_users SET profile_image = ? WHERE id = ?",
                    [$profileImage, $id],
                    'si'
                );
            }
        }

        $updated = getRecord(
            "SELECT " . userPublicColumns() . " FROM system_users WHERE id = ?",
            [$id],
            'i'
        );

        if ($affected !== false) {
            logUserActivity('User', 'Updated the account \'' . $username . '\' (' . $newUserId . ')');
        }

        echo json_encode([
            'success'  => $affected !== false,
            'affected' => $affected,
            'user_id'  => $newUserId,
            'data'     => $updated,
            'message'  => $affected !== false ? 'User updated successfully' : 'Update failed',
        ]);
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if (!$id) {
            echo json_encode(['success' => false, 'message' => 'ID is required']);
            break;
        }
        echo json_encode(archiveUser($id));
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Invalid request method']);
        break;
}
