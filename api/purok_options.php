<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../config/app_session.php';

requireLogin();

$sql = "SELECT DISTINCT purok FROM residents ORDER BY purok";
$result = executeQuery($sql);

$puroks = [];
if ($result && method_exists($result, 'fetch')) {
    while ($row = $result->fetch()) {
        if (!empty($row['purok'])) {
            $puroks[] = $row['purok'];
        }
    }
}

echo json_encode($puroks);
?>