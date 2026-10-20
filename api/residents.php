<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../config/app_session.php';

requireLogin();

/**
 * Build the next resident ID for the current year.
 *
 * The sequence is taken from MAX(resident_id) rather than COUNT(*): counting
 * rows means deleting a resident drops the counter and the next insert then
 * collides with an existing ID, and a year bucket with no rows (sample data
 * dated a previous year) restarts the counter at 1 for IDs that already exist.
 *
 * @param int $offset Extra IDs to skip, used to recover from a collision.
 * @return string|null
 */
function generateResidentId(int $offset = 0) {
    $year = date('Y');

    $row = getRecord(
        "SELECT MAX(resident_id) AS max_id FROM residents WHERE resident_id LIKE ?",
        ["RES-$year-%"],
        's'
    );

    $max = $row['max_id'] ?? null;
    $next = 1;

    if ($max !== null && preg_match('/-(\\d+)$/', $max, $matches)) {
        $next = (int) $matches[1] + 1;
    }

    $next += $offset;

    return "RES-$year-" . str_pad($next, 4, '0', STR_PAD_LEFT);
}

$method = $_SERVER['REQUEST_METHOD'];

// Check if database is connected
if (!isDatabaseConnected()) {
    // Return offline mode response for all requests
    echo json_encode([
        'success' => false,
        'offline' => true,
        'message' => 'Database connection unavailable. Using offline mode.',
        'data' => []
    ]);
    exit;
}

