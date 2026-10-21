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

/**
 * Directory that holds resident photos, relative to the application root.
 */
function residentPhotoDirectory() {
    return __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'residents';
}

/**
 * Persist a base64-encoded photo (data URL) and return the stored reference.
 *
 * The residents table keeps a path in profile_image rather than binary data, so
 * the image is written to the uploads directory and the relative path is stored.
 *
 * @param string $dataUrl
 * @return string|null Relative path on success, null when nothing usable was sent.
 */
function storeResidentPhoto($dataUrl) {
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

    $directory = residentPhotoDirectory();
    if (!is_dir($directory) && !mkdir($directory, 0777, true) && !is_dir($directory)) {
        error_log('Unable to create resident photo directory: ' . $directory);
        return null;
    }

    $fileName = 'resident-' . uniqid() . '.' . $extension;
    $fullPath = $directory . DIRECTORY_SEPARATOR . $fileName;

    if (file_put_contents($fullPath, $binary) === false) {
        error_log('Unable to write resident photo: ' . $fullPath);
        return null;
    }

    // Stored as a web-relative path so it can be used directly in an img src.
    return 'uploads/residents/' . $fileName;
}

/**
 * Age in whole years for a birth date, or null when the date is unusable.
 *
 * Mirrors calculateAgeFromBirthDate() in the UI so the stored value and the
 * value shown on the page can never disagree.
 *
 * @param string $birthDate
 * @return int|null
 */
function residentAgeFromBirthDate($birthDate) {
    if (!is_string($birthDate) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $birthDate, $matches)) {
        return null;
    }

    $birthYear = (int) $matches[1];
    $birthMonth = (int) $matches[2];
    $birthDay = (int) $matches[3];

    if (!checkdate($birthMonth, $birthDay, $birthYear)) {
        return null;
    }

    $age = (int) date('Y') - $birthYear;
    if ((int) date('n') < $birthMonth || ((int) date('n') === $birthMonth && (int) date('j') < $birthDay)) {
        $age--;
    }

    return $age < 0 ? null : $age;
}

/**
 * Recompute the age column from the birth date.
 *
 * Age is stored on write, but it drifts as the resident gets older. Deriving it
 * again on read means a stale stored value can never be returned to the UI.
 *
 * @param array $resident
 * @return array
 */
function withDerivedResidentAge(array $resident) {
    $derived = residentAgeFromBirthDate($resident['birth_date'] ?? '');
    if ($derived !== null) {
        $resident['age'] = $derived;
    }
    return $resident;
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
                foreach ($allResidents as $r) {
                    $age = residentAgeFromBirthDate($r['birth_date']);
                    if ($age !== null) {
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
                echo json_encode(withDerivedResidentAge($resident));
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
            $residents = array_map('withDerivedResidentAge', $residents ?: []);
            
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
        if (!is_array($data)) {
            $data = [];
        }

        // Server-side validation of the phone fields. The frontend already
        // restricts these, but the API must not rely on that alone.
        $mobileNumber = isset($data['mobile_number']) ? preg_replace('/\D/', '', (string) $data['mobile_number']) : '';
        $emergencyContact = isset($data['emergency_contact']) ? preg_replace('/\D/', '', (string) $data['emergency_contact']) : '';

        if (!preg_match('/^\d{11}$/', $mobileNumber)) {
            echo json_encode([
                'success' => false,
                'message' => 'Mobile Number must be exactly 11 digits.',
                'data' => null
            ]);
            break;
        }

        if ($emergencyContact !== '' && !preg_match('/^\d{11}$/', $emergencyContact)) {
            echo json_encode([
                'success' => false,
                'message' => 'Emergency Contact Number must be exactly 11 digits when provided.',
                'data' => null
            ]);
            break;
        }

        // The photo is written to disk only after the row exists, so a failed
        // insert can never leave an unreferenced file behind.
        $photoPayload = isset($data['photo_base64']) ? $data['photo_base64'] : '';

        $insertSql = "INSERT INTO residents (
                    resident_id, first_name, middle_name, last_name, suffix, gender, 
                    birth_date, place_of_birth, civil_status, nationality, occupation, voter_status, 
                    resident_status, purok, street_name, house_no, mobile_number, email, 
                    emergency_person, emergency_relation, emergency_contact, age
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        
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
                $mobileNumber,
                $data['email'] ?? '',
                $data['emergency_person'] ?? '',
                $data['emergency_relation'] ?? '',
                $emergencyContact,
                // Age is derived from the birth date on both create and update so
                // the client cannot store a value that disagrees with it.
                residentAgeFromBirthDate($data['birth_date'] ?? '')
            ];

            // 21 strings, then the integer age.
            $id = insertRecord($insertSql, $params, 'sssssssssssssssssssssi');
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
        
        // Now that the row exists, persist the optional photo and link it to the
        // record. A photo that fails validation is skipped rather than failing the
        // request: the photo is optional and the resident is already stored.
        if (is_string($photoPayload) && $photoPayload !== '') {
            $profileImage = storeResidentPhoto($photoPayload);
            if ($profileImage !== null) {
                executeStatement(
                    "UPDATE residents SET profile_image = ? WHERE id = ?",
                    [$profileImage, $id],
                    'si'
                );
            }
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
        if (!is_array($data)) {
            $data = [];
        }

        if (!isset($data['id'])) {
            echo json_encode(['success' => false, 'message' => 'ID is required']);
            break;
        }

        // Server-side validation of the phone fields. The frontend already
        // restricts these, but the API must not rely on that alone.
        $mobileNumber = isset($data['mobile_number']) ? preg_replace('/\D/', '', (string) $data['mobile_number']) : '';
        $emergencyContact = isset($data['emergency_contact']) ? preg_replace('/\D/', '', (string) $data['emergency_contact']) : '';

        if (!preg_match('/^\d{11}$/', $mobileNumber)) {
            echo json_encode([
                'success' => false,
                'message' => 'Mobile Number must be exactly 11 digits.',
                'data' => null
            ]);
            break;
        }

        if ($emergencyContact !== '' && !preg_match('/^\d{11}$/', $emergencyContact)) {
            echo json_encode([
                'success' => false,
                'message' => 'Emergency Contact Number must be exactly 11 digits when provided.',
                'data' => null
            ]);
            break;
        }

        // Age follows the birth date, so it is recomputed here rather than
        // trusted from the client. Mirrors calculateAgeFromBirthDate() in the UI.
        $birthDate = isset($data['birth_date']) ? (string) $data['birth_date'] : '';
        $age = residentAgeFromBirthDate($birthDate);

        // The photo is written to disk only after the row has been successfully
        // updated; an empty payload means "leave the current photo alone".
        $photoPayload = isset($data['photo_base64']) ? $data['photo_base64'] : '';

        $sql = "UPDATE residents SET
                    first_name = ?, middle_name = ?, last_name = ?, suffix = ?, gender = ?,
                    birth_date = ?, place_of_birth = ?, civil_status = ?, nationality = ?, occupation = ?,
                    voter_status = ?, resident_status = ?, purok = ?, street_name = ?,
                    house_no = ?, mobile_number = ?, email = ?, emergency_person = ?,
                    emergency_relation = ?, emergency_contact = ?, age = ?";

        $params = [
            $data['first_name'] ?? '',
            $data['middle_name'] ?? '',
            $data['last_name'] ?? '',
            $data['suffix'] ?? '',
            $data['gender'] ?? '',
            $birthDate,
            $data['place_of_birth'] ?? '',
            $data['civil_status'] ?? '',
            $data['nationality'] ?? 'Filipino',
            $data['occupation'] ?? '',
            $data['voter_status'] ?? 'Not Registered',
            $data['resident_status'] ?? 'Active',
            $data['purok'] ?? '',
            $data['street_name'] ?? '',
            $data['house_no'] ?? '',
            $mobileNumber,
            $data['email'] ?? '',
            $data['emergency_person'] ?? '',
            $data['emergency_relation'] ?? '',
            $emergencyContact,
            $age
        ];

        $sql .= " WHERE id = ?";
        $params[] = $data['id'];

        $affected = executeStatement($sql, $params, 'sssssssssssssssssssssi');

        // Persist the newly chosen photo only now that the update succeeded. The
        // guard is `$affected !== false` rather than `> 0`: PDO_ODBC reports 0 rows
        // when the new values are identical to the old ones.
        if ($affected !== false && is_string($photoPayload) && $photoPayload !== '') {
            $profileImage = storeResidentPhoto($photoPayload);
            if ($profileImage !== null) {
                executeStatement(
                    "UPDATE residents SET profile_image = ? WHERE id = ?",
                    [$profileImage, $data['id']],
                    'si'
                );
            }
        }

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