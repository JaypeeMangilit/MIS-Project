<?php
/**
 * create_inventory_tables.php - Prepares the Inventory storage in brgy49_db.
 *
 * Each step runs only when it is actually needed, and nothing is dropped,
 * altered destructively or deleted:
 *
 *   1. adds inventory_items.total_quantity - cumulative units ever acquired.
 *      inventory_items.quantity already holds the on-hand count, which is what
 *      Stock In / Stock Out / Borrow / Return move; the UI renders "stock of
 *      total", so the cumulative figure has to live somewhere.
 *
 *   2. creates borrow_records - the borrow lifecycle (borrower, expected return,
 *      actual return, status).
 *
 *      stock_transactions is deliberately left alone: it carries a CHECK
 *      constraint restricting transaction_type to 'IN' | 'OUT', so it is a pure
 *      movement ledger. Bolting borrow metadata onto it would mean either
 *      overloading 'OUT' rows or fighting that constraint, so the borrow log gets
 *      its own table and still writes its IN/OUT movement into the ledger.
 *
 * inventory_items and stock_transactions are both empty and unreferenced by any
 * code, so step 1 is non-destructive.
 *
 * Usage:  php install/create_inventory_tables.php
 */

require_once __DIR__ . '/../config/functions.php';
require_once __DIR__ . '/../config/db_connection.php';

header('Content-Type: text/plain');

$conn = getConnection();
if (!$conn) {
    echo "Could not connect to the database.\n";
    exit(1);
}

echo 'Connected: ' . currentDbDriver() . ' / ' . DB_NAME . "\n\n";

// ---------------------------------------------------------------------------
// 1. inventory_items: columns the UI edits but the table does not have
// ---------------------------------------------------------------------------
// quantity is the on-hand count (moved by Stock In/Out/Borrow/Return);
// total_quantity is the cumulative units ever acquired, which is what the list
// renders as "stock of total".
$newColumns = [
    'total_quantity' => 'int NULL',
    'supplier'       => 'varchar(255) NULL',
    'condition'      => 'varchar(50) NULL',
    // Distinguishes items that are used up (bond paper, first aid kits) from
    // durable assets that are expected back (chairs, tents, equipment). The
    // borrow flow surfaces this so consumables are not logged as returnable
    // loans, which is the distinction the Borrow Log previously lacked.
    'consumable'     => 'int NULL',
    // Soft archive flag. A hard archive is not safe here: FK_stock_items is
    // ON DELETE CASCADE, so deleting an item would also delete its whole
    // stock_transactions history, and FK_borrow_records_item is NO_ACTION, so
    // an item with borrow records cannot be deleted at all.
    'archived'       => 'int NULL',
];

foreach ($newColumns as $column => $definition) {
    $exists = getRecord(
        "SELECT c.name AS name FROM sys.columns c
         WHERE c.object_id = OBJECT_ID('inventory_items') AND c.name = ?",
        [$column],
        's'
    );

    if ($exists) {
        echo "SKIP  inventory_items.$column (already exists)\n";
        continue;
    }

    $conn->exec("ALTER TABLE inventory_items ADD $column $definition");
    echo "OK    inventory_items.$column added ($definition)\n";
}

// ---------------------------------------------------------------------------
// 2. borrow_records
// ---------------------------------------------------------------------------
$hasBorrows = getRecord(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'borrow_records'"
);

if ($hasBorrows) {
    echo "SKIP  borrow_records (already exists)\n";
} else {
    $conn->exec("
        CREATE TABLE borrow_records (
            id                 int IDENTITY(1,1) NOT NULL PRIMARY KEY,
            item_id            int NOT NULL,
            transaction_id     int NULL,
            return_transaction_id int NULL,
            quantity           int NOT NULL,
            borrower_name      varchar(255) NOT NULL,
            borrower_type      varchar(50) NULL,
            borrower_contact   varchar(255) NULL,
            date_borrowed      date NOT NULL,
            expected_return_date date NULL,
            date_returned      date NULL,
            purpose            varchar(255) NULL,
            released_by        varchar(255) NULL,
            remarks            nvarchar(MAX) NULL,
            created_at         datetime2 NULL,
            updated_at         datetime2 NULL,
            CONSTRAINT FK_borrow_records_item FOREIGN KEY (item_id)
                REFERENCES inventory_items (id)
        )
    ");
    echo "OK    borrow_records created\n";
}

echo "\nDone.\n";