switch($method) {
    case 'GET':
        if(isset($_GET['action']) && $_GET['action'] === 'stats') {
            $votersResult = executeQuery("SELECT COUNT(*) as count FROM residents WHERE voter_status = 'Registered'");
            $voters = 0;
            if ($votersResult !== false) { $row = $votersResult->fetch(); $voters = (int)($row['count'] ?? 0); }
            
            $allResidents = getRecords("SELECT birth_date FROM residents WHERE birth_date IS NOT NULL AND birth_date != ''");
            $seniors = 0; $minors = 0;
            if ($allResidents !== false) {
                $currentYear = (int)date('Y');
                foreach ($allResidents as $r) {
                    $birthYear = (int)substr($r['birth_date'], 0, 4);
                    if ($birthYear > 0) {
                        $age = $currentYear - $birthYear;
                        if ($age >= 60) $seniors++;
                        if ($age < 18) $minors++;
                    }
                }
            }
            
            echo json_encode([
                'success' => true,
                'data' => [
                    'registeredVoters' => $voters,
                    'seniorCitizens' => $seniors,
                    'minors' => $minors
                ]
            ]);
            break;
        }
        if(isset($_GET['id'])) {
            // Get single resident
            $sql = "SELECT * FROM residents WHERE id = ?";
            $resident = getRecord($sql, [$_GET['id']], 'i');
            if ($resident) {
                echo json_encode($resident);
            } else {
                echo json_encode(null);
            }
        } else {
            // Get all residents with filters
            $search = isset($_GET['search']) ? $_GET['search'] : '';
            $purok = isset($_GET['purok']) ? $_GET['purok'] : '';
            $gender = isset($_GET['gender']) ? $_GET['gender'] : '';
            $status = isset($_GET['status']) ? $_GET['status'] : '';
            $voterStatus = isset($_GET['voterStatus']) ? $_GET['voterStatus'] : '';
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
            $offset = ($page - 1) * $limit;
            
            $sql = "SELECT * FROM residents WHERE 1=1";
            $countSql = "SELECT COUNT(*) as total FROM residents WHERE 1=1";
            $params = [];
            $types = "";
            
            if($search) {
                $sql .= " AND (first_name LIKE ? OR last_name LIKE ? OR resident_id LIKE ? OR middle_name LIKE ?)";
                $countSql .= " AND (first_name LIKE ? OR last_name LIKE ? OR resident_id LIKE ? OR middle_name LIKE ?)";
                $searchParam = "%$search%";
                $params[] = $searchParam;
                $params[] = $searchParam;
                $params[] = $searchParam;
                $params[] = $searchParam;
                $types .= "ssss";
            }
            if($purok) {
                $sql .= " AND purok = ?";
                $countSql .= " AND purok = ?";
                $params[] = $purok;
                $types .= "s";
            }
            if($gender) {
                $sql .= " AND gender = ?";
                $countSql .= " AND gender = ?";
                $params[] = $gender;
                $types .= "s";
            }
            if($status) {
                $sql .= " AND resident_status = ?";
                $countSql .= " AND resident_status = ?";
                $params[] = $status;
                $types .= "s";
            }
            if($voterStatus) {
                $sql .= " AND voter_status = ?";
                $countSql .= " AND voter_status = ?";
                $params[] = $voterStatus;
                $types .= "s";
            }
            
            // Get total count
            $totalResult = executeQuery($countSql, $params, $types);
            if ($totalResult !== false) {
                $totalRow = $totalResult->fetch();
                $total = (int) ($totalRow['total'] ?? 0);
            } else {
                $total = 0;
            }
            
            // Get paginated results — inline integers for ODBC compatibility
            $sql .= " ORDER BY last_name ASC OFFSET " . $offset . " ROWS FETCH NEXT " . $limit . " ROWS ONLY";
            
            $residents = getRecords($sql, $params, $types);
            
            echo json_encode([
                'success' => true,
                'data' => $residents ?: [],
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'totalPages' => $total > 0 ? ceil($total / $limit) : 1
            ]);
        }
        break;
        
    case 'POST':
        // Create new resident
        $data = json_decode(file_get_contents('php://input'), true);
        
        $insertSql = "INSERT INTO residents (
                    resident_id, first_name, middle_name, last_name, suffix, gender, 
                    birth_date, place_of_birth, civil_status, nationality, occupation, voter_status, 
                    resident_status, purok, street_name, house_no, mobile_number, email, 
                    emergency_person, emergency_relation, emergency_contact
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        
        // Generate the ID and insert, retrying with the next sequence number if a
        // concurrent request has already claimed the candidate ID.
        $maxAttempts = 5;
        $resident_id = null;
        $id = false;

        for ($attempt = 0; $attempt < $maxAttempts; $attempt++) {
            $resident_id = generateResidentId($attempt);

            $params = [
                $resident_id,
                $data['first_name'] ?? '',
                $data['middle_name'] ?? '',
                $data['last_name'] ?? '',
                $data['suffix'] ?? '',
                $data['gender'] ?? '',
                $data['birth_date'] ?? '',
                $data['place_of_birth'] ?? '',
                $data['civil_status'] ?? '',
                $data['nationality'] ?? 'Filipino',
                $data['occupation'] ?? '',
                $data['voter_status'] ?? 'Not Registered',
                $data['resident_status'] ?? 'Active',
                $data['purok'] ?? '',
                $data['street_name'] ?? '',
                $data['house_no'] ?? '',
                $data['mobile_number'] ?? '',
                $data['email'] ?? '',
                $data['emergency_person'] ?? '',
                $data['emergency_relation'] ?? '',
                $data['emergency_contact'] ?? ''
            ];

            $id = insertRecord($insertSql, $params, 'sssssssssssssssssssss');
            if ($id) {
                break;
            }
        }

        if (!$id) {
            echo json_encode([
                'success' => false,
                'id' => false,
                'resident_id' => $resident_id,
                'message' => 'Unable to save the resident record. Please try again.',
                'data' => null
            ]);
            break;
        }
        
        // Get the created resident
        $newResident = getRecord("SELECT * FROM residents WHERE id = ?", [$id], 'i');
        
        echo json_encode([
            'success' => true,
            'id' => $id,
            'resident_id' => $resident_id,
            'data' => $newResident
        ]);
        break;
        
    case 'PUT':
        // Update resident
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (!isset($data['id'])) {
            echo json_encode(['success' => false, 'message' => 'ID is required']);
            break;
        }
        
        $sql = "UPDATE residents SET 
                    first_name = ?, middle_name = ?, last_name = ?, suffix = ?, gender = ?, 
                    birth_date = ?, place_of_birth = ?, civil_status = ?, nationality = ?, occupation = ?, 
                    voter_status = ?, resident_status = ?, purok = ?, street_name = ?, 
                    house_no = ?, mobile_number = ?, email = ?, emergency_person = ?, 
                    emergency_relation = ?, emergency_contact = ? 
                WHERE id = ?";
        
        $params = [
            $data['first_name'] ?? '',
            $data['middle_name'] ?? '',
            $data['last_name'] ?? '',
            $data['suffix'] ?? '',
            $data['gender'] ?? '',
            $data['birth_date'] ?? '',
            $data['place_of_birth'] ?? '',
            $data['civil_status'] ?? '',
            $data['nationality'] ?? 'Filipino',
            $data['occupation'] ?? '',
            $data['voter_status'] ?? 'Not Registered',
            $data['resident_status'] ?? 'Active',
            $data['purok'] ?? '',
            $data['street_name'] ?? '',
            $data['house_no'] ?? '',
            $data['mobile_number'] ?? '',
            $data['email'] ?? '',
            $data['emergency_person'] ?? '',
            $data['emergency_relation'] ?? '',
            $data['emergency_contact'] ?? '',
            $data['id']
        ];
        
        $affected = executeStatement($sql, $params, 'sssssssssssssssssssssi');
        
        echo json_encode([
            'success' => $affected !== false,
            'affected' => $affected,
            'message' => $affected !== false ? 'Resident updated successfully' : 'Update failed'
        ]);
        break;
        
    case 'DELETE':
        // Archive resident (soft delete - move to archived_residents table)
        $id = isset($_GET['id']) ? $_GET['id'] : null;
        
        if (!$id) {
            echo json_encode(['success' => false, 'message' => 'ID is required']);
            break;
        }
        
        // First, get the resident data
        $resident = getRecord("SELECT * FROM residents WHERE id = ?", [$id], 'i');
        
        if($resident) {
            // Insert into archived_residents
            $insertSql = "INSERT INTO archived_residents SELECT * FROM residents WHERE id = ?";
            $inserted = insertRecord($insertSql, [$id], 'i');
            
            // Delete from residents
            $deleteSql = "DELETE FROM residents WHERE id = ?";
            $deleted = executeStatement($deleteSql, [$id], 'i');
            
            echo json_encode([
                'success' => $deleted !== false,
                'message' => $deleted !== false ? 'Resident archived successfully' : 'Archive failed'
            ]);
        } else {
            echo json_encode([
                'success' => false,
                'message' => 'Resident not found'
            ]);
        }
        break;
        
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid request method']);
        break;
}
?>