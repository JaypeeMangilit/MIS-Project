<?php
/**
 * officials.php (API) - Barangay officials for Barangay 49 Akasya.
 *
 *   GET    officials.php                     -> list (search, term, position, status, type, pagination)
 *   GET    officials.php?id=N                -> one official
 *   GET    officials.php?terms=1             -> distinct terms, for the "Filter by Term" dropdown
 *   POST   officials.php                     -> create
 *   PUT    officials.php                     -> update (id in the body)
 *   DELETE officials.php?id=N                -> archive (move to archived_barangay_officials)
 *
 * List response:  { success, data: [...], total, page, limit, totalPages }
 * Single record:  { success, data: {...} }
 * Terms:          { success, data: [ { term_start, term_end, label } ] }
 * Write:          { success, data: {...}, message }
 * Failure:        { success: false, message }  (HTTP 400 / 404 / 500)
 *
 * The photo arrives as a base64 data URL in `photo_base64` and is written to
 * uploads/officials/ with the web-relative path kept in profile_image, exactly
 * like a resident photo.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

require_once __DIR__ . '/../config/functions.php';
require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../config/app_session.php';

requireLogin();

/** Positions offered by the Add/Edit Official form. */
/** Positions the Add/Edit Official form offers. */
$OFFICIAL_POSITIONS = [
    'Secretary',
    'Captain',
    'Councilor',
];

/**
 * Positions held by records saved before the form was narrowed to the three above.
 * They stay valid so an existing official can still be edited without first being
 * reassigned, and so the Edit form can display the stored value.
 */
$OFFICIAL_POSITIONS_LEGACY = [
    'Punong Barangay',
    'Barangay Kagawad',
    'SK Chairman',
    'Barangay Secretary',
    'Barangay Treasurer',
];

/** Every position the API will accept: the form's choices plus the legacy ones. */
$OFFICIAL_POSITIONS_VALID = array_merge($OFFICIAL_POSITIONS, $OFFICIAL_POSITIONS_LEGACY);

/** Committees offered by the Add/Edit Official form. */
$OFFICIAL_COMMITTEES = [
    'Peace and Order',
    'Education',
    'Health',
    'Infrastructure',
    'Agriculture',
    'Youth and Sports',
    'Women and Family',
];

$OFFICIAL_TYPES = ['Elected', 'Appointed'];
$OFFICIAL_STATUSES = ['Active', 'Inactive'];

/** Emit a failure response and stop. */
function officialsFail(string $message, int $status = 400): void
{
    http_response_code($status);
    echo json_encode(['success' => false, 'message' => $message, 'data' => null]);
}

/**
 * Build the next official ID for the current year, e.g. OFF-2026-0001.
 *
 * MAX(official_id) rather than COUNT(*), so removing a row can never hand the
 * same number out twice. $offset lets the caller retry past a collision.
 */
function generateOfficialId(int $offset = 0): string
{
    $year = date('Y');

    $row = getRecord(
        "SELECT MAX(official_id) AS max_id FROM barangay_officials WHERE official_id LIKE ?",
        ["OFF-$year-%"],
        's'
    );

    $max = $row['max_id'] ?? null;
    $next = 1;

    if ($max !== null && preg_match('/-(\d+)$/', $max, $matches)) {
        $next = (int) $matches[1] + 1;
    }

    return "OFF-$year-" . str_pad((string) ($next + $offset), 4, '0', STR_PAD_LEFT);
}

/** Directory that holds official photos, relative to the application root. */
function officialPhotoDirectory(): string
{
    return __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'officials';
}

/**
 * Persist a base64-encoded photo (data URL) and return the stored reference.
 *
 * @return string|null Relative path on success, null when nothing usable was sent.
 */
function storeOfficialPhoto($dataUrl)
{
    if (!is_string($dataUrl) || $dataUrl === '') {
        return null;
    }

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

    $directory = officialPhotoDirectory();
    if (!is_dir($directory) && !mkdir($directory, 0777, true) && !is_dir($directory)) {
        error_log('Unable to create official photo directory: ' . $directory);
        return null;
    }

    $fileName = 'official-' . uniqid() . '.' . $extension;
    $fullPath = $directory . DIRECTORY_SEPARATOR . $fileName;

    if (file_put_contents($fullPath, $binary) === false) {
        error_log('Unable to write official photo: ' . $fullPath);
        return null;
    }

    return 'uploads/officials/' . $fileName;
}

/**
 * Normalise a Philippine mobile number to 09XXXXXXXXX.
 *
 * Accepts 09XXXXXXXXX, +639XXXXXXXXX and 639XXXXXXXXX, with or without spaces
 * or dashes. Returns '' when the value cannot be a valid mobile number.
 */
function normaliseMobile($value): string
{
    $digits = preg_replace('/\D/', '', (string) $value);

    if (strlen($digits) === 12 && strpos($digits, '639') === 0) {
        $digits = '0' . substr($digits, 2);
    }

    return preg_match('/^09\d{9}$/', $digits) ? $digits : '';
}

/** Validate the shared payload of POST and PUT. Returns an error message or ''. */
function validateOfficialPayload(array $data): string
{
    global $OFFICIAL_POSITIONS, $OFFICIAL_POSITIONS_VALID, $OFFICIAL_COMMITTEES, $OFFICIAL_TYPES, $OFFICIAL_STATUSES;

    $required = [
        'first_name' => 'First Name',
        'last_name' => 'Last Name',
        'gender' => 'Gender',
        'position' => 'Position / Role',
        'term_start' => 'Term Start Date',
        'term_end' => 'Term End Date',
        'mobile_number' => 'Mobile Number',
    ];

    foreach ($required as $field => $label) {
        if (trim((string) ($data[$field] ?? '')) === '') {
            return "$label is required.";
        }
    }

    if (normaliseMobile($data['mobile_number'] ?? '') === '') {
        return 'Mobile Number must be a valid 11-digit number (e.g. 09171234567).';
    }

    $email = trim((string) ($data['email'] ?? ''));
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return 'Email Address is not valid.';
    }

    if (!in_array($data['gender'] ?? '', ['Male', 'Female'], true)) {
        return 'Gender must be Male or Female.';
    }

    if (!in_array($data['position'] ?? '', $OFFICIAL_POSITIONS_VALID, true)) {
        return 'Position / Role is not one of the offered positions.';
    }

    $committee = trim((string) ($data['committee'] ?? ''));
    if ($committee !== '' && !in_array($committee, $OFFICIAL_COMMITTEES, true)) {
        return 'Committee is not one of the offered committees.';
    }

    if (!in_array($data['official_type'] ?? 'Elected', $OFFICIAL_TYPES, true)) {
        return 'Official type must be Elected or Appointed.';
    }

    if (!in_array($data['status'] ?? 'Active', $OFFICIAL_STATUSES, true)) {
        return 'Status must be Active or Inactive.';
    }

    $start = strtotime((string) $data['term_start']);
    $end = strtotime((string) $data['term_end']);
    if ($start === false || $end === false) {
        return 'Term Start Date and Term End Date must be valid dates.';
    }
    if ($end < $start) {
        return 'Term End Date cannot be earlier than Term Start Date.';
    }

    $birthDate = trim((string) ($data['birth_date'] ?? ''));
    if ($birthDate !== '' && strtotime($birthDate) === false) {
        return 'Birthdate is not a valid date.';
    }

    $moveInDate = trim((string) ($data['move_in_date'] ?? ''));
    if ($moveInDate !== '' && strtotime($moveInDate) === false) {
        return 'Move-in Date is not a valid date.';
    }
    if ($moveInDate !== '' && $moveInDate > date('Y-m-d')) {
        return 'Move-in Date cannot be in the future.';
    }

    return '';
}

/** Columns of a table, in order, straight from the catalogue. */
function officialsTableColumns(string $table): array
{
    $columns = [];
    foreach (getRecords(
        "SELECT c.name AS col FROM sys.columns c
         WHERE c.object_id = OBJECT_ID(?) ORDER BY c.column_id",
        [$table],
        's'
    ) as $column) {
        $columns[] = $column['col'];
    }
    return $columns;
}

/**
 * Move one official row into the archive table and remove it from the active list.
 *
 * Shared by the manual Archive button and the term-expiry sweep, so both use the same
 * copy-then-delete order: the row is only deleted once the copy has actually landed,
 * inside a transaction that rolls back if either half fails.
 *
 * @return array{success: bool, archived: int, error: ?string}
 */
function archiveOfficialRecord($id, $archivedBy)
{
    $columns = officialsTableColumns('barangay_officials');
    if (!$columns) {
        return ['success' => false, 'archived' => 0, 'error' => 'Unable to read the officials table columns.'];
    }

    $columnList = implode(', ', $columns);

    $conn = getConnection();
    $archived = 0;

    try {
        $conn->beginTransaction();

        $conn->exec("SET IDENTITY_INSERT archived_barangay_officials ON");
        try {
            $insert = $conn->prepare(
                "INSERT INTO archived_barangay_officials ($columnList, archived_at, archived_by)
                 SELECT $columnList, " . db_now_sql() . ", ? FROM barangay_officials WHERE id = ?"
            );
            $insert->execute([$archivedBy !== '' ? $archivedBy : null, $id]);

            $delete = $conn->prepare("DELETE FROM barangay_officials WHERE id = ?");
            $delete->execute([$id]);
            $archived = $delete->rowCount();
        } finally {
            $conn->exec("SET IDENTITY_INSERT archived_barangay_officials OFF");
        }

        $conn->commit();
    } catch (PDOException $e) {
        if ($conn->inTransaction()) {
            $conn->rollBack();
        }
        error_log('Official archive error: ' . $e->getMessage());
        return ['success' => false, 'archived' => 0, 'error' => $e->getMessage()];
    }

    return ['success' => $archived > 0, 'archived' => $archived, 'error' => null];
}

/**
 * Archive every official whose term has officially ended.
 *
 * Runs whenever the officials list is read, so the active list only ever shows serving
 * officials. The rule is narrow on purpose: a non-null term_end in the past and status
 * 'Active'. It applies regardless of how long the term was — a full four-year term and
 * a shorter one expire the same way, which is what the owner asked for.
 *
 * Idempotent: an archived row is gone from barangay_officials, so a second read finds
 * nothing to do and nothing is ever archived twice. Each archive is written to the
 * activity trail as a system action, worded so it cannot be mistaken for somebody
 * clicking Archive.
 *
 * A failure on one official is logged and skipped rather than aborting the sweep, so a
 * single bad row cannot freeze the whole list.
 *
 * @return array The officials that were archived: [{id, official_id, name}]
 */
function autoArchiveExpiredOfficials()
{
    // Connect first. db_now_sql() needs a live PDO to tell SQL Server from MySQL, and
    // without one it falls through to the MySQL NOW(), which SQL Server rejects --
    // the sweep would then silently match nothing instead of erroring.
    getConnection();

    $expired = getRecords(
        "SELECT id, official_id, first_name, middle_name, last_name, suffix, term_end
         FROM barangay_officials
         WHERE term_end IS NOT NULL
           AND term_end < " . db_now_sql() . "
           AND status = 'Active'
         ORDER BY term_end ASC"
    );

    $archived = [];

    foreach ($expired ?: [] as $official) {
        $result = archiveOfficialRecord($official['id'], 'System (term ended)');

        if (!$result['success']) {
            error_log('Auto-archive failed for official #' . $official['id'] . ': ' . $result['error']);
            continue;
        }

        $name = officialDisplayName($official['id'], $official);

        logUserActivity(
            'Official',
            'Term ended - auto-archived ' . $name . ' (' . $official['official_id'] . ')'
        );

        $archived[] = [
            'id'          => $official['id'],
            'official_id' => $official['official_id'],
            'name'        => $name,
        ];
    }

    return $archived;
}

/**
 * An official's name for the activity trail. Pass $official when the row is already
 * in hand (the archive path reads it before deleting it); otherwise it is looked up.
 * Falls back to the id when the record is gone.
 */
function officialDisplayName($id, $official = null)
{
    if (!is_array($official)) {
        $official = getRecord("SELECT first_name, middle_name, last_name, suffix FROM barangay_officials WHERE id = ?", [$id], 'i');
    }

    if (!$official) {
        return 'official record #' . $id;
    }

    $parts = array_filter([
        $official['first_name'] ?? '',
        $official['middle_name'] ?? '',
        $official['last_name'] ?? '',
        $official['suffix'] ?? '',
    ], function ($part) {
        return trim((string) $part) !== '';
    });

    return $parts ? implode(' ', $parts) : 'official record #' . $id;
}

/**
 * Move an archived official row back into barangay_officials, preserving its id.
 *
 * Same copy-then-delete order as the other modules: the row is only removed from the
 * archive once the copy into the live table has landed, inside one transaction. The
 * original id is kept so the record still maps 1:1 to what it was.
 */
function restoreOfficial($id)
{
    $archived = getRecord("SELECT * FROM archived_barangay_officials WHERE id = ?", [$id], 'i');

    if (!$archived) {
        return ['success' => false, 'affected' => 0, 'message' => 'Archived official not found'];
    }

    // A live row already holding this id would collide on the primary key.
    $live = getRecord("SELECT id FROM barangay_officials WHERE id = ?", [$id], 'i');
    if ($live) {
        return ['success' => false, 'affected' => 0, 'message' => 'An official with this ID already exists'];
    }

    // barangay_officials.official_id is UNIQUE, so a duplicate would fail on the
    // constraint. Refuse with a readable message rather than a raw SQL error.
    $idTaken = getRecord(
        "SELECT id FROM barangay_officials WHERE official_id = ?",
        [$archived['official_id']],
        's'
    );
    if ($idTaken) {
        return [
            'success' => false,
            'affected' => 0,
            'message' => "The official ID '{$archived['official_id']}' is already in use",
        ];
    }

    $columns = officialsTableColumns('barangay_officials');
    if (!$columns) {
        return ['success' => false, 'affected' => 0, 'message' => 'Unable to read the officials table columns'];
    }

    $columnList = implode(', ', $columns);

    $conn = getConnection();
    $restored = 0;
    $error = null;

    try {
        $conn->beginTransaction();

        $conn->exec("SET IDENTITY_INSERT barangay_officials ON");
        try {
            $insert = $conn->prepare(
                "INSERT INTO barangay_officials ($columnList)
                 SELECT $columnList FROM archived_barangay_officials WHERE id = ?"
            );
            $insert->execute([$id]);

            $delete = $conn->prepare("DELETE FROM archived_barangay_officials WHERE id = ?");
            $delete->execute([$id]);
            $restored = $delete->rowCount();
        } finally {
            $conn->exec("SET IDENTITY_INSERT barangay_officials OFF");
        }

        $conn->commit();
    } catch (PDOException $e) {
        if ($conn->inTransaction()) {
            $conn->rollBack();
        }
        error_log('Restore official error: ' . $e->getMessage());
        $error = $e->getMessage();
    }

    return [
        'success'  => $error === null && $restored > 0,
        'affected' => $restored,
        'message'  => $error !== null
            ? 'Restore failed: ' . $error
            : ($restored > 0 ? 'Official restored successfully' : 'Official could not be restored'),
    ];
}

/**
 * Permanently remove an archived official row.
 *
 * Deliberately one-directional: this deletes from the archive table only and never
 * touches barangay_officials. The row is gone afterwards, so there is no undo.
 */
function permanentlyDeleteOfficial($id)
{
    $archived = getRecord("SELECT * FROM archived_barangay_officials WHERE id = ?", [$id], 'i');

    if (!$archived) {
        return ['success' => false, 'affected' => 0, 'message' => 'Archived official not found'];
    }

    $conn = getConnection();
    $deleted = 0;
    $error = null;

    try {
        $conn->beginTransaction();

        $delete = $conn->prepare("DELETE FROM archived_barangay_officials WHERE id = ?");
        $delete->execute([$id]);
        $deleted = $delete->rowCount();

        $conn->commit();
    } catch (PDOException $e) {
        if ($conn->inTransaction()) {
            $conn->rollBack();
        }
        error_log('Delete archived official error: ' . $e->getMessage());
        $error = $e->getMessage();
    }

    return [
        'success'  => $error === null && $deleted > 0,
        'affected' => $deleted,
        'message'  => $error !== null
            ? 'Delete failed: ' . $error
            : ($deleted > 0 ? 'Archived official permanently deleted' : 'Archived official could not be deleted'),
    ];
}

switch ($_SERVER['REQUEST_METHOD']) {
    // -----------------------------------------------------------------------
    case 'GET':
        // Distinct terms for the "Filter by Term" dropdown.
        if (isset($_GET['terms'])) {
            $terms = getRecords(
                "SELECT DISTINCT term_start, term_end
                 FROM barangay_officials
                 WHERE term_start IS NOT NULL
                 ORDER BY term_start DESC"
            );

            $data = [];
            foreach ($terms ?: [] as $term) {
                $start = substr((string) $term['term_start'], 0, 10);
                $end = substr((string) $term['term_end'], 0, 10);
                $data[] = [
                    'term_start' => $start,
                    'term_end' => $end,
                    'label' => substr($start, 0, 4) . ' - ' . substr($end, 0, 4),
                ];
            }

            echo json_encode(['success' => true, 'data' => $data]);
            break;
        }

        // Archived officials, read from the real archive table so the Archive
        // navigation can list them. Same envelope as the live list.
        if (isset($_GET['archived'])) {
            $archivedOfficials = getRecords(
                "SELECT * FROM archived_barangay_officials
                 ORDER BY archived_at DESC, last_name ASC, first_name ASC"
            );

            echo json_encode([
                'success' => true,
                'data'    => $archivedOfficials ?: [],
                'total'   => count($archivedOfficials ?: []),
            ]);
            break;
        }

        if (isset($_GET['id'])) {
            $official = getRecord("SELECT * FROM barangay_officials WHERE id = ?", [$_GET['id']], 'i');
            if ($official) {
                echo json_encode(['success' => true, 'data' => $official]);
            } else {
                officialsFail('Official not found.', 404);
            }
            break;
        }

        $search = trim((string) ($_GET['search'] ?? ''));
        $termStart = trim((string) ($_GET['term_start'] ?? ''));
        $position = trim((string) ($_GET['position'] ?? ''));
        $status = trim((string) ($_GET['status'] ?? ''));
        $type = trim((string) ($_GET['official_type'] ?? ''));
        $page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
        $limit = isset($_GET['limit']) ? max(1, (int) $_GET['limit']) : 100;
        $offset = ($page - 1) * $limit;

        // Terms that have officially ended leave the active list on their own, so the
        // list below only ever shows serving officials. See autoArchiveExpiredOfficials().
        $autoArchived = autoArchiveExpiredOfficials();

        $where = " WHERE 1=1";
        $params = [];
        $types = '';

        if ($search !== '') {
            $where .= " AND (first_name LIKE ? OR middle_name LIKE ? OR last_name LIKE ?
                        OR position LIKE ? OR committee LIKE ? OR official_id LIKE ?)";
            for ($i = 0; $i < 6; $i++) {
                $params[] = "%$search%";
            }
            $types .= 'ssssss';
        }
        if ($termStart !== '') {
            $where .= " AND term_start = ?";
            $params[] = $termStart;
            $types .= 's';
        }
        if ($position !== '') {
            $where .= " AND position = ?";
            $params[] = $position;
            $types .= 's';
        }
        if ($status !== '') {
            $where .= " AND status = ?";
            $params[] = $status;
            $types .= 's';
        }
        if ($type !== '') {
            $where .= " AND official_type = ?";
            $params[] = $type;
            $types .= 's';
        }

        $totalResult = executeQuery("SELECT COUNT(*) AS total FROM barangay_officials" . $where, $params, $types);
        $total = 0;
        if ($totalResult !== false) {
            $row = $totalResult->fetch();
            $total = (int) ($row['total'] ?? 0);
        }

        // Barangay protocol order (Punong Barangay first), then by name. Integers
        // are inlined because PDO_ODBC binds everything as a string.
        $sql = "SELECT * FROM barangay_officials" . $where . "
                ORDER BY CASE position
                            WHEN 'Punong Barangay'    THEN 1
                            WHEN 'Barangay Kagawad'   THEN 2
                            WHEN 'SK Chairman'        THEN 3
                            WHEN 'Barangay Secretary' THEN 4
                            WHEN 'Barangay Treasurer' THEN 5
                            ELSE 9
                         END,
                         last_name ASC, first_name ASC
                OFFSET $offset ROWS FETCH NEXT $limit ROWS ONLY";

        $officials = getRecords($sql, $params, $types);

        echo json_encode([
            'success' => true,
            'data' => $officials ?: [],
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'totalPages' => $total > 0 ? (int) ceil($total / $limit) : 1,
            // Extra key, additive: the list is unchanged when the sweep archived nothing.
            'auto_archived' => $autoArchived,
        ]);
        break;

    // -----------------------------------------------------------------------
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            $data = [];
        }

        // Permanently delete an archived official. Kept ahead of the payload validation
        // below, which would reject a delete request for not being a new official.
        if (isset($data['action']) && $data['action'] === 'delete') {
            $deleteId = isset($data['id']) ? (int) $data['id'] : 0;

            if ($deleteId <= 0) {
                officialsFail('An archived official id is required.');
                break;
            }

            $result = permanentlyDeleteOfficial($deleteId);

            if ($result['success']) {
                logUserActivity('Official', 'Permanently deleted archived official ' . $deleteId);
            }

            echo json_encode([
                'success'  => $result['success'],
                'affected' => $result['affected'],
                'message'  => $result['message'],
            ]);
            break;
        }

        // Restore an archived official. Kept ahead of the payload validation below,
        // which would reject a restore request for not being a new official.
        if (isset($data['action']) && $data['action'] === 'restore') {
            $restoreId = isset($data['id']) ? (int) $data['id'] : 0;

            if ($restoreId <= 0) {
                officialsFail('An archived official id is required.');
                break;
            }

            $result = restoreOfficial($restoreId);

            // Only a restore that actually moved a row belongs in the trail.
            if ($result['success']) {
                logUserActivity('Official', 'Restored ' . officialDisplayName($restoreId));
            }

            echo json_encode([
                'success'  => $result['success'],
                'affected' => $result['affected'],
                'message'  => $result['message'],
            ]);
            break;
        }

        $error = validateOfficialPayload($data);
        if ($error !== '') {
            officialsFail($error);
            break;
        }

        $photoPayload = isset($data['photo_base64']) ? $data['photo_base64'] : '';

        $insertSql = "INSERT INTO barangay_officials (
                        official_id, first_name, middle_name, last_name, suffix, gender,
                        birth_date, position, committee, term_start, term_end, mobile_number,
                        email, address, status, official_type, move_in_date
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

        $officialId = null;
        $newId = false;

        // Retry with the next sequence number when a concurrent request has
        // already claimed the candidate ID.
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $officialId = generateOfficialId($attempt);

            $params = [
                $officialId,
                trim((string) $data['first_name']),
                trim((string) ($data['middle_name'] ?? '')),
                trim((string) $data['last_name']),
                trim((string) ($data['suffix'] ?? '')),
                $data['gender'],
                trim((string) ($data['birth_date'] ?? '')) !== '' ? $data['birth_date'] : null,
                $data['position'],
                trim((string) ($data['committee'] ?? '')) !== '' ? $data['committee'] : null,
                $data['term_start'],
                $data['term_end'],
                normaliseMobile($data['mobile_number']),
                trim((string) ($data['email'] ?? '')) !== '' ? trim((string) $data['email']) : null,
                trim((string) ($data['address'] ?? '')) !== '' ? trim((string) $data['address']) : null,
                $data['status'] ?? 'Active',
                $data['official_type'] ?? 'Elected',
                trim((string) ($data['move_in_date'] ?? '')) !== '' ? $data['move_in_date'] : null,
            ];

            $newId = insertRecord($insertSql, $params, 'sssssssssssssssss');
            if ($newId) {
                break;
            }
        }

        if (!$newId) {
            officialsFail('Unable to save the official record. Please try again.', 500);
            break;
        }

        // The row exists now, so a rejected photo cannot leave a stray file behind.
        if (is_string($photoPayload) && $photoPayload !== '') {
            $profileImage = storeOfficialPhoto($photoPayload);
            if ($profileImage !== null) {
                executeStatement(
                    "UPDATE barangay_officials SET profile_image = ? WHERE id = ?",
                    [$profileImage, $newId],
                    'si'
                );
            }
        }

        logUserActivity('Official', 'Added ' . officialDisplayName($newId) . ' (' . $officialId . ')');

        echo json_encode([
            'success' => true,
            'id' => $newId,
            'official_id' => $officialId,
            'message' => 'Official has been added successfully!',
            'data' => getRecord("SELECT * FROM barangay_officials WHERE id = ?", [$newId], 'i'),
        ]);
        break;

    // -----------------------------------------------------------------------
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            $data = [];
        }

        $id = $data['id'] ?? null;
        if (!$id) {
            officialsFail('An official record id is required.');
            break;
        }

        $existing = getRecord("SELECT * FROM barangay_officials WHERE id = ?", [$id], 'i');
        if (!$existing) {
            officialsFail('Official not found.', 404);
            break;
        }

        $error = validateOfficialPayload($data);
        if ($error !== '') {
            officialsFail($error);
            break;
        }

        $ok = executeStatement(
            "UPDATE barangay_officials SET
                first_name = ?, middle_name = ?, last_name = ?, suffix = ?, gender = ?,
                birth_date = ?, position = ?, committee = ?, term_start = ?, term_end = ?,
                mobile_number = ?, email = ?, address = ?, status = ?, official_type = ?,
                move_in_date = ?, updated_at = " . db_now_sql() . "
             WHERE id = ?",
            [
                trim((string) $data['first_name']),
                trim((string) ($data['middle_name'] ?? '')),
                trim((string) $data['last_name']),
                trim((string) ($data['suffix'] ?? '')),
                $data['gender'],
                trim((string) ($data['birth_date'] ?? '')) !== '' ? $data['birth_date'] : null,
                $data['position'],
                trim((string) ($data['committee'] ?? '')) !== '' ? $data['committee'] : null,
                $data['term_start'],
                $data['term_end'],
                normaliseMobile($data['mobile_number']),
                trim((string) ($data['email'] ?? '')) !== '' ? trim((string) $data['email']) : null,
                trim((string) ($data['address'] ?? '')) !== '' ? trim((string) $data['address']) : null,
                $data['status'] ?? 'Active',
                $data['official_type'] ?? 'Elected',
                trim((string) ($data['move_in_date'] ?? '')) !== '' ? $data['move_in_date'] : null,
                $id,
            ],
            'sssssssssssssssssi'
        );

        if ($ok === false) {
            officialsFail('Unable to update the official record. Please try again.', 500);
            break;
        }

        // A replacement photo is optional; the record is already updated either way.
        $photoPayload = isset($data['photo_base64']) ? $data['photo_base64'] : '';
        if (is_string($photoPayload) && $photoPayload !== '') {
            $profileImage = storeOfficialPhoto($photoPayload);
            if ($profileImage !== null) {
                executeStatement(
                    "UPDATE barangay_officials SET profile_image = ? WHERE id = ?",
                    [$profileImage, $id],
                    'si'
                );
            }
        }

        logUserActivity('Official', 'Updated ' . officialDisplayName($id) . ' (' . ($existing['official_id'] ?? ('#' . $id)) . ')');

        echo json_encode([
            'success' => true,
            'id' => $id,
            'message' => 'Official has been updated successfully!',
            'data' => getRecord("SELECT * FROM barangay_officials WHERE id = ?", [$id], 'i'),
        ]);
        break;

    // -----------------------------------------------------------------------
    case 'DELETE':
        // Archive: copy the row into archived_barangay_officials, then remove it
        // from barangay_officials. Both halves run in one transaction and the
        // original is only deleted once the copy has landed (same convention as
        // archiving a certificate or a resident).
        $id = $_GET['id'] ?? null;
        if (!$id) {
            officialsFail('An official record id is required.');
            break;
        }

        // Read the row first: the archive log line needs the name, and after the
        // delete it is gone from barangay_officials.
        $official = getRecord("SELECT * FROM barangay_officials WHERE id = ?", [$id], 'i');
        if (!$official) {
            officialsFail('Official not found.', 404);
            break;
        }

        $archivedBy = trim((string) ($_SESSION['name'] ?? ''));
        if ($archivedBy === '') {
            $archivedBy = trim((string) ($_SESSION['username'] ?? ''));
        }

        $result = archiveOfficialRecord($id, $archivedBy);
        $archived = $result['archived'];

        if ($result['error'] !== null) {
            officialsFail('The official record could not be archived.', 500);
            break;
        }

        if ($archived > 0) {
            logUserActivity('Official', 'Archived ' . officialDisplayName($id, $official) . ' (' . $official['official_id'] . ')');
        }

        echo json_encode([
            'success' => $archived > 0,
            'affected' => $archived,
            'message' => $archived > 0
                ? 'Official has been archived successfully!'
                : 'Official could not be archived.',
        ]);
        break;

    // -----------------------------------------------------------------------
    default:
        officialsFail('Invalid request method.', 405);
        break;
}
