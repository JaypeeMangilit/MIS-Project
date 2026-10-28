<?php
/**
 * mapping.php (API) - Per-zone demographics for the spot map sidebar.
 *
 * GET ?zone=<name>
 *   -> 200 { success: true,  data: { zone, residents, households, seniors, minors, voters } }
 *   -> 400 { success: false, message: 'A zone name is required (?zone=...).' }
 *   -> 401 { success: false, message: 'Session expired. Please sign in again.' }
 *   -> 405 { success: false, message: 'Method not allowed' }
 *
 * A zone with no residents is not an error: every count is simply 0.
 */

require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../config/app_session.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

requireLogin();

$zone = trim((string) ($_GET['zone'] ?? ''));

if ($zone === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'A zone name is required (?zone=...).']);
    exit;
}

// A zone is a street. The map's "M. Gregorio" is stored as "M. Gregorio St." in
// residents.street_name, so a prefix match accepts either form. The LIKE wildcards
// are escaped so a zone name can never inject a pattern; the value itself still
// travels as a bound parameter.
$like = str_replace(['\\', '%', '_', '['], ['\\\\', '\%', '\_', '\['], $zone) . '%';

// Age comes from birth_date, not the residents.age column: age is NULL for most
// rows because it is only written on save and then drifts. This is the same
// whole-years calculation as residentAgeFromBirthDate() in api/residents.php.
$age = "CASE WHEN DATEADD(year, DATEDIFF(year, birth_date, GETDATE()), birth_date) > GETDATE()"
     . " THEN DATEDIFF(year, birth_date, GETDATE()) - 1"
     . " ELSE DATEDIFF(year, birth_date, GETDATE()) END";

// There is no household table and no head-of-household flag, so a household is a
// distinct street + house_no. Counting house_no alone would collapse two families
// on different streets that happen to share a number.
//
// ISNULL around each SUM matters: SUM over zero rows returns NULL, not 0, so an
// empty zone would otherwise return nulls instead of 0.
$sql = "SELECT
            COUNT(*)                    AS residents,
            COUNT(DISTINCT CONCAT(street_name, '|', house_no)) AS households,
            ISNULL(SUM(CASE WHEN ($age) >= 60 THEN 1 ELSE 0 END), 0) AS seniors,
            ISNULL(SUM(CASE WHEN ($age) < 18  THEN 1 ELSE 0 END), 0) AS minors,
            ISNULL(SUM(CASE WHEN voter_status = 'Registered' THEN 1 ELSE 0 END), 0) AS voters
        FROM residents
        WHERE street_name LIKE ? ESCAPE '\\'";

$row = getRecord($sql, [$like], 's');

if ($row === null) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Could not load zone statistics',
        'detail'  => lastDbError() ?: 'No database error was captured.',
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'data'    => [
        'zone'       => $zone,
        'residents'  => (int) $row['residents'],
        'households' => (int) $row['households'],
        'seniors'    => (int) $row['seniors'],
        'minors'     => (int) $row['minors'],
        'voters'     => (int) $row['voters'],
    ],
]);
