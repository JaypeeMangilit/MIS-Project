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
$OFFICIAL_POSITIONS = [
    'Punong Barangay',
    'Barangay Kagawad',
    'SK Chairman',
    'Barangay Secretary',
    'Barangay Treasurer',
];

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
    global $OFFICIAL_POSITIONS, $OFFICIAL_COMMITTEES, $OFFICIAL_TYPES, $OFFICIAL_STATUSES;

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

    if (!in_array($data['position'] ?? '', $OFFICIAL_POSITIONS, true)) {
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
        ]);
        break;

    // -----------------------------------------------------------------------
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            $data = [];
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
                        email, address, status, official_type
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

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
            ];

            $newId = insertRecord($insertSql, $params, 'ssssssssssssssss');
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
                updated_at = " . db_now_sql() . "
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
                $id,
            ],
            'ssssssssssssssssi'
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

        if (!getRecord("SELECT id FROM barangay_officials WHERE id = ?", [$id], 'i')) {
            officialsFail('Official not found.', 404);
            break;
        }

        $columns = officialsTableColumns('barangay_officials');
        if (!$columns) {
            officialsFail('Unable to read the officials table columns.', 500);
            break;
        }

        $columnList = implode(', ', $columns);
        $archivedBy = trim((string) ($_SESSION['name'] ?? ''));
        if ($archivedBy === '') {
            $archivedBy = trim((string) ($_SESSION['username'] ?? ''));
        }

        $conn = getConnection();
        $archived = 0;
        $error = null;

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
            $error = $e->getMessage();
        }

        if ($error !== null) {
            officialsFail('The official record could not be archived.', 500);
            break;
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
