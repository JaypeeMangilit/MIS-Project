<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../config/functions.php';
require_once __DIR__ . '/../config/app_session.php';

requireLogin();

$method = $_SERVER['REQUEST_METHOD'];

switch($method) {
    case 'GET':
        if(isset($_GET['id'])) {
            $sql = "SELECT id, user_id, first_name, middle_name, last_name, suffix, username, email, 
                    mobile_number, role, status, last_login, created_at FROM system_users WHERE id = ?";
            $user = getRecord($sql, [$_GET['id']], 'i');
            echo json_encode($user);
        } else {
            $role = isset($_GET['role']) ? $_GET['role'] : '';
            $status = isset($_GET['status']) ? $_GET['status'] : '';
            $search = isset($_GET['search']) ? $_GET['search'] : '';
            
            $sql = "SELECT id, user_id, first_name, middle_name, last_name, username, email, 
                    mobile_number, role, status, last_login, created_at FROM system_users WHERE 1=1";
            $params = [];
            $types = "";
            
            if($role) {
                $sql .= " AND role = ?";
                $params[] = $role;
                $types .= "s";
            }
            if($status) {
                $sql .= " AND status = ?";
                $params[] = $status;
                $types .= "s";
            }
            if($search) {
                $sql .= " AND (first_name LIKE ? OR last_name LIKE ? OR username LIKE ? OR email LIKE ?)";
                $searchParam = "%$search%";
                $params[] = $searchParam;
                $params[] = $searchParam;
                $params[] = $searchParam;
                $params[] = $searchParam;
                $types .= "ssss";
            }
            
            $sql .= " ORDER BY created_at DESC";
            $users = getRecords($sql, $params, $types);
            echo json_encode($users);
        }
        break;
        
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        
        // Generate user ID
        $sql = "SELECT COUNT(*) as count FROM system_users";
        $result = executeQuery($sql);
        $row = $result !== false ? $result->fetch() : null;
        $count = (int) (($row['count'] ?? 0) + 1);
        $user_id = "USR-" . str_pad($count, 4, '0', STR_PAD_LEFT);
        
        // Store the password as typed (see store_password() in config/functions.php).
        $storedPassword = store_password($data['password']);
        
        $sql = "INSERT INTO system_users (user_id, first_name, middle_name, last_name, suffix, username, 
                password, email, mobile_number, role, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        
        $params = [
            $user_id,
            $data['first_name'],
            $data['middle_name'] ?? '',
            $data['last_name'],
            $data['suffix'] ?? '',
            $data['username'],
            $storedPassword,
            $data['email'],
            $data['mobile_number'] ?? '',
            $data['role'] ?? 'Encoder',
            $data['status'] ?? 'Active'
        ];
        
        $id = insertRecord($sql, $params, 'sssssssssss');
        echo json_encode(['success' => true, 'id' => $id, 'user_id' => $user_id]);
        break;
        
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        
        if(isset($data['password']) && !empty($data['password'])) {
            $storedPassword = store_password($data['password']);
            $sql = "UPDATE system_users SET first_name=?, middle_name=?, last_name=?, suffix=?, 
                    username=?, password=?, email=?, mobile_number=?, role=?, status=? WHERE id=?";
            $params = [
                $data['first_name'],
                $data['middle_name'] ?? '',
                $data['last_name'],
                $data['suffix'] ?? '',
                $data['username'],
                $storedPassword,
                $data['email'],
                $data['mobile_number'] ?? '',
                $data['role'],
                $data['status'],
                $data['id']
            ];
            $affected = executeStatement($sql, $params, 'ssssssssssi');
        } else {
            $sql = "UPDATE system_users SET first_name=?, middle_name=?, last_name=?, suffix=?, 
                    username=?, email=?, mobile_number=?, role=?, status=? WHERE id=?";
            $params = [
                $data['first_name'],
                $data['middle_name'] ?? '',
                $data['last_name'],
                $data['suffix'] ?? '',
                $data['username'],
                $data['email'],
                $data['mobile_number'] ?? '',
                $data['role'],
                $data['status'],
                $data['id']
            ];
            $affected = executeStatement($sql, $params, 'sssssssssi');
        }
        
        echo json_encode(['success' => true, 'affected' => $affected]);
        break;
        
    case 'DELETE':
        $id = $_GET['id'];
        $sql = "DELETE FROM system_users WHERE id = ?";
        executeStatement($sql, [$id], 'i');
        echo json_encode(['success' => true]);
        break;
}
?>