<?php
/**
 * certificates.php (API) - Certificate issuance records for Barangay 49 Akasya.
 *
 *   GET    certificates.php                       -> list (search, filters, pagination)
 *   GET    certificates.php?id=N                  -> one issuance
 *   GET    certificates.php?archived=1            -> list archived issuances (Archives page)
 *   GET    certificates.php?archived=1&id=N       -> one archived issuance
 *   POST   certificates.php                       -> create
 *   POST   certificates.php {action:restore,id:N} -> move an archived row back to the live table
 *   PUT    certificates.php                       -> update (id in the body)
 *   DELETE certificates.php?id=N                  -> archive (move to archived_certificate_issuances)
 *
 * List response:  { success, data: [...], total, page, limit, totalPages }
 * Single record:  { success, data: {...} }
 * Write:          { success, data: {...}, message }
 * Failure:        { success: false, message }  (HTTP 400 / 404 / 500)
 *
 * Resident details are never duplicated: every row is joined to `residents`.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

require_once __DIR__ . '/../config/functions.php';
require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../config/app_session.php';

requireLogin();

/** Certificate types offered by the Issue New Certificate form. */
$CERTIFICATE_TYPES = [
    'Barangay Clearance',
    'Certificate of Indigency',
    'Certificate of Residency',
    'Business Permit',
    'Cedula (Community Tax Certificate)',
    'Good Moral Character',
];

/** Statuses offered by the Edit form. */
$CERTIFICATE_STATUSES = ['Valid', 'Expired', 'Archived'];

/** Issuance validity period, in months, counted from the date issued. */
const CERTIFICATE_VALID_MONTHS = 6;

/** Maximum accepted amount paid (DECIMAL(10,2)). */
const CERTIFICATE_MAX_AMOUNT = 99999999.99;

/**
 * Base SELECT: one issuance joined to the resident it was issued to.
 */
function certificateSelectSql(): string
{
    return "SELECT c.id, c.resident_id, c.certificate_type, c.purpose, c.or_number,
                   c.amount_paid, c.date_issued, c.valid_until, c.status, c.issued_by,
                   c.created_at, c.updated_at,
                   r.resident_id AS resident_code, r.first_name, r.middle_name,
                   r.last_name, r.suffix, r.purok, r.street_name
            FROM certificate_issuances c
            INNER JOIN residents r ON r.id = c.resident_id";
}

/**
 * Shape a joined row for the frontend: resident display name, address summary
 * and a numeric amount. The name follows the Residents module convention
 * ("Last, First M.").
 */
function decorateCertificate(array $row): array
{
    $middle = trim((string) ($row['middle_name'] ?? ''));
    $name = trim((string) ($row['last_name'] ?? ''));
    $name .= ($name !== '' ? ', ' : '') . trim((string) ($row['first_name'] ?? ''));
    if ($middle !== '') {
        $name .= ' ' . strtoupper(substr($middle, 0, 1)) . '.';
    }
    $suffix = trim((string) ($row['suffix'] ?? ''));
    if ($suffix !== '') {
        $name .= ' ' . $suffix;
    }
    $row['resident_name'] = $name !== '' && $name !== ',' ? $name : '—';

    $address = array_values(array_filter([
        trim((string) ($row['purok'] ?? '')),
        trim((string) ($row['street_name'] ?? '')),
    ], static function ($part) {
        return $part !== '';
    }));
    $row['resident_address'] = $address ? implode(' • ', $address) : '—';

    $row['amount_paid'] = number_format((float) ($row['amount_paid'] ?? 0), 2, '.', '');
    $row['or_number'] = ($row['or_number'] === null || $row['or_number'] === '') ? null : (string) $row['or_number'];

    return $row;
}

/**
 * Control number: BRGY49-{TYPE}-{YEAR}-{NNNN}.
 *
 * Not stored in the table - it is derived from the certificate type, the year of
 * issue and the row id, so the archives page can show the same number as the
 * Certificates module (mirrors generateControlNumber() in modules/certificates.js).
 */
function certificateControlNumber(string $type, string $dateIssued, $id): string
{
    $typeCode = 'GEN';
    if (strpos($type, 'Clearance') !== false) {
        $typeCode = 'CLR';
    } elseif (strpos($type, 'Indigency') !== false) {
        $typeCode = 'IND';
    } elseif (strpos($type, 'Residency') !== false) {
        $typeCode = 'RES';
    } elseif (strpos($type, 'Business') !== false) {
        $typeCode = 'BUS';
    } elseif (strpos($type, 'Cedula') !== false) {
        $typeCode = 'CED';
    } elseif (strpos($type, 'Good Moral') !== false) {
        $typeCode = 'GMC';
    }

    $year = strlen($dateIssued) >= 4 ? substr($dateIssued, 0, 4) : date('Y');

    return 'BRGY49-' . $typeCode . '-' . $year . '-' . str_pad((string) $id, 4, '0', STR_PAD_LEFT);
}

/** Format a stored datetime as "Oct 20, 2026" for the archives table. */
function formatArchiveDate($value): string
{
    $value = trim((string) ($value ?? ''));
    if ($value === '') {
        return '—';
    }
    $timestamp = strtotime($value);
    if ($timestamp === false) {
        return $value;
    }
    return date('M j, Y', $timestamp);
}

/**
 * Base SELECT for the archive table. LEFT JOIN (not INNER) so an archived
 * certificate still lists if its resident row is ever removed.
 */
function archivedCertificateSelectSql(): string
{
    return "SELECT c.id, c.resident_id, c.certificate_type, c.purpose, c.or_number,
                   c.amount_paid, c.date_issued, c.valid_until, c.status, c.issued_by,
                   c.created_at, c.updated_at, c.archived_at, c.archived_by,
                   r.resident_id AS resident_code, r.first_name, r.middle_name,
                   r.last_name, r.suffix, r.purok, r.street_name
            FROM archived_certificate_issuances c
            LEFT JOIN residents r ON r.id = c.resident_id";
}

/** Archived row: the live shape plus the archive fields. */
function decorateArchivedCertificate(array $row): array
{
    $row = decorateCertificate($row);
    $row['control_number'] = certificateControlNumber(
        (string) ($row['certificate_type'] ?? ''),
        (string) ($row['date_issued'] ?? ''),
        $row['id'] ?? 0
    );
    $row['archived_date'] = formatArchiveDate($row['archived_at'] ?? null);
    $row['archived_by'] = ($row['archived_by'] === null || $row['archived_by'] === '') ? '—' : (string) $row['archived_by'];

    return $row;
}

/**
 * Validate a create/update payload.
 *
 * @param array    $data           Decoded request body.
 * @param bool     $isUpdate       Updates cannot change the resident or the type.
 * @param string[] $allowedTypes
 * @param string[] $allowedStatuses
 * @return array{0: string[], 1: array} [errors, clean values]
 */
function validateCertificateInput(array $data, bool $isUpdate, array $allowedTypes, array $allowedStatuses): array
{
    $errors = [];
    $clean = [];

    // Resident reference (create only - the edit form shows it read-only).
    if (!$isUpdate) {
        $residentId = filter_var($data['resident_id'] ?? null, FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1],
        ]);

        if ($residentId === false || $residentId === null) {
            $errors[] = 'Please select a resident from the search results.';
        } else {
            $resident = getRecord("SELECT id FROM residents WHERE id = ?", [$residentId], 'i');
            if (!$resident) {
                $errors[] = 'The selected resident no longer exists. Please search again.';
            } else {
                $clean['resident_id'] = (int) $residentId;
            }
        }

        $type = trim((string) ($data['certificate_type'] ?? ''));
        if ($type === '') {
            $errors[] = 'Certificate Type is required.';
        } elseif (!in_array($type, $allowedTypes, true)) {
            $errors[] = 'Please choose a valid Certificate Type.';
        } else {
            $clean['certificate_type'] = $type;
        }
    }

    // Purpose
    $purpose = trim((string) ($data['purpose'] ?? ''));
    if ($purpose === '') {
        $errors[] = 'Purpose is required.';
    } elseif (strlen($purpose) > 255) {
        $errors[] = 'Purpose must not exceed 255 characters.';
    } else {
        $clean['purpose'] = $purpose;
    }

    // OR Number - optional (the Issue form allows it to be blank)
    $orNumber = trim((string) ($data['or_number'] ?? ''));
    if ($orNumber === '') {
        $clean['or_number'] = null;
    } elseif (strlen($orNumber) > 50) {
        $errors[] = 'OR Number must not exceed 50 characters.';
    } else {
        $clean['or_number'] = $orNumber;
    }

    // Amount paid - blank means zero. Currency symbols, spaces and thousands
    // separators are tolerated; anything else must be a plain number, so a
    // negative or malformed entry is rejected instead of silently changed.
    $amountRaw = trim((string) ($data['amount_paid'] ?? ''));
    $amountNormalized = str_replace(['₱', ' ', ',', "\u{00A0}"], '', $amountRaw);
    if ($amountNormalized === '') {
        $clean['amount_paid'] = 0.0;
    } elseif (!is_numeric($amountNormalized)) {
        $errors[] = 'Amount Paid must be a number.';
    } else {
        $amount = round((float) $amountNormalized, 2);
        if ($amount < 0) {
            $errors[] = 'Amount Paid cannot be negative.';
        } elseif ($amount > CERTIFICATE_MAX_AMOUNT) {
            $errors[] = 'Amount Paid is too large.';
        } else {
            $clean['amount_paid'] = $amount;
        }
    }

    // Date issued
    $dateIssued = trim((string) ($data['date_issued'] ?? ''));
    $date = DateTime::createFromFormat('Y-m-d', $dateIssued);
    if (!$date || $date->format('Y-m-d') !== $dateIssued) {
        $errors[] = 'Date Issued must be a valid date.';
    } else {
        $clean['date_issued'] = $dateIssued;
        // Validity: 6 months from the date issued.
        $clean['valid_until'] = (clone $date)->modify('+' . CERTIFICATE_VALID_MONTHS . ' months')->format('Y-m-d');
    }

    // Status (update only; a new issuance always starts Valid)
    if ($isUpdate) {
        $status = trim((string) ($data['status'] ?? 'Valid'));
        if (!in_array($status, $allowedStatuses, true)) {
            $errors[] = 'Please choose a valid Record Status.';
        } else {
            $clean['status'] = $status;
        }
    }

    return [$errors, $clean];
}

/** Respond with a failure and stop. */
function certificateFail(string $message, int $code = 400): void
{
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $message]);
}

// --- Database availability ----------------------------------------------------
if (!isDatabaseConnected()) {
    http_response_code(503);
    echo json_encode([
        'success' => false,
        'offline' => true,
        'message' => 'Database connection unavailable. Please try again.',
        'data' => [],
    ]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        // ?archived=1 reads archived_certificate_issuances (the Archives page);
        // anything else reads the live certificate_issuances table.
        $archived = isset($_GET['archived']) && $_GET['archived'] === '1';
        $selectSql = $archived ? archivedCertificateSelectSql() : certificateSelectSql();
        $decorate = $archived ? 'decorateArchivedCertificate' : 'decorateCertificate';

        if (isset($_GET['id'])) {
            $record = getRecord($selectSql . " WHERE c.id = ?", [$_GET['id']], 'i');

            if (!$record) {
                certificateFail('Certificate record not found.', 404);
                break;
            }

            echo json_encode(['success' => true, 'data' => $decorate($record)]);
            break;
        }

        $search = trim((string) ($_GET['search'] ?? ''));
        $type = trim((string) ($_GET['certificateType'] ?? ''));
        $status = trim((string) ($_GET['status'] ?? ''));
        $page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
        $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 5;
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        $where = " WHERE 1=1";
        $params = [];
        $types = '';

        if ($search !== '') {
            $where .= " AND (r.first_name LIKE ? OR r.middle_name LIKE ? OR r.last_name LIKE ?
                             OR r.resident_id LIKE ? OR c.certificate_type LIKE ? OR c.or_number LIKE ?
                             OR c.purpose LIKE ?)";
            $like = '%' . $search . '%';
            for ($i = 0; $i < 7; $i++) {
                $params[] = $like;
            }
            $types .= 'sssssss';
        }

        if ($type !== '') {
            $where .= " AND c.certificate_type = ?";
            $params[] = $type;
            $types .= 's';
        }

        if ($status !== '') {
            $where .= " AND c.status = ?";
            $params[] = $status;
            $types .= 's';
        }

        $fromSql = $archived
            ? " FROM archived_certificate_issuances c LEFT JOIN residents r ON r.id = c.resident_id"
            : " FROM certificate_issuances c INNER JOIN residents r ON r.id = c.resident_id";

        $countSql = "SELECT COUNT(*) AS total" . $fromSql . $where;
        $totalResult = executeQuery($countSql, $params, $types);
        $totalRow = $totalResult !== false ? $totalResult->fetch() : null;
        $total = (int) ($totalRow['total'] ?? 0);

        // Inline integers: PDO_ODBC cannot bind LIMIT/OFFSET placeholders.
        $listSql = $selectSql . $where
            . " ORDER BY c.date_issued DESC, c.id DESC"
            . " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";

        $rows = getRecords($listSql, $params, $types);
        $rows = array_map($decorate, $rows ?: []);

        echo json_encode([
            'success' => true,
            'data' => $rows,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'totalPages' => $total > 0 ? (int) ceil($total / $limit) : 1,
        ]);
        break;

    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            certificateFail('Invalid request body.');
            break;
        }

        // { action: 'restore', id: N } moves an archived row back into
        // certificate_issuances (the reverse of DELETE, same transaction shape).
        if (($data['action'] ?? '') === 'restore') {
            $id = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
            if ($id === false || $id === null) {
                certificateFail('A certificate record id is required.');
                break;
            }

            $record = getRecord("SELECT id FROM archived_certificate_issuances WHERE id = ?", [$id], 'i');
            if (!$record) {
                certificateFail('Archived certificate record not found.', 404);
                break;
            }

            // The live table has a foreign key to residents, so a certificate whose
            // resident is gone cannot be restored - say so instead of failing on the FK.
            $resident = getRecord(
                "SELECT r.id FROM archived_certificate_issuances c
                 INNER JOIN residents r ON r.id = c.resident_id WHERE c.id = ?",
                [$id],
                'i'
            );
            if (!$resident) {
                certificateFail('The resident for this certificate no longer exists, so it cannot be restored.', 409);
                break;
            }

            $columns = [];
            foreach (getRecords(
                "SELECT c.name AS col FROM sys.columns c
                 WHERE c.object_id = OBJECT_ID('certificate_issuances') ORDER BY c.column_id"
            ) as $column) {
                $columns[] = $column['col'];
            }

            if (!$columns) {
                certificateFail('Unable to read the certificate table columns.', 500);
                break;
            }

            $columnList = implode(', ', $columns);
            $conn = getConnection();
            $restored = 0;
            $error = null;

            try {
                $conn->beginTransaction();

                $conn->exec("SET IDENTITY_INSERT certificate_issuances ON");
                try {
                    $insert = $conn->prepare(
                        "INSERT INTO certificate_issuances ($columnList)
                         SELECT $columnList FROM archived_certificate_issuances WHERE id = ?"
                    );
                    $insert->execute([$id]);

                    $delete = $conn->prepare("DELETE FROM archived_certificate_issuances WHERE id = ?");
                    $delete->execute([$id]);
                    $restored = $delete->rowCount();
                } finally {
                    $conn->exec("SET IDENTITY_INSERT certificate_issuances OFF");
                }

                $conn->commit();
            } catch (PDOException $e) {
                if ($conn->inTransaction()) {
                    $conn->rollBack();
                }
                error_log('Certificate restore error: ' . $e->getMessage());
                $error = $e->getMessage();
            }

            if ($error !== null) {
                certificateFail('The certificate record could not be restored.', 500);
                break;
            }

            echo json_encode([
                'success' => $restored > 0,
                'affected' => $restored,
                'message' => $restored > 0
                    ? 'Certificate has been restored to the Certificates module.'
                    : 'Certificate could not be restored.',
            ]);
            break;
        }

        [$errors, $clean] = validateCertificateInput($data, false, $CERTIFICATE_TYPES, $CERTIFICATE_STATUSES);

        if ($errors) {
            certificateFail(implode(' ', $errors));
            break;
        }

        $issuedBy = trim((string) ($_SESSION['name'] ?? ''));
        if ($issuedBy === '') {
            $issuedBy = trim((string) ($_SESSION['username'] ?? ''));
        }

        $newId = insertRecord(
            "INSERT INTO certificate_issuances
                (resident_id, certificate_type, purpose, or_number, amount_paid,
                 date_issued, valid_until, status, issued_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'Valid', ?, " . db_now_sql() . ", " . db_now_sql() . ")",
            [
                $clean['resident_id'],
                $clean['certificate_type'],
                $clean['purpose'],
                $clean['or_number'],
                $clean['amount_paid'],
                $clean['date_issued'],
                $clean['valid_until'],
                $issuedBy !== '' ? $issuedBy : null,
            ],
            'isssssss'
        );

        if ($newId === false) {
            certificateFail('The certificate record could not be saved.', 500);
            break;
        }

        $record = getRecord(certificateSelectSql() . " WHERE c.id = ?", [$newId], 'i');

        echo json_encode([
            'success' => true,
            'data' => $record ? decorateCertificate($record) : null,
            'message' => 'Certificate saved successfully.',
        ]);
        break;

    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            certificateFail('Invalid request body.');
            break;
        }

        $id = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($id === false || $id === null) {
            certificateFail('A certificate record id is required.');
            break;
        }

        $existing = getRecord("SELECT id FROM certificate_issuances WHERE id = ?", [$id], 'i');
        if (!$existing) {
            certificateFail('Certificate record not found.', 404);
            break;
        }

        [$errors, $clean] = validateCertificateInput($data, true, $CERTIFICATE_TYPES, $CERTIFICATE_STATUSES);

        if ($errors) {
            certificateFail(implode(' ', $errors));
            break;
        }

        $affected = executeStatement(
            "UPDATE certificate_issuances
             SET purpose = ?, or_number = ?, amount_paid = ?, date_issued = ?,
                 valid_until = ?, status = ?, updated_at = " . db_now_sql() . "
             WHERE id = ?",
            [
                $clean['purpose'],
                $clean['or_number'],
                $clean['amount_paid'],
                $clean['date_issued'],
                $clean['valid_until'],
                $clean['status'],
                $id,
            ],
            'ssssssi'
        );

        if ($affected === false) {
            certificateFail('The certificate record could not be updated.', 500);
            break;
        }

        $record = getRecord(certificateSelectSql() . " WHERE c.id = ?", [$id], 'i');

        echo json_encode([
            'success' => true,
            'data' => $record ? decorateCertificate($record) : null,
            'affected' => $affected,
            'message' => 'Certificate updated successfully.',
        ]);
        break;

    case 'DELETE':
        // Archive: copy the row into archived_certificate_issuances, then remove it
        // from certificate_issuances. Both halves run in one transaction and the
        // original is only deleted once the copy has landed (same convention as
        // archiving a resident in api/residents.php).
        $id = isset($_GET['id']) ? $_GET['id'] : null;

        if (!$id) {
            certificateFail('A certificate record id is required.');
            break;
        }

        $record = getRecord("SELECT id FROM certificate_issuances WHERE id = ?", [$id], 'i');
        if (!$record) {
            certificateFail('Certificate record not found.', 404);
            break;
        }

        $columns = [];
        foreach (getRecords(
            "SELECT c.name AS col FROM sys.columns c
             WHERE c.object_id = OBJECT_ID('certificate_issuances') ORDER BY c.column_id"
        ) as $column) {
            $columns[] = $column['col'];
        }

        if (!$columns) {
            certificateFail('Unable to read the certificate table columns.', 500);
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

            $conn->exec("SET IDENTITY_INSERT archived_certificate_issuances ON");
            try {
                $insert = $conn->prepare(
                    "INSERT INTO archived_certificate_issuances ($columnList, archived_at, archived_by)
                     SELECT $columnList, " . db_now_sql() . ", ? FROM certificate_issuances WHERE id = ?"
                );
                $insert->execute([$archivedBy !== '' ? $archivedBy : null, $id]);

                $delete = $conn->prepare("DELETE FROM certificate_issuances WHERE id = ?");
                $delete->execute([$id]);
                $archived = $delete->rowCount();
            } finally {
                $conn->exec("SET IDENTITY_INSERT archived_certificate_issuances OFF");
            }

            $conn->commit();
        } catch (PDOException $e) {
            if ($conn->inTransaction()) {
                $conn->rollBack();
            }
            error_log('Certificate archive error: ' . $e->getMessage());
            $error = $e->getMessage();
        }

        if ($error !== null) {
            certificateFail('The certificate record could not be archived.', 500);
            break;
        }

        echo json_encode([
            'success' => $archived > 0,
            'affected' => $archived,
            'message' => $archived > 0
                ? 'Certificate has been archived successfully!'
                : 'Certificate could not be archived.',
        ]);
        break;

    default:
        certificateFail('Invalid request method.', 405);
        break;
}
