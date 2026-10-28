<?php
/**
 * inventory.php (API) - Inventory items, stock movements and the borrow log.
 *
 * GET  ?action=stats                                   summary cards
 * GET  ?action=activity                                recent activity feed
 * GET  ?action=borrowlog&search=&status=&category=&page=&limit=
 * GET  ?id=N                                           one item + its movements + borrows
 * GET  ?search=&category=&status=&page=&limit=         item list
 * POST (JSON body)                                     create item
 * POST ?action=transaction (JSON body)                 stock IN / OUT
 * POST ?action=borrow     (JSON body)                  borrow (also writes an OUT row)
 * POST ?action=return     (JSON body)                  return (also writes an IN row)
 * PUT  ?id=N (JSON body)                               update editable fields
 * DELETE ?id=N                                         soft archive
 *
 * Conventions worth knowing before editing:
 *
 * - inventory_items.quantity      = units currently on hand. This is the only
 *                                  number Stock In / Stock Out / Borrow / Return
 *                                  move.
 * - inventory_items.total_quantity = cumulative units ever acquired, rendered by
 *                                  the list as "stock of total".
 * - stock_transactions is a pure movement ledger: transaction_type is constrained
 *                                  by a CHECK to 'IN' | 'OUT'. Borrow metadata
 *                                  (borrower, expected return, actual return)
 *                                  lives in borrow_records, which references the
 *                                  OUT row that issued it.
 * - status is derived from the on-hand quantity, never trusted from the client:
 *                                  0 -> Critical, < 10 -> Low Stock, else Available.
 *                                  'Borrowed' is not derived here; the Borrowed
 *                                  Items panel is driven by open borrow_records.
 */

require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../config/app_session.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'GET' && $method !== 'POST' && $method !== 'PUT' && $method !== 'DELETE') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

requireLogin();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Status implied by the on-hand quantity. Mirrors the thresholds the UI used to
 * apply client-side so a stale stored status can never disagree with the badge.
 */
function inventoryStatus(int $stock)
{
    if ($stock <= 0) {
        return 'Critical';
    }
    if ($stock < 10) {
        return 'Low Stock';
    }
    return 'Available';
}

/**
 * Human-readable age of a timestamp, in the same voice as the old hardcoded
 * strings ("Just now", "2 days ago", "Yesterday").
 */
function inventoryRelativeTime(?string $value)
{
    if (empty($value)) {
        return '—';
    }

    $timestamp = strtotime($value);
    if ($timestamp === false) {
        return '—';
    }

    $diff = time() - $timestamp;

    if ($diff < 60) {
        return 'Just now';
    }
    if ($diff < 3600) {
        $minutes = (int) floor($diff / 60);
        return $minutes . ' minute' . ($minutes === 1 ? '' : 's') . ' ago';
    }
    if ($diff < 86400) {
        $hours = (int) floor($diff / 3600);
        return $hours . ' hour' . ($hours === 1 ? '' : 's') . ' ago';
    }
    if ($diff < 172800) {
        return 'Yesterday';
    }
    if ($diff < 604800) {
        $days = (int) floor($diff / 86400);
        return $days . ' day' . ($days === 1 ? '' : 's') . ' ago';
    }

    return date('M j, Y', $timestamp);
}

/**
 * Map a database row onto the shape the frontend renders.
 *
 * @param array $row
 * @return array
 */
function shapeInventoryItem($row)
{
    $stock  = (int) ($row['quantity'] ?? 0);
    $total  = (int) ($row['total_quantity'] ?? 0);

    return [
        'id'              => (int) $row['id'],
        'itemCode'        => 'INV-' . str_pad((string) $row['id'], 4, '0', STR_PAD_LEFT),
        'name'            => (string) ($row['item_name'] ?? ''),
        'category'        => (string) ($row['category'] ?? ''),
        'brandModel'      => (string) ($row['brand_model'] ?? ''),
        'serialNumber'    => (string) ($row['serial_number'] ?? ''),
        'stock'           => $stock,
        'total'           => $total,
        'unit'            => (string) ($row['unit'] ?? ''),
        'status'          => inventoryStatus($stock),
        'location'        => (string) ($row['location'] ?? ''),
        'assignedOfficer' => (string) ($row['assigned_officer'] ?? ''),
        'supplier'        => (string) ($row['supplier'] ?? ''),
        'condition'       => (string) ($row['condition'] ?? ''),
        // 1 = consumable (used up, not expected back), 0 = non-consumable.
        // NULL on legacy rows is treated as non-consumable, the safe default
        // since durable assets are the ones a return is actually chased for.
        'consumable'      => (int) ($row['consumable'] ?? 0) === 1,
        'consumableLabel' => (int) ($row['consumable'] ?? 0) === 1 ? 'Consumable' : 'Non-consumable',
        'dateAcquired'    => $row['date_acquired'] ?: null,
        'notes'           => (string) ($row['notes'] ?? ''),
        'lastUpdated'     => inventoryRelativeTime($row['updated_at'] ?? ($row['created_at'] ?? null)),
        'updatedAt'       => $row['updated_at'] ?? null,
        'openBorrowQuantity' => (int) ($row['open_borrow_quantity'] ?? 0),
    ];
}

/**
 * Borrow lifecycle state. A record with a return date is Returned; one whose
 * expected date has passed without a return is Overdue; otherwise Borrowed.
 */
function borrowStatus(array $row)
{
    if (!empty($row['date_returned'])) {
        return 'Returned';
    }

    if (!empty($row['expected_return_date']) && strtotime($row['expected_return_date']) < strtotime(date('Y-m-d'))) {
        return 'Overdue';
    }

    return 'Borrowed';
}

/**
 * Map a borrow_records row onto the shape the Borrow Log table renders.
 *
 * @param array $row
 * @return array
 */
function shapeBorrowRecord($row)
{
    return [
        'id'             => (int) $row['id'],
        'logId'          => 'LOG-' . date('Y', strtotime($row['date_borrowed'] ?: 'now')) . '-' . str_pad((string) $row['id'], 3, '0', STR_PAD_LEFT),
        'itemId'         => (int) ($row['item_id'] ?? 0),
        'itemName'       => (string) ($row['item_name'] ?? ''),
        'category'       => (string) ($row['category'] ?? ''),
        'quantity'       => (int) ($row['quantity'] ?? 0),
        'unit'           => (string) ($row['unit'] ?? ''),
        'borrower'       => (string) ($row['borrower_name'] ?? ''),
        'borrowerType'   => (string) ($row['borrower_type'] ?? ''),
        'borrowerContact'=> (string) ($row['borrower_contact'] ?? ''),
        'dateBorrowed'   => $row['date_borrowed'] ?: null,
        'expectedReturn' => $row['expected_return_date'] ?: null,
        'dateReturned'   => $row['date_returned'] ?: null,
        'status'         => borrowStatus($row),
        // Surfaced so the Borrow Log can show whether an item is used up or
        // expected back; a consumable should not be chased for a return.
        'consumable'     => (int) ($row['consumable'] ?? 0) === 1,
        'consumableLabel'=> (int) ($row['consumable'] ?? 0) === 1 ? 'Consumable' : 'Non-consumable',
        'purpose'        => (string) ($row['purpose'] ?? ''),
        'remarks'        => (string) ($row['remarks'] ?? ''),
    ];
}

/** Decode a JSON request body, or null when it is absent/invalid. */
function inventoryRequestBody()
{
    $raw = file_get_contents('php://input');

    if ($raw === false || trim($raw) === '') {
        return null;
    }

    $data = json_decode($raw, true);

    return is_array($data) ? $data : null;
}

/** Uniform failure response. */
function inventoryFail(int $status, string $message, $detail = null)
{
    http_response_code($status);
    echo json_encode(array_filter([
        'success' => false,
        'message' => $message,
        'detail'  => $detail,
    ], function ($value) {
        return $value !== null;
    }));
    exit;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

if ($method === 'GET') {
    $action = $_GET['action'] ?? '';

    // --- Summary cards ------------------------------------------------------
    if ($action === 'stats') {
        // Total units held, units on hand in healthy items, units currently out
        // on borrow, and the count of items needing attention.
        $row = getRecord(
            "SELECT
                 ISNULL(SUM(i.total_quantity), 0) AS totalItems,
                 ISNULL(SUM(CASE WHEN i.quantity >= 10 THEN i.quantity ELSE 0 END), 0) AS availableStock,
                 ISNULL((SELECT SUM(br.quantity) FROM borrow_records br
                          WHERE br.date_returned IS NULL), 0) AS borrowedItems,
                 ISNULL(SUM(CASE WHEN i.quantity < 10 THEN 1 ELSE 0 END), 0) AS lowStockAlerts
             FROM inventory_items i
             WHERE i.archived IS NULL OR i.archived = 0"
        );

        if ($row === null) {
            inventoryFail(500, 'Could not load inventory statistics', lastDbError());
        }

        echo json_encode([
            'success' => true,
            'data'    => [
                'totalItems'      => (int) $row['totalItems'],
                'availableStock'  => (int) $row['availableStock'],
                'borrowedItems'   => (int) $row['borrowedItems'],
                'lowStockAlerts'  => (int) $row['lowStockAlerts'],
            ],
        ]);
        exit;
    }

    // --- Recent activity feed ----------------------------------------------
    if ($action === 'activity') {
        $rows = getRecords(
            "SELECT TOP 10
                 st.transaction_type AS type,
                 st.quantity,
                 st.source_or_recipient,
                 st.purpose,
                 st.transaction_date,
                 st.performed_by,
                 i.item_name,
                 i.unit,
                 br.id AS borrow_id,
                 st.created_at
             FROM stock_transactions st
             INNER JOIN inventory_items i ON i.id = st.item_id
             LEFT JOIN borrow_records br ON br.transaction_id = st.id
             ORDER BY st.transaction_date DESC, st.id DESC"
        );

        $activities = [];
        foreach (($rows ?: []) as $row) {
            $quantity = (int) $row['quantity'];
            $unit     = (string) $row['unit'];
            $item     = (string) $row['item_name'];
            $party    = (string) ($row['source_or_recipient'] ?? '');
            $purpose  = (string) ($row['purpose'] ?? '');

            if ($row['type'] === 'OUT' && !empty($row['borrow_id'])) {
                $title = $quantity . ' ' . $unit . ' of ' . $item . ' borrowed by ' . ($party ?: 'unknown');
                $user  = 'Purpose: ' . ($purpose !== '' ? $purpose : 'Not specified');
            } elseif ($row['type'] === 'IN' && !empty($row['borrow_id'])) {
                $title = $quantity . ' ' . $unit . ' of ' . $item . ' returned by ' . ($party ?: 'unknown');
                $user  = 'Returned to inventory';
            } elseif ($row['type'] === 'IN') {
                $title = $quantity . ' ' . $unit . ' of ' . $item . ' added to stock';
                $user  = 'Received from ' . ($party !== '' ? $party : 'unknown source');
            } else {
                $title = $quantity . ' ' . $unit . ' of ' . $item . ' released';
                $user  = 'Released to ' . ($party !== '' ? $party : 'unknown');
                if ($purpose !== '') {
                    $user .= ' for ' . $purpose;
                }
            }

            $activities[] = [
                'title' => $title,
                'user'  => $user,
                'time'  => inventoryRelativeTime($row['created_at'] ?? ($row['transaction_date'] ?? null)),
            ];
        }

        echo json_encode(['success' => true, 'data' => $activities]);
        exit;
    }

    // --- Borrow log ---------------------------------------------------------
    if ($action === 'borrowlog') {
        $search   = trim((string) ($_GET['search'] ?? ''));
        $status   = (string) ($_GET['status'] ?? '');
        $category = (string) ($_GET['category'] ?? '');
        $page     = max(1, (int) ($_GET['page'] ?? 1));
        $limit    = max(1, (int) ($_GET['limit'] ?? 5));
        $offset   = ($page - 1) * $limit;

        // The status filter is derived, not stored, so it has to be applied after
        // shaping. Fetch a generous window and filter in PHP, then paginate.
        $rows = getRecords(
            "SELECT br.id, br.item_id, br.quantity, br.borrower_name, br.borrower_type,
                    br.borrower_contact, br.date_borrowed, br.expected_return_date,
                    br.date_returned, br.purpose, br.remarks,
                    i.item_name, i.category, i.unit, i.consumable
             FROM borrow_records br
             INNER JOIN inventory_items i ON i.id = br.item_id
             WHERE 1=1"
            . ($category !== '' ? " AND i.category = '" . str_replace("'", "''", $category) . "'" : '')
            . " ORDER BY br.date_borrowed DESC, br.id DESC"
        );

        $records = [];
        foreach (($rows ?: []) as $row) {
            $shaped = shapeBorrowRecord($row);

            if ($search !== '') {
                $haystack = strtolower($shaped['logId'] . ' ' . $shaped['itemName'] . ' ' . $shaped['borrower']);
                if (strpos($haystack, strtolower($search)) === false) {
                    continue;
                }
            }

            if ($status !== '' && $shaped['status'] !== $status) {
                continue;
            }

            $records[] = $shaped;
        }

        $total      = count($records);
        $totalPages = max(1, (int) ceil($total / $limit));
        $page       = min($page, $totalPages);

        echo json_encode([
            'success' => true,
            'data'    => array_slice($records, ($page - 1) * $limit, $limit),
            'total'   => $total,
            'page'    => $page,
            'limit'   => $limit,
            'totalPages' => $totalPages,
        ]);
        exit;
    }

    // --- Single item --------------------------------------------------------
    if (isset($_GET['id'])) {
        $id = (int) $_GET['id'];

        $row = getRecord(
            "SELECT i.*,
                    (SELECT ISNULL(SUM(br.quantity), 0)
                       FROM borrow_records br
                      WHERE br.item_id = i.id AND br.date_returned IS NULL) AS open_borrow_quantity
             FROM inventory_items i
             WHERE i.id = ? AND (i.archived IS NULL OR i.archived = 0)",
            [$id],
            'i'
        );

        if (!$row) {
            inventoryFail(404, 'Item not found');
        }

        $movements = getRecords(
            "SELECT st.transaction_type AS type, st.quantity, st.source_or_recipient,
                    st.purpose, st.transaction_date, st.performed_by, st.remarks,
                    st.created_at
             FROM stock_transactions st
             WHERE st.item_id = ?
             ORDER BY st.transaction_date DESC, st.id DESC",
            [$id],
            'i'
        );

        $transactions = [];
        foreach (($movements ?: []) as $movement) {
            $transactions[] = [
                'type'     => (string) $movement['type'],
                'quantity' => (int) $movement['quantity'],
                'party'    => (string) ($movement['source_or_recipient'] ?? ''),
                'purpose'  => (string) ($movement['purpose'] ?? ''),
                'date'     => $movement['transaction_date'] ?: null,
                'by'       => (string) ($movement['performed_by'] ?? ''),
                'remarks'  => (string) ($movement['remarks'] ?? ''),
            ];
        }

        $borrows = getRecords(
            "SELECT br.*, i.item_name, i.category, i.unit
             FROM borrow_records br
             INNER JOIN inventory_items i ON i.id = br.item_id
             WHERE br.item_id = ?
             ORDER BY br.date_borrowed DESC, br.id DESC",
            [$id],
            'i'
        );

        echo json_encode([
            'success' => true,
            'data'    => [
                'item'         => shapeInventoryItem($row),
                'transactions' => $transactions,
                'borrows'      => array_map('shapeBorrowRecord', $borrows ?: []),
            ],
        ]);
        exit;
    }

    // --- Item list ----------------------------------------------------------
    $search   = strtolower(trim((string) ($_GET['search'] ?? '')));
    $category = (string) ($_GET['category'] ?? '');
    $status   = (string) ($_GET['status'] ?? '');
    $page     = max(1, (int) ($_GET['page'] ?? 1));
    $limit    = max(1, (int) ($_GET['limit'] ?? 50));

    // Units currently out on loan, per item. The Borrowed Items panel filters on
    // this because status is derived from the on-hand quantity and is therefore
    // never 'Borrowed'.
    $rows = getRecords(
        "SELECT i.*,
                (SELECT ISNULL(SUM(br.quantity), 0)
                   FROM borrow_records br
                  WHERE br.item_id = i.id AND br.date_returned IS NULL) AS open_borrow_quantity
         FROM inventory_items i
         WHERE (i.archived IS NULL OR i.archived = 0)
         ORDER BY i.updated_at DESC, i.id DESC"
    );

    $items = [];
    foreach (($rows ?: []) as $row) {
        $item = shapeInventoryItem($row);

        if ($search !== '' && strpos(strtolower($item['name'] . ' ' . $item['category']), $search) === false) {
            continue;
        }
        if ($category !== '' && $item['category'] !== $category) {
            continue;
        }
        if ($status !== '' && $item['status'] !== $status) {
            continue;
        }

        $items[] = $item;
    }

    echo json_encode([
        'success' => true,
        'data'    => $items,
        'total'   => count($items),
    ]);
    exit;
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

if ($method === 'POST') {
    $action = $_GET['action'] ?? '';
    $data   = inventoryRequestBody();

    if ($data === null) {
        inventoryFail(400, 'Invalid request body');
    }

    // --- Create item --------------------------------------------------------
    if ($action === '') {
        $name     = trim((string) ($data['itemName'] ?? ''));
        $category = trim((string) ($data['category'] ?? ''));
        $unit     = trim((string) ($data['unit'] ?? ''));

        if ($name === '' || $category === '' || $unit === '') {
            inventoryFail(400, 'Item name, category and unit are required');
        }

        $quantity = max(0, (int) ($data['quantity'] ?? 0));
        $stock    = inventoryStatus($quantity);

        $now = date('Y-m-d H:i:s');

        // item_code carries an undocumented UNIQUE constraint, so inserting NULL
        // would allow exactly one item in the entire table: the second insert
        // fails with "Violation of UNIQUE KEY constraint ... duplicate key value
        // (<NULL>)". Reserve a unique placeholder, read back the identity, then
        // stamp the real INV-000n code.
        $placeholder = 'TMP-' . strtoupper(bin2hex(random_bytes(8)));

        // The form sends the UI label ('Consumable' / 'Non-consumable'); accept
        // a raw 0/1 as well so the API is not tied to the wording.
        $consumableRaw = $data['consumable'] ?? 0;
        $consumable    = ($consumableRaw === 'Consumable' || $consumableRaw === 1 || $consumableRaw === '1') ? 1 : 0;

        $id = insertRecord(
            "INSERT INTO inventory_items
                (item_code, item_name, category, brand_model, serial_number, quantity, unit, status,
                 location, assigned_officer, date_acquired, notes, supplier, condition, consumable,
                 total_quantity, archived, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
            [
                $placeholder,
                $name,
                $category,
                (string) ($data['brandModel'] ?? ''),
                (string) ($data['serialNumber'] ?? ''),
                $quantity,
                $unit,
                $stock,
                (string) ($data['location'] ?? ''),
                (string) ($data['assignedOfficer'] ?? ''),
                to_db_date($data['dateAcquired'] ?? null),
                (string) ($data['notes'] ?? ''),
                (string) ($data['supplier'] ?? ''),
                (string) ($data['condition'] ?? ''),
                $consumable,
                $quantity,
                $now,
                $now,
            ],
            'sssssssssssssssss'
        );

        if (!$id) {
            inventoryFail(500, 'Failed to save item', lastDbError());
        }

        // Replace the placeholder with the real code. Ids are unique, so the
        // derived code is unique too.
        executeStatement(
            "UPDATE inventory_items SET item_code = ? WHERE id = ?",
            ['INV-' . str_pad((string) $id, 4, '0', STR_PAD_LEFT), $id],
            'si'
        );

        // The starting quantity is itself an acquisition, so record it: the item's
        // transaction history and the activity feed start from something real.
        if ($quantity > 0) {
            executeStatement(
                "INSERT INTO stock_transactions
                    (item_id, transaction_type, quantity, source_or_recipient, purpose,
                     transaction_date, performed_by, remarks, created_at)
                 VALUES (?, 'IN', ?, ?, NULL, ?, ?, ?, ?)",
                [
                    $id,
                    $quantity,
                    (string) ($data['supplier'] ?? ''),
                    date('Y-m-d'),
                    (string) ($data['assignedOfficer'] ?? ''),
                    'Initial stock on registration',
                    $now,
                ],
                'iissssss'
            );
        }

        $row = getRecord("SELECT * FROM inventory_items WHERE id = ?", [$id], 'i');

        echo json_encode([
            'success' => true,
            'message' => 'Item added successfully',
            'data'    => shapeInventoryItem($row),
        ]);
        exit;
    }

    // --- Stock IN / OUT -----------------------------------------------------
    if ($action === 'transaction') {
        $itemId   = (int) ($data['itemId'] ?? 0);
        $quantity = (int) ($data['quantity'] ?? 0);
        $direction = (string) ($data['direction'] ?? '');

        if ($itemId <= 0 || $quantity <= 0) {
            inventoryFail(400, 'A valid item and a positive quantity are required');
        }
        if ($direction !== 'in' && $direction !== 'out') {
            inventoryFail(400, "Direction must be 'in' or 'out'");
        }

        $item = getRecord(
            "SELECT * FROM inventory_items WHERE id = ? AND (archived IS NULL OR archived = 0)",
            [$itemId],
            'i'
        );

        if (!$item) {
            inventoryFail(404, 'Item not found');
        }

        $onHand = (int) ($item['quantity'] ?? 0);
        $total  = (int) ($item['total_quantity'] ?? 0);
        $party  = (string) ($data['source'] ?? ($data['recipient'] ?? ''));
        $purpose = (string) ($data['purpose'] ?? '');

        if ($direction === 'in') {
            $newStock = $onHand + $quantity;
            $newTotal = $total + $quantity;
        } else {
            if ($quantity > $onHand) {
                inventoryFail(409, 'Insufficient stock. Only ' . $onHand . ' ' . $item['unit'] . ' available.');
            }
            $newStock = $onHand - $quantity;
            $newTotal = $total; // stock out does not change cumulative acquisitions
        }

        $now = date('Y-m-d H:i:s');

        $updated = executeStatement(
            "UPDATE inventory_items
                SET quantity = ?, total_quantity = ?, status = ?, updated_at = ?
              WHERE id = ?",
            [$newStock, $newTotal, inventoryStatus($newStock), $now, $itemId],
            'iissi'
        );

        if ($updated === false) {
            inventoryFail(500, 'Failed to update stock', lastDbError());
        }

        executeStatement(
            "INSERT INTO stock_transactions
                (item_id, transaction_type, quantity, source_or_recipient, purpose,
                 transaction_date, performed_by, remarks, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $itemId,
                $direction === 'in' ? 'IN' : 'OUT',
                $quantity,
                $party,
                $purpose,
                to_db_date($data['transactionDate'] ?? null) ?: date('Y-m-d'),
                (string) ($data['performedBy'] ?? ''),
                (string) ($data['remarks'] ?? ''),
                $now,
            ],
            'iisssssss'
        );

        $row = getRecord("SELECT * FROM inventory_items WHERE id = ?", [$itemId], 'i');

        echo json_encode([
            'success' => true,
            'message' => $direction === 'in' ? 'Stock in confirmed' : 'Stock out confirmed',
            'data'    => shapeInventoryItem($row),
        ]);
        exit;
    }

    // --- Borrow -------------------------------------------------------------
    if ($action === 'borrow') {
        $itemId    = (int) ($data['itemId'] ?? 0);
        $quantity  = (int) ($data['quantity'] ?? 0);
        $borrower  = trim((string) ($data['borrowerName'] ?? ''));
        $borrowDate = to_db_date($data['dateBorrowed'] ?? null);

        if ($itemId <= 0 || $quantity <= 0 || $borrower === '' || $borrowDate === null) {
            inventoryFail(400, 'Item, quantity, borrower and borrow date are required');
        }

        $item = getRecord(
            "SELECT * FROM inventory_items WHERE id = ? AND (archived IS NULL OR archived = 0)",
            [$itemId],
            'i'
        );

        if (!$item) {
            inventoryFail(404, 'Item not found');
        }

        $onHand = (int) ($item['quantity'] ?? 0);

        if ($quantity > $onHand) {
            inventoryFail(409, 'Insufficient stock. Only ' . $onHand . ' ' . $item['unit'] . ' available.');
        }

        $expectedReturn = to_db_date($data['expectedReturn'] ?? null);
        $purpose        = (string) ($data['purpose'] ?? '');
        $releasedBy     = (string) ($data['releasedBy'] ?? '');
        $borrowerType   = (string) ($data['borrowerType'] ?? 'Resident');
        $borrowerContact = (string) ($data['borrowerContact'] ?? '');
        $now            = date('Y-m-d H:i:s');
        $newStock       = $onHand - $quantity;

        $conn = getConnection();
        $transactionId = null;
        $borrowId = null;
        $error = null;

        try {
            $conn->beginTransaction();

            executeStatement(
                "UPDATE inventory_items
                    SET quantity = ?, status = ?, updated_at = ?
                  WHERE id = ?",
                [$newStock, inventoryStatus($newStock), $now, $itemId],
                'issi'
            );

            $transactionId = insertRecord(
                "INSERT INTO stock_transactions
                    (item_id, transaction_type, quantity, source_or_recipient, purpose,
                     transaction_date, performed_by, remarks, created_at)
                 VALUES (?, 'OUT', ?, ?, ?, ?, ?, ?, ?)",
                [
                    $itemId,
                    $quantity,
                    $borrower,
                    $purpose,
                    $borrowDate,
                    $releasedBy,
                    '',
                    $now,
                ],
                'iisssssss'
            );

            $borrowId = insertRecord(
                "INSERT INTO borrow_records
                    (item_id, transaction_id, quantity, borrower_name, borrower_type,
                     borrower_contact, date_borrowed, expected_return_date, purpose,
                     released_by, remarks, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    $itemId,
                    $transactionId,
                    $quantity,
                    $borrower,
                    $borrowerType,
                    $borrowerContact,
                    $borrowDate,
                    $expectedReturn,
                    $purpose,
                    $releasedBy,
                    '',
                    $now,
                    $now,
                ],
                'iiisssssssss'
            );

            $conn->commit();
        } catch (Throwable $e) {
            if ($conn->inTransaction()) {
                $conn->rollBack();
            }
            recordDbError('Borrow error: ' . $e->getMessage());
            inventoryFail(500, 'Failed to record borrow', $e->getMessage());
        }

        $row = getRecord(
            "SELECT br.*, i.item_name, i.category, i.unit
             FROM borrow_records br
             INNER JOIN inventory_items i ON i.id = br.item_id
             WHERE br.id = ?",
            [$borrowId],
            'i'
        );

        echo json_encode([
            'success' => true,
            'message' => 'Borrow logged successfully',
            'data'    => [
                'borrow' => shapeBorrowRecord($row),
                'item'   => shapeInventoryItem(getRecord("SELECT * FROM inventory_items WHERE id = ?", [$itemId], 'i')),
            ],
        ]);
        exit;
    }

    // --- Return -------------------------------------------------------------
    if ($action === 'return') {
        $borrowId = (int) ($data['borrowId'] ?? 0);

        if ($borrowId <= 0) {
            inventoryFail(400, 'A borrow record id is required');
        }

        $borrow = getRecord(
            "SELECT br.*, i.item_name, i.category, i.unit
             FROM borrow_records br
             INNER JOIN inventory_items i ON i.id = br.item_id
             WHERE br.id = ?",
            [$borrowId],
            'i'
        );

        if (!$borrow) {
            inventoryFail(404, 'Borrow record not found');
        }

        if (!empty($borrow['date_returned'])) {
            inventoryFail(409, 'This item has already been returned');
        }

        $returnDate = to_db_date($data['dateReturned'] ?? null) ?: date('Y-m-d');
        $condition  = (string) ($data['condition'] ?? '');
        $remarks    = trim(implode(' | ', array_filter([
            (string) ($borrow['remarks'] ?? ''),
            $condition !== '' ? 'Returned in: ' . $condition : '',
        ])));
        $now        = date('Y-m-d H:i:s');

        $item = getRecord("SELECT * FROM inventory_items WHERE id = ?", [$borrow['item_id']], 'i');
        $newStock = (int) ($item['quantity'] ?? 0) + (int) $borrow['quantity'];

        $conn = getConnection();
        $transactionId = null;
        $error = null;

        try {
            $conn->beginTransaction();

            $transactionId = insertRecord(
                "INSERT INTO stock_transactions
                    (item_id, transaction_type, quantity, source_or_recipient, purpose,
                     transaction_date, performed_by, remarks, created_at)
                 VALUES (?, 'IN', ?, ?, ?, ?, ?, ?, ?)",
                [
                    (int) $borrow['item_id'],
                    (int) $borrow['quantity'],
                    (string) $borrow['borrower_name'],
                    'Return of borrowed item',
                    $returnDate,
                    (string) $borrow['released_by'],
                    $remarks,
                    $now,
                ],
                'iisssssss'
            );

            executeStatement(
                "UPDATE borrow_records
                    SET date_returned = ?, return_transaction_id = ?, remarks = ?, updated_at = ?
                  WHERE id = ?",
                [$returnDate, $transactionId, $remarks, $now, $borrowId],
                'ssssi'
            );

            executeStatement(
                "UPDATE inventory_items
                    SET quantity = ?, status = ?, updated_at = ?
                  WHERE id = ?",
                [$newStock, inventoryStatus($newStock), $now, (int) $borrow['item_id']],
                'issi'
            );

            $conn->commit();
        } catch (Throwable $e) {
            if ($conn->inTransaction()) {
                $conn->rollBack();
            }
            recordDbError('Return error: ' . $e->getMessage());
            inventoryFail(500, 'Failed to record return', $e->getMessage());
        }

        echo json_encode([
            'success' => true,
            'message' => 'Item returned successfully',
            'data'    => [
                'borrow' => shapeBorrowRecord(
                    getRecord(
                        "SELECT br.*, i.item_name, i.category, i.unit
                         FROM borrow_records br
                         INNER JOIN inventory_items i ON i.id = br.item_id
                         WHERE br.id = ?",
                        [$borrowId],
                        'i'
                    )
                ),
                // Re-read the item: the copy fetched above was taken before the
                // stock update, so returning it would report the pre-return quantity.
                'item' => shapeInventoryItem(
                    getRecord("SELECT * FROM inventory_items WHERE id = ?", [(int) $borrow['item_id']], 'i')
                ),
            ],
        ]);
        exit;
    }

    inventoryFail(400, 'Unknown action');
}

// ---------------------------------------------------------------------------
// PUT - update editable fields (quantity is intentionally not editable)
// ---------------------------------------------------------------------------

if ($method === 'PUT') {
    $id = (int) ($_GET['id'] ?? 0);

    if ($id <= 0) {
        inventoryFail(400, 'A valid item id is required');
    }

    $data = inventoryRequestBody();

    if ($data === null) {
        inventoryFail(400, 'Invalid request body');
    }

    $item = getRecord("SELECT * FROM inventory_items WHERE id = ?", [$id], 'i');

    if (!$item) {
        inventoryFail(404, 'Item not found');
    }

    $consumableRaw = $data['consumable'] ?? $item['consumable'] ?? 0;
    $consumable    = ($consumableRaw === 'Consumable' || $consumableRaw === 1 || $consumableRaw === '1') ? 1 : 0;

    $updated = executeStatement(
        "UPDATE inventory_items SET
            item_name = ?, category = ?, unit = ?, brand_model = ?, serial_number = ?,
            location = ?, assigned_officer = ?, date_acquired = ?, notes = ?,
            supplier = ?, condition = ?, consumable = ?, status = ?, updated_at = ?
         WHERE id = ?",
        [
            trim((string) ($data['itemName'] ?? $item['item_name'])),
            trim((string) ($data['category'] ?? $item['category'])),
            trim((string) ($data['unit'] ?? $item['unit'])),
            (string) ($data['brandModel'] ?? $item['brand_model']),
            (string) ($data['serialNumber'] ?? $item['serial_number']),
            (string) ($data['location'] ?? $item['location']),
            (string) ($data['assignedOfficer'] ?? $item['assigned_officer']),
            to_db_date($data['dateAcquired'] ?? $item['date_acquired']),
            (string) ($data['notes'] ?? $item['notes']),
            (string) ($data['supplier'] ?? $item['supplier']),
            (string) ($data['condition'] ?? $item['condition']),
            $consumable,
            inventoryStatus((int) ($item['quantity'] ?? 0)),
            date('Y-m-d H:i:s'),
            $id,
        ],
        'ssssssssssissi'
    );

    if ($updated === false) {
        inventoryFail(500, 'Failed to update item', lastDbError());
    }

    echo json_encode([
        'success' => true,
        'message' => 'Item updated successfully',
        'data'    => shapeInventoryItem(getRecord("SELECT * FROM inventory_items WHERE id = ?", [$id], 'i')),
    ]);
    exit;
}

// ---------------------------------------------------------------------------
// DELETE - soft archive
// ---------------------------------------------------------------------------

if ($method === 'DELETE') {
    $id = (int) ($_GET['id'] ?? 0);

    if ($id <= 0) {
        inventoryFail(400, 'A valid item id is required');
    }

    $item = getRecord("SELECT * FROM inventory_items WHERE id = ?", [$id], 'i');

    if (!$item) {
        inventoryFail(404, 'Item not found');
    }

    // Soft archive rather than a hard delete: FK_stock_items is ON DELETE CASCADE,
    // so removing the row would also erase the item's whole stock_transactions
    // history, and FK_borrow_records_item is NO_ACTION, so an item with borrow
    // records could not be deleted at all.
    $archived = executeStatement(
        "UPDATE inventory_items SET archived = 1, updated_at = ? WHERE id = ?",
        [date('Y-m-d H:i:s'), $id],
        'si'
    );

    if ($archived === false) {
        inventoryFail(500, 'Failed to archive item', lastDbError());
    }

    echo json_encode(['success' => true, 'message' => 'Item archived successfully']);
    exit;
}
