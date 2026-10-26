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
            
            $sql = "SELECT * FROM blotter_cases WHERE archived = 0 OR archived IS NULL";
            $countSql = "SELECT COUNT(*) as total FROM blotter_cases WHERE archived = 0 OR archived IS NULL";
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
            
            // Get paginated results
            $sql .= " ORDER BY incident_date DESC, created_at DESC LIMIT ? OFFSET ?";
            $params[] = $limit;
            $params[] = $offset;
            $types .= "ii";
            
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
        
        $sql = "INSERT INTO blotter_cases (
                    case_number, case_type, location, incident_date, incident_time, 
                    complainant_name, complainant_contact, complainant_address, 
                    respondent_name, respondent_contact, respondent_address, 
                    incident_summary, assigned_officer, status, schedule_date, schedule_time,
                    reported_date, reported_time
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        
        $params = [
            $case_number,
            $data['case_type'] ?? '',
            $data['location'] ?? '',
            $data['incident_date'] ?? date('Y-m-d'),
            $data['incident_time'] ?? date('H:i:s'),
            $data['complainant_name'] ?? '',
            $data['complainant_contact'] ?? '',
            $data['complainant_address'] ?? '',
            $data['respondent_name'] ?? '',
            $data['respondent_contact'] ?? '',
            $data['respondent_address'] ?? '',
            $data['incident_summary'] ?? '',
            $data['assigned_officer'] ?? '',
            $data['status'] ?? 'Ongoing',
            $data['schedule_date'] ?? null,
            $data['schedule_time'] ?? null,
            $data['reported_date'] ?? date('Y-m-d'),
            $data['reported_time'] ?? date('H:i:s')
        ];
        
        $id = insertRecord($sql, $params, 'ssssssssssssssssss');
        
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
            echo json_encode(['success' => false, 'error' => 'Failed to insert case']);
        }
        break;
        
    case 'PUT':
        // Update case
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (!$data || !isset($data['id'])) {
            echo json_encode(['success' => false, 'error' => 'Invalid data']);
            break;
        }
        
        $sql = "UPDATE blotter_cases SET 
                    case_type = ?, location = ?, incident_date = ?, incident_time = ?,
                    complainant_name = ?, complainant_contact = ?, complainant_address = ?,
                    respondent_name = ?, respondent_contact = ?, respondent_address = ?,
                    incident_summary = ?, assigned_officer = ?, status = ?,
                    schedule_date = ?, schedule_time = ?
                WHERE id = ?";
        
        $params = [
            $data['case_type'] ?? '',
            $data['location'] ?? '',
            $data['incident_date'] ?? '',
            $data['incident_time'] ?? '',
            $data['complainant_name'] ?? '',
            $data['complainant_contact'] ?? '',
            $data['complainant_address'] ?? '',
            $data['respondent_name'] ?? '',
            $data['respondent_contact'] ?? '',
            $data['respondent_address'] ?? '',
            $data['incident_summary'] ?? '',
            $data['assigned_officer'] ?? '',
            $data['status'] ?? 'Ongoing',
            $data['schedule_date'] ?? null,
            $data['schedule_time'] ?? null,
            $data['id']
        ];
        
        $affected = executeStatement($sql, $params, 'sssssssssssssssi');
        
        logUserActivity('Blotter', 'Updated blotter case #' . $id);

        echo json_encode([
            'success' => true, 
            'affected' => $affected,
            'message' => 'Case updated successfully'
        ]);
        break;
        
    case 'DELETE':
        // Archive case (soft delete)
        $id = isset($_GET['id']) ? $_GET['id'] : null;
        
        if (!$id) {
            echo json_encode(['success' => false, 'error' => 'No ID provided']);
            break;
        }
        
        $sql = "UPDATE blotter_cases SET archived = 1 WHERE id = ?";
        executeStatement($sql, [$id], 'i');

        logUserActivity('Blotter', 'Archived blotter case #' . $id);

        echo json_encode([
            'success' => true,
            'message' => 'Case archived successfully'
        ]);
        break;
        
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid request method']);
        break;
}
?>