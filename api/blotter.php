<?php
// Enable error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

// Check if db_connection.php exists
if (!file_exists('../config/db_connection.php')) {
    echo json_encode(['success' => false, 'error' => 'Database connection file not found']);
    exit;
}

// functions.php supplies logUserActivity(); same reason as api/residents.php.
require_once __DIR__ . '/../config/functions.php';
require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../config/app_session.php';

requireLogin();

$method = $_SERVER['REQUEST_METHOD'];

// For debugging - log the request
error_log("Blotter API - Method: " . $method);
error_log("Blotter API - GET params: " . print_r($_GET, true));

/**
 * A blotter case's short label for the activity trail: its case number when one is
 * present, otherwise the complainant it belongs to.
 */
function blotterShortLabel($case)
{
    if (!is_array($case)) {
        return 'case';
    }

    $number = trim((string) ($case['case_number'] ?? ''));
    if ($number !== '') {
        return 'case ' . $number;
    }

    $complainant = trim((string) ($case['complainant_name'] ?? ''));

    return $complainant !== '' ? 'case against ' . $complainant : 'case';
}

switch($method) {
    case 'GET':
        if(isset($_GET['id'])) {
            // Get single case
            $sql = "SELECT * FROM blotter_cases WHERE id = ?";
            $case = getRecord($sql, [$_GET['id']], 'i');
            
            if ($case) {
                echo json_encode($case);
            } else {
                echo json_encode(['success' => false, 'error' => 'Case not found']);
            }
        } else {
            // Get all cases with filters
            $search = isset($_GET['search']) ? $_GET['search'] : '';
            $caseType = isset($_GET['caseType']) ? $_GET['caseType'] : '';
            $status = isset($_GET['status']) ? $_GET['status'] : '';
            $filterDate = isset($_GET['filterDate']) ? $_GET['filterDate'] : '';
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 5;
            $offset = ($page - 1) * $limit;
            
            // blotter_cases has no "archived" column on SQL Server: archiving moves
            // the row into archived_blotter_cases instead (see the DELETE branch).
            // "WHERE 1=1" keeps the AND-chained filters below valid.
            $sql = "SELECT * FROM blotter_cases WHERE 1=1";
            $countSql = "SELECT COUNT(*) as total FROM blotter_cases WHERE 1=1";
            $params = [];
            $types = "";
            
            if($search) {
                $sql .= " AND (case_number LIKE ? OR complainant_name LIKE ? OR respondent_name LIKE ?)";
                $countSql .= " AND (case_number LIKE ? OR complainant_name LIKE ? OR respondent_name LIKE ?)";
                $searchParam = "%$search%";
                $params[] = $searchParam;
                $params[] = $searchParam;
                $params[] = $searchParam;
                $types .= "sss";
            }
            if($caseType) {
                $sql .= " AND case_type = ?";
                $countSql .= " AND case_type = ?";
                $params[] = $caseType;
                $types .= "s";
            }
            if($status) {
                $sql .= " AND status = ?";
                $countSql .= " AND status = ?";
                $params[] = $status;
                $types .= "s";
            }
            if($filterDate) {
                $sql .= " AND incident_date = ?";
                $countSql .= " AND incident_date = ?";
                $params[] = $filterDate;
                $types .= "s";
            }
            
            // Get total count
            $totalResult = executeQuery($countSql, $params, $types);
            $totalRow = $totalResult !== false ? $totalResult->fetch() : null;
            $total = (int) ($totalRow['total'] ?? 0);
            
            // Get paginated results.
            // Inline integers: PDO_ODBC cannot bind LIMIT/OFFSET placeholders, and
            // LIMIT is not T-SQL anyway - SQL Server paginates with
            // OFFSET ... ROWS FETCH NEXT ... ROWS ONLY, which also requires ORDER BY.
            // $limit/$offset come from (int) casts above, never from raw input.
            $sql .= " ORDER BY incident_date DESC, created_at DESC"
                  . " OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";

            $cases = getRecords($sql, $params, $types);
            
            // Ensure we always return an array even if empty
            if (!$cases) {
                $cases = [];
            }
            
            echo json_encode([
                'success' => true,
                'data' => $cases,
                'total' => (int)$total,
                'page' => $page,
                'limit' => $limit,
                'totalPages' => $total > 0 ? ceil($total / $limit) : 1
            ]);
        }
        break;
        
    case 'POST':
        // Create new case
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (!$data) {
            echo json_encode(['success' => false, 'error' => 'Invalid data received']);
            break;
        }
        
        // Generate case number
        $year = date('Y');
        $sql = "SELECT COUNT(*) as count FROM blotter_cases WHERE case_number LIKE 'BL-$year%'";
        $result = executeQuery($sql);
        $row = $result !== false ? $result->fetch() : null;
        $count = (int) (($row['count'] ?? 0) + 1);
        $case_number = "BL-$year-" . str_pad($count, 4, '0', STR_PAD_LEFT);
        
        // NOTE: blotter_cases has no reported_date / reported_time columns on the
        // live SQL Server database. The form's "reported" inputs map to
        // incident_date / incident_time (see saveCase in modules/blotter.js), and
        // the list view already falls back to incident_date, so these two columns
        // are intentionally not written.
        // complainant_relation / respondent_status are collected by the form but
        // were previously dropped on the way in, so the columns stayed NULL.
        $sql = "INSERT INTO blotter_cases (
                    case_number, case_type, location, incident_date, incident_time,
                    complainant_name, complainant_contact, complainant_address, complainant_relation,
                    respondent_name, respondent_contact, respondent_address, respondent_status,
                    incident_summary, assigned_officer, status, schedule_date, schedule_time
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

        // incident_date / incident_time are NOT NULL, so an empty or unparseable
        // value falls back to "now" - null would raise error 515 (cannot insert
        // NULL into a NOT NULL column) instead of the cast error we are fixing.
        // schedule_date / schedule_time are nullable: normalise "" to null, because
        // ODBC refuses to cast an empty string into a date/time column as well.
        $incident_date = to_db_date($data['incident_date'] ?? '') ?: date('Y-m-d');
        $incident_time = to_db_time($data['incident_time'] ?? '') ?: date('H:i:s');
        $schedule_date = to_db_date($data['schedule_date'] ?? null);
        $schedule_time = to_db_time($data['schedule_time'] ?? null);

        $params = [
            $case_number,
            $data['case_type'] ?? '',
            $data['location'] ?? '',
            $incident_date,
            $incident_time,
            $data['complainant_name'] ?? '',
            $data['complainant_contact'] ?? '',
            $data['complainant_address'] ?? '',
            $data['complainant_relation'] ?? '',
            $data['respondent_name'] ?? '',
            $data['respondent_contact'] ?? '',
            $data['respondent_address'] ?? '',
            $data['respondent_status'] ?? '',
            $data['incident_summary'] ?? '',
            $data['assigned_officer'] ?? '',
            $data['status'] ?? 'Ongoing',
            $schedule_date,
            $schedule_time
        ];

        $id = insertRecord($sql, $params, 'ssssssssssssssss');

        if ($id) {
            // Get the created case
            $newCase = getRecord("SELECT * FROM blotter_cases WHERE id = ?", [$id], 'i');

            logUserActivity('Blotter', 'Filed ' . blotterShortLabel($newCase) . ' (case #' . $id . ')');

            echo json_encode([
                'success' => true,
                'id' => $id,
                'case_number' => $case_number,
                'data' => $newCase
            ]);
        } else {
            // Surface the real driver message so the alert says what actually broke.
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error'   => 'Failed to insert case',
                'detail'  => lastDbError() ?: 'No database error was captured.',
            ]);
        }
        break;
        
    case 'PUT':
        // Update case
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (!$data || !isset($data['id'])) {
            echo json_encode(['success' => false, 'error' => 'Invalid data']);
            break;
        }

        // Read the stored values first. incident_date / incident_time are NOT NULL,
        // so when the caller supplies nothing usable we keep what is already there
        // rather than stamping today's date over a real incident date.
        $existing = getRecord(
            "SELECT incident_date, incident_time FROM blotter_cases WHERE id = ?",
            [$data['id']],
            'i'
        );

        if (!$existing) {
            echo json_encode(['success' => false, 'error' => 'Case not found']);
            break;
        }
        
        $sql = "UPDATE blotter_cases SET 
                    case_type = ?, location = ?, incident_date = ?, incident_time = ?,
                    complainant_name = ?, complainant_contact = ?, complainant_address = ?, complainant_relation = ?,
                    respondent_name = ?, respondent_contact = ?, respondent_address = ?, respondent_status = ?,
                    incident_summary = ?, assigned_officer = ?, status = ?,
                    schedule_date = ?, schedule_time = ?
                WHERE id = ?";
        
        $params = [
            $data['case_type'] ?? '',
            $data['location'] ?? '',
            to_db_date($data['incident_date'] ?? '') ?: $existing['incident_date'],
            to_db_time($data['incident_time'] ?? '') ?: $existing['incident_time'],
            $data['complainant_name'] ?? '',
            $data['complainant_contact'] ?? '',
            $data['complainant_address'] ?? '',
            $data['complainant_relation'] ?? '',
            $data['respondent_name'] ?? '',
            $data['respondent_contact'] ?? '',
            $data['respondent_address'] ?? '',
            $data['respondent_status'] ?? '',
            $data['incident_summary'] ?? '',
            $data['assigned_officer'] ?? '',
            $data['status'] ?? 'Ongoing',
            to_db_date($data['schedule_date'] ?? null),
            to_db_time($data['schedule_time'] ?? null),
            $data['id']
        ];
        
        $affected = executeStatement($sql, $params, 'sssssssssssssssi');
        
        logUserActivity('Blotter', 'Updated blotter case #' . $id);


        echo json_encode([
            'success'  => $affected !== false,
            'affected' => $affected,
            'message'  => $affected !== false
                ? 'Case updated successfully'
                : ('Update failed: ' . lastDbError()),
        ]);
        break;
        
    case 'DELETE':
        // Archive case: copy the row into archived_blotter_cases, then remove it
        // from blotter_cases. blotter_cases has no "archived" flag column on SQL
        // Server, so an UPDATE ... SET archived = 1 always failed and the endpoint
        // still reported success. Both halves run in one transaction, and the row
        // is only removed once the copy has actually landed.
        $id = isset($_GET['id']) ? $_GET['id'] : null;

        if (!$id) {
            echo json_encode(['success' => false, 'message' => 'ID is required']);
            break;
        }

        
        $sql = "UPDATE blotter_cases SET archived = 1, archived_at = GETDATE() WHERE id = ?";
        executeStatement($sql, [$id], 'i');

        logUserActivity('Blotter', 'Archived blotter case #' . $id);


        $case = getRecord("SELECT * FROM blotter_cases WHERE id = ?", [$id], 'i');

        if (!$case) {
            echo json_encode(['success' => false, 'message' => 'Case not found']);
            break;
        }

        // "INSERT INTO archived_blotter_cases SELECT * FROM blotter_cases WHERE id = ?"
        // cannot work against SQL Server: archived_blotter_cases.id is an IDENTITY
        // column, so writing the original id needs an explicit column list plus
        // IDENTITY_INSERT (otherwise error 8101), and with a bound parameter the ODBC
        // driver fails earlier with "Operand type clash: text is incompatible with
        // int". The column list is read from the source table so it cannot drift out
        // of sync, and the original id is preserved so an archived row still maps 1:1
        // to the case it came from.
        $columns = [];
        foreach (getRecords(
            "SELECT c.name AS col FROM sys.columns c WHERE c.object_id = OBJECT_ID('blotter_cases') ORDER BY c.column_id"
        ) as $column) {
            $columns[] = $column['col'];
        }

        if (!$columns) {
            echo json_encode(['success' => false, 'message' => 'Unable to read the blotter_cases table columns']);
            break;
        }

        $columnList = implode(', ', $columns);
        $conn = getConnection();
        $archived = 0;
        $error = null;

        try {
            $conn->beginTransaction();

            $conn->exec("SET IDENTITY_INSERT archived_blotter_cases ON");
            try {
                $insert = $conn->prepare(
                    "INSERT INTO archived_blotter_cases ($columnList) SELECT $columnList FROM blotter_cases WHERE id = ?"
                );
                $insert->execute([$id]);

                $delete = $conn->prepare("DELETE FROM blotter_cases WHERE id = ?");
                $delete->execute([$id]);
                $archived = $delete->rowCount();
            } finally {
                $conn->exec("SET IDENTITY_INSERT archived_blotter_cases OFF");
            }

            $conn->commit();
        } catch (Throwable $e) {
            if ($conn->inTransaction()) {
                $conn->rollBack();
            }
            recordDbError('Archive error: ' . $e->getMessage());
            $error = $e->getMessage();
        }


        echo json_encode([
            'success'  => $error === null && $archived > 0,
            'affected' => $archived,
            'message'  => $error !== null
                ? 'Archive failed: ' . $error
                : ($archived > 0 ? 'Case archived successfully' : 'Case could not be archived'),
        ]);
        break;
        
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid request method']);
        break;
}
?>