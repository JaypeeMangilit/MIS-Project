// inventory.js - live data from api/inventory.php (brgy49_db)
//
// Every number on this page now comes from the database; the arrays that used to
// be hardcoded here (4 items, 3 borrow rows, 2 activity rows) were invented and
// never matched anything in the database.

let inventoryData = [];
let borrowLogData = [];
let recentActivities = [];

let currentFilters = { search: '', category: '', status: '' };
let currentView = 'list';
let currentViewingItemId = null;
let currentEditingItemId = null;
let currentBorrowPage = 1;
let borrowItemsPerPage = 5;
let currentBorrowFilters = { search: '', status: '', category: '' };
let currentReturnLogId = null;
let inventoryModuleInitialized = false;

const CATEGORY_ICONS = { 'Office Supply': '📄', 'Emergency': '🚑', 'Facility Use': '⛺', 'Equipment': '🔧' };

function categoryIcon(category) {
    return CATEGORY_ICONS[category] || '📦';
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

// Deliberately not called apiCall: js/api.js is only loaded by login.php, and
// blotter.js / archives.js / residents.js each declare a global apiCall.
// Re-declaring it here would silently override whichever loaded last.
async function inventoryApi(method, path, body) {
    const url = 'api/inventory.php' + (path ? '?' + path : '');
    const options = {
        method: method,
        headers: { 'Content-Type': 'application/json' }
    };

    if (body !== undefined && body !== null) {
        options.body = JSON.stringify(body);
    }

    let result;
    try {
        const response = await fetch(url, options);

        // Read as text first: a PHP warning or fatal error would make
        // response.json() throw and the real cause would be lost.
        const raw = await response.text();

        try {
            result = raw.length ? JSON.parse(raw) : {};
        } catch (parseError) {
            console.error('inventory.php returned non-JSON:\n' + raw);
            result = { success: false, error: 'Server returned invalid JSON (HTTP ' + response.status + ').' };
        }

        if (!response.ok && result.success === undefined) {
            result.success = false;
        }
        result.status = response.status;
    } catch (error) {
        console.error('inventory.php request failed:', error);
        result = { success: false, error: 'Network error: ' + error.message };
    }

    return result;
}

/** Server message with a sensible fallback. */
function apiMessage(result, fallback) {
    if (!result) return fallback;
    return result.message || result.error || fallback;
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

async function initInventoryModule() {
    // sidebar.js injects this module's HTML after DOMContentLoaded has already
    // fired, so the listener below never runs in practice - but it does run if the
    // script is ever loaded directly, hence the guard against double init.
    if (inventoryModuleInitialized) return;
    inventoryModuleInitialized = true;

    setupEventListeners();
    setupFormEventListeners();
    setupBorrowLogEventListeners();
    setupLogNewBorrowEventListeners();

    await loadInventoryData();
    await loadBorrowLogData();
    await loadRecentActivity();
    await updateStats();
}

document.addEventListener('DOMContentLoaded', function () { initInventoryModule(); });

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadInventoryData() {
    const result = await inventoryApi('GET', '');

    if (!result || result.success !== true) {
        console.error('Could not load inventory:', result);
        inventoryData = [];
        renderInventoryTable([]);
        return;
    }

    inventoryData = result.data || [];
    renderInventoryTable(inventoryData);
    loadBorrowedItems();
}

async function loadBorrowLogData() {
    const params = new URLSearchParams({
        search: currentBorrowFilters.search || '',
        status: currentBorrowFilters.status || '',
        category: currentBorrowFilters.category || '',
        page: String(currentBorrowPage),
        limit: String(borrowItemsPerPage)
    });

    const result = await inventoryApi('GET', 'action=borrowlog&' + params.toString());

    if (!result || result.success !== true) {
        console.error('Could not load borrow log:', result);
        borrowLogData = [];
        renderBorrowLogTable([]);
        return;
    }

    borrowLogData = result.data || [];

    renderBorrowLogTable(borrowLogData);

    const total = result.total || borrowLogData.length;
    const totalPages = result.totalPages || 1;
    const start = borrowLogData.length === 0 ? 0 : (result.page - 1) * borrowItemsPerPage + 1;
    const end = (result.page - 1) * borrowItemsPerPage + borrowLogData.length;

    const info = document.getElementById('borrowPaginationInfo');
    if (info) {
        info.textContent = 'Showing ' + start + ' to ' + end + ' of ' + total + ' entries';
    }

    renderBorrowPagination(totalPages);
}

async function loadRecentActivity() {
    const result = await inventoryApi('GET', 'action=activity');

    if (!result || result.success !== true) {
        console.error('Could not load activity:', result);
        recentActivities = [];
        renderRecentActivity();
        return;
    }

    recentActivities = result.data || [];
    renderRecentActivity();
}

async function updateStats() {
    const result = await inventoryApi('GET', 'action=stats');

    if (!result || result.success !== true || !result.data) {
        console.error('Could not load statistics:', result);
        return;
    }

    const stats = result.data;
    setText('totalItems', stats.totalItems);
    setText('availableStock', stats.availableStock);
    setText('borrowedItemsCount', stats.borrowedItems);
    setText('lowStockAlerts', stats.lowStockAlerts);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = (value === null || value === undefined) ? 0 : value;
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', (e) => { currentFilters.search = e.target.value.toLowerCase(); loadInventoryTable(); });

    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) categoryFilter.addEventListener('change', (e) => { currentFilters.category = e.target.value; loadInventoryTable(); });

    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) statusFilter.addEventListener('change', (e) => { currentFilters.status = e.target.value; loadInventoryTable(); });

    const addBtn = document.getElementById('addItemBtn');
    if (addBtn) addBtn.addEventListener('click', () => showAddItemView());

    const stockInBtn = document.getElementById('stockInBtn');
    if (stockInBtn) stockInBtn.addEventListener('click', () => showStockInOutView('stockin'));

    const stockOutBtn = document.getElementById('stockOutBtn');
    if (stockOutBtn) stockOutBtn.addEventListener('click', () => showBorrowLogView());
}

function setupFormEventListeners() {
    const backToListFromAddBtn = document.getElementById('backToListFromAddBtn');
    if (backToListFromAddBtn) backToListFromAddBtn.addEventListener('click', () => showInventoryListView());

    const backToListFromStockBtn = document.getElementById('backToListFromStockBtn');
    if (backToListFromStockBtn) backToListFromStockBtn.addEventListener('click', () => showInventoryListView());

    const backToListFromViewBtn = document.getElementById('backToListFromViewBtn');
    if (backToListFromViewBtn) backToListFromViewBtn.addEventListener('click', () => showInventoryListView());

    const cancelAddItemBtn = document.getElementById('cancelAddItemBtn');
    if (cancelAddItemBtn) cancelAddItemBtn.addEventListener('click', () => showInventoryListView());

    const saveItemBtn = document.getElementById('saveItemBtn');
    if (saveItemBtn) saveItemBtn.addEventListener('click', () => saveNewItem());

    const editItemFromViewBtn = document.getElementById('editItemFromViewBtn');
    if (editItemFromViewBtn) editItemFromViewBtn.addEventListener('click', () => { if (currentViewingItemId) editItem(currentViewingItemId); });

    const stockActionFromViewBtn = document.getElementById('stockActionFromViewBtn');
    if (stockActionFromViewBtn) stockActionFromViewBtn.addEventListener('click', () => showStockInOutView('stockout'));

    const archiveItemFromViewBtn = document.getElementById('archiveItemFromViewBtn');
    if (archiveItemFromViewBtn) archiveItemFromViewBtn.addEventListener('click', () => { if (currentViewingItemId) deleteItem(currentViewingItemId); });

    const cancelEditItemBtn = document.getElementById('cancelEditItemBtn');
    if (cancelEditItemBtn) cancelEditItemBtn.addEventListener('click', () => { if (currentViewingItemId) showViewItem(currentViewingItemId); else showInventoryListView(); });

    const saveEditItemBtn = document.getElementById('saveEditItemBtn');
    if (saveEditItemBtn) saveEditItemBtn.addEventListener('click', () => saveEditedItem());

    const cancelStockOutBtn = document.getElementById('cancelStockOutBtn');
    if (cancelStockOutBtn) cancelStockOutBtn.addEventListener('click', () => showInventoryListView());

    const confirmStockOutBtn = document.getElementById('confirmStockOutBtn');
    if (confirmStockOutBtn) confirmStockOutBtn.addEventListener('click', () => confirmStockTransaction());

    const stockOutItemSelect = document.getElementById('stockOutItemSelect');
    if (stockOutItemSelect) stockOutItemSelect.addEventListener('change', (e) => updateStockOutCurrentDisplay(e.target.value));

    const stockTabs = document.querySelectorAll('.stock-tab');
    stockTabs.forEach(tab => { tab.addEventListener('click', () => switchStockTab(tab.getAttribute('data-tab'))); });
}

function setupBorrowLogEventListeners() {
    const exportLogBtn = document.getElementById('exportLogBtn');
    if (exportLogBtn) exportLogBtn.addEventListener('click', () => alert('Export functionality coming soon'));

    const logNewBorrowBtn = document.getElementById('logNewBorrowBtn');
    if (logNewBorrowBtn) logNewBorrowBtn.addEventListener('click', () => showLogNewBorrowView());

    const closeReturnModalBtn = document.getElementById('closeReturnModalBtn');
    if (closeReturnModalBtn) closeReturnModalBtn.addEventListener('click', closeReturnModal);

    const cancelReturnModalBtn = document.getElementById('cancelReturnModalBtn');
    if (cancelReturnModalBtn) cancelReturnModalBtn.addEventListener('click', closeReturnModal);

    const confirmReturnBtn = document.getElementById('confirmReturnBtn');
    if (confirmReturnBtn) confirmReturnBtn.addEventListener('click', confirmReturn);

    const borrowSearchInput = document.getElementById('borrowSearchInput');
    if (borrowSearchInput) borrowSearchInput.addEventListener('input', (e) => { currentBorrowFilters.search = e.target.value.toLowerCase(); currentBorrowPage = 1; loadBorrowLogData(); });

    const borrowStatusFilter = document.getElementById('borrowStatusFilter');
    if (borrowStatusFilter) borrowStatusFilter.addEventListener('change', (e) => { currentBorrowFilters.status = e.target.value; currentBorrowPage = 1; loadBorrowLogData(); });

    const borrowCategoryFilter = document.getElementById('borrowCategoryFilter');
    if (borrowCategoryFilter) borrowCategoryFilter.addEventListener('change', (e) => { currentBorrowFilters.category = e.target.value; currentBorrowPage = 1; loadBorrowLogData(); });

    const borrowItemSelect = document.getElementById('borrowItemSelect');
    if (borrowItemSelect) borrowItemSelect.addEventListener('change', (e) => { const item = inventoryData.find(i => i.id == e.target.value); const stockDisplay = document.getElementById('borrowCurrentStock'); if (item && stockDisplay) stockDisplay.textContent = `${item.stock} ${item.unit}`; else if (stockDisplay) stockDisplay.textContent = '0 units'; });
}

function setupLogNewBorrowEventListeners() {
    const logNewBorrowBtn = document.getElementById('logNewBorrowBtn');
    if (logNewBorrowBtn) logNewBorrowBtn.addEventListener('click', () => showLogNewBorrowView());

    const cancelLogBorrowBtn = document.getElementById('cancelLogBorrowBtn');
    if (cancelLogBorrowBtn) cancelLogBorrowBtn.addEventListener('click', () => showBorrowLogView());

    const backToBorrowLogBtn = document.getElementById('backToBorrowLogBtn');
    if (backToBorrowLogBtn) backToBorrowLogBtn.addEventListener('click', () => showBorrowLogView());

    const clearFormBtn = document.getElementById('clearBorrowFormBtn');
    if (clearFormBtn) clearFormBtn.addEventListener('click', () => clearBorrowForm());

    const submitBorrowBtn = document.getElementById('submitBorrowRecordBtn');
    if (submitBorrowBtn) submitBorrowBtn.addEventListener('click', () => submitBorrowRecord());

    const saveLogBorrowBtn = document.getElementById('saveLogBorrowBtn');
    if (saveLogBorrowBtn) saveLogBorrowBtn.addEventListener('click', () => submitBorrowRecord());

    setupBorrowCategoryListener();
    setupBorrowItemListener();
}

// ---------------------------------------------------------------------------
// View switching
// ---------------------------------------------------------------------------

function showInventoryListView() {
    currentView = 'list';
    document.getElementById('inventoryListView').classList.add('active');
    document.getElementById('addItemView').classList.remove('active');
    document.getElementById('stockInOutView').classList.remove('active');
    document.getElementById('viewItemView').classList.remove('active');
    document.getElementById('editItemView').classList.remove('active');
    document.getElementById('borrowLogView').classList.remove('active');
    document.getElementById('logNewBorrowView').classList.remove('active');
    loadInventoryTable();
    updateStats();
}

function showAddItemView() {
    currentView = 'add';
    document.getElementById('inventoryListView').classList.remove('active');
    document.getElementById('addItemView').classList.add('active');
    resetAddItemForm();
}

function showStockInOutView(tabType) {
    currentView = 'stock';
    document.getElementById('inventoryListView').classList.remove('active');
    document.getElementById('stockInOutView').classList.add('active');
    switchStockTab(tabType);
}

function switchStockTab(tabType) {
    const stockTabs = document.querySelectorAll('.stock-tab');
    stockTabs.forEach(tab => { tab.classList.remove('active'); if (tab.getAttribute('data-tab') === tabType) tab.classList.add('active'); });

    const purposeGroup = document.querySelector('#stockOutForm .stock-form-group:nth-child(5)');
    const releasedToGroup = document.querySelector('#stockOutForm .stock-form-group:nth-child(6)');
    const sourceField = document.querySelector('.source-field');
    const confirmBtn = document.getElementById('confirmStockOutBtn');

    if (tabType === 'stockin') {
        if (purposeGroup) purposeGroup.style.display = 'none';
        if (releasedToGroup) releasedToGroup.style.display = 'none';
        if (sourceField) sourceField.style.display = 'flex';
        if (confirmBtn) confirmBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.33 7H11.67M7 2.33V11.67" stroke="white" stroke-width="1.17" stroke-linecap="round"/></svg>Confirm Stock In`;
        if (!sourceField) {
            const quantityGroup = document.querySelector('#stockOutForm .stock-form-group:nth-child(4)');
            if (quantityGroup) quantityGroup.insertAdjacentHTML('afterend', `<div class="stock-form-group source-field"><label>Source / Donated By <span class="required">*</span></label><input type="text" id="stockSource" placeholder="e.g., City Government, DSWD,..."></div>`);
        }
    } else {
        if (purposeGroup) purposeGroup.style.display = 'flex';
        if (releasedToGroup) releasedToGroup.style.display = 'flex';
        if (sourceField) sourceField.style.display = 'none';
        if (confirmBtn) confirmBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.33 7H11.67M7 2.33V11.67" stroke="white" stroke-width="1.17" stroke-linecap="round"/></svg>Confirm Stock Out`;
    }
    populateStockOutItemSelect(tabType);
    resetStockOutForm(tabType);
}

function populateStockOutItemSelect(type) {
    const select = document.getElementById('stockOutItemSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Choose an item from inventory...</option>';
    const items = type === 'stockin' ? inventoryData : inventoryData.filter(item => item.stock > 0);
    items.forEach(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.name} (${item.stock} ${item.unit} available)`; select.appendChild(option); });
}

function updateStockOutCurrentDisplay(itemId) {
    if (!itemId) { setText('stockOutCurrentValue', '0'); setText('stockOutCurrentUnit', 'pcs'); setText('releaseUnit', 'pcs'); return; }
    const item = inventoryData.find(i => i.id == itemId);
    if (item) { setText('stockOutCurrentValue', item.stock); setText('stockOutCurrentUnit', item.unit); setText('releaseUnit', item.unit); }
}

function resetStockOutForm(type) {
    const select = document.getElementById('stockOutItemSelect');
    if (select) select.value = '';
    const dateInput = document.getElementById('stockOutDate');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    const qtyInput = document.getElementById('quantityToRelease');
    if (qtyInput) qtyInput.value = '';
    if (type === 'stockout') {
        const purpose = document.getElementById('purposeSelect');
        const releasedTo = document.getElementById('releasedTo');
        if (purpose) purpose.value = '';
        if (releasedTo) releasedTo.value = '';
    } else {
        const sourceInput = document.getElementById('stockSource');
        if (sourceInput) sourceInput.value = '';
    }
    const remarks = document.getElementById('stockOutRemarks');
    if (remarks) remarks.value = '';
    updateStockOutCurrentDisplay('');
}

function resetAddItemForm() {
    const inputs = document.querySelectorAll('#addItemView input, #addItemView select, #addItemView textarea');
    inputs.forEach(input => { if (input.id !== 'quantity') input.value = ''; });
    const quantityInput = document.getElementById('quantity'); if (quantityInput) quantityInput.value = '0';
}

// ---------------------------------------------------------------------------
// Item list
// ---------------------------------------------------------------------------

function loadInventoryTable() {
    const filteredItems = inventoryData.filter(item =>
        (item.name.toLowerCase().includes(currentFilters.search)) &&
        (!currentFilters.category || item.category === currentFilters.category) &&
        (!currentFilters.status || item.status === currentFilters.status)
    );
    renderInventoryTable(filteredItems);
}

function renderInventoryTable(items) {
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;
    if (!items || items.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No inventory items found</td></tr>'; return; }

    tbody.innerHTML = items.map(item => {
        const pct = item.total > 0 ? Math.min(100, (item.stock / item.total) * 100) : 0;
        const barClass = item.status === 'Available' ? 'available' : (item.status === 'Low Stock' ? 'low' : '');
        return `<tr>
            <td><div class="item-cell"><div class="item-icon">${categoryIcon(item.category)}</div><div class="item-name">${escapeHtml(item.name)}</div></div></td>
            <td>${escapeHtml(item.category)}</td>
            <td>
                <div class="stock-info">${item.stock} of ${item.total} ${escapeHtml(item.unit)}</div>
                <div class="stock-bar"><div class="stock-bar-fill ${barClass}" style="width: ${pct}%"></div></div>
            </td>
            <td><span class="status-badge ${item.status.toLowerCase().replace(' ', '-')}">${item.status}</span></td>
            <td>${escapeHtml(item.lastUpdated)}</td>
            <td><div class="action-buttons-cell">
                <button class="action-btn-small" onclick="window.viewItem(${item.id})">View</button>
                <button class="action-btn-small" onclick="window.editItem(${item.id})">Edit</button>
                <button class="action-btn-small" onclick="window.deleteItem(${item.id})">Archive</button>
            </div></td>
        </tr>`;
    }).join('');
}

function loadBorrowedItems() {
    const container = document.getElementById('borrowedList');
    if (!container) return;

    // status is derived from the on-hand quantity, so it is never 'Borrowed'.
    // Outstanding borrow_records are what actually identify an item as out on loan.
    const borrowed = inventoryData.filter(item => (item.openBorrowQuantity || 0) > 0);

    if (borrowed.length === 0) { container.innerHTML = '<div class="borrowed-item">No borrowed items</div>'; return; }

    container.innerHTML = borrowed.map(item => `<div class="borrowed-item"><div class="borrowed-info"><div class="borrowed-name">${escapeHtml(item.name)}</div><div class="borrowed-details">${item.openBorrowQuantity} ${escapeHtml(item.unit)} out on borrow</div></div><div class="borrowed-qty">${item.openBorrowQuantity} ${escapeHtml(item.unit)}</div></div>`).join('');
}

function renderRecentActivity() {
    const container = document.getElementById('activityList');
    if (!container) return;

    if (!recentActivities || recentActivities.length === 0) {
        container.innerHTML = '<div class="activity-item"><div class="activity-content"><div class="activity-title">No recent activity</div></div></div>';
        return;
    }

    container.innerHTML = recentActivities.slice(0, 5).map(activity => `<div class="activity-item"><div class="activity-content"><div class="activity-title">${escapeHtml(activity.title)}</div><div class="activity-user">${escapeHtml(activity.user)}</div></div><div class="activity-time">${escapeHtml(activity.time)}</div></div>`).join('');
}

// ---------------------------------------------------------------------------
// Add item
// ---------------------------------------------------------------------------

async function saveNewItem() {
    const formData = {
        itemName: document.getElementById('itemName')?.value,
        category: document.getElementById('category')?.value,
        unit: document.getElementById('unit')?.value,
        quantity: parseInt(document.getElementById('quantity')?.value) || 0,
        brandModel: document.getElementById('brandModel')?.value,
        serialNumber: document.getElementById('serialNumber')?.value,
        dateAcquired: document.getElementById('dateAcquired')?.value,
        location: document.getElementById('location')?.value,
        assignedOfficer: document.getElementById('assignedOfficer')?.value,
        notes: document.getElementById('notes')?.value,
        supplier: document.getElementById('supplier')?.value,
        consumable: document.getElementById('consumableType')?.value || ''
    };

    if (!formData.itemName || !formData.category || !formData.unit || !formData.consumable) { alert('Please fill in all required fields'); return; }
    if (formData.quantity < 0) { alert('Quantity cannot be negative'); return; }

    const btn = document.getElementById('saveItemBtn');
    const original = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = 'Saving...'; }

    const result = await inventoryApi('POST', '', formData);

    if (btn) { btn.disabled = false; btn.innerHTML = original; }

    if (!result || result.success !== true) {
        alert(apiMessage(result, 'Could not save the item.'));
        return;
    }

    alert('Item added successfully!');
    await loadInventoryData();
    await updateStats();
    showInventoryListView();
}

// ---------------------------------------------------------------------------
// Stock in / out
// ---------------------------------------------------------------------------

function confirmStockTransaction() {
    const activeTab = document.querySelector('.stock-tab.active');
    const tabType = activeTab ? activeTab.getAttribute('data-tab') : 'stockout';
    if (tabType === 'stockin') confirmStockInTransaction();
    else confirmStockOutTransaction();
}

async function confirmStockInTransaction() {
    const itemId = document.getElementById('stockOutItemSelect')?.value;
    const quantity = parseInt(document.getElementById('quantityToRelease')?.value);
    const source = document.getElementById('stockSource') ? document.getElementById('stockSource').value : '';
    const releasedBy = document.getElementById('releasedBy')?.value;

    if (!itemId || !quantity || quantity <= 0 || !source) { alert('Please fill all required fields'); return; }

    const result = await inventoryApi('POST', 'action=transaction', {
        itemId: parseInt(itemId),
        direction: 'in',
        quantity: quantity,
        source: source,
        purpose: '',
        transactionDate: document.getElementById('stockOutDate')?.value,
        performedBy: releasedBy,
        remarks: document.getElementById('stockOutRemarks')?.value
    });

    if (!result || result.success !== true) {
        alert(apiMessage(result, 'Stock in failed.'));
        return;
    }

    alert('Stock In confirmed successfully!');
    await loadInventoryData();
    await updateStats();
    showInventoryListView();
}

async function confirmStockOutTransaction() {
    const itemId = document.getElementById('stockOutItemSelect')?.value;
    const quantity = parseInt(document.getElementById('quantityToRelease')?.value);
    const purpose = document.getElementById('purposeSelect')?.value;
    const releasedTo = document.getElementById('releasedTo')?.value;
    const releasedBy = document.getElementById('releasedBy')?.value;

    if (!itemId || !quantity || quantity <= 0 || !purpose || !releasedTo) { alert('Please fill all required fields'); return; }

    const result = await inventoryApi('POST', 'action=transaction', {
        itemId: parseInt(itemId),
        direction: 'out',
        quantity: quantity,
        source: releasedTo,
        purpose: purpose,
        transactionDate: document.getElementById('stockOutDate')?.value,
        performedBy: releasedBy,
        remarks: document.getElementById('stockOutRemarks')?.value
    });

    if (!result || result.success !== true) {
        alert(apiMessage(result, 'Stock out failed.'));
        return;
    }

    alert('Stock Out confirmed successfully!');
    await loadInventoryData();
    await updateStats();
    showInventoryListView();
}

// ---------------------------------------------------------------------------
// View / edit / archive item
// ---------------------------------------------------------------------------

window.viewItem = async function (itemId) {
    const result = await inventoryApi('GET', 'id=' + encodeURIComponent(itemId));

    if (!result || result.success !== true || !result.data || !result.data.item) {
        alert(apiMessage(result, 'Could not load this item.'));
        return;
    }

    const item = result.data.item;
    currentViewingItemId = item.id;

    setText('viewItemName', item.name);
    setText('viewItemCode', item.itemCode);
    setText('viewCategory', item.category);
    setText('viewItemType', item.consumableLabel || '—');
    setText('viewTotalQuantity', `${item.total} ${item.unit}`);
    setText('viewAvailableStock', item.stock);
    setText('viewBorrowedStock', Math.max(0, item.total - item.stock));
    setText('viewDateAcquired', item.dateAcquired || '—');
    setText('viewSupplier', item.supplier || '—');
    setText('viewBrandModel', item.brandModel || '—');
    setText('viewSerialNumber', item.serialNumber || '—');
    setText('viewLocation', item.location || '—');
    setText('viewAssignedOfficer', item.assignedOfficer || '—');
    setText('viewCondition', item.condition || '—');
    setText('viewLastUpdated', item.lastUpdated);

    const notesEl = document.getElementById('viewNotes');
    if (notesEl) notesEl.textContent = item.notes || '—';

    const statusBadge = document.getElementById('viewItemStatusBadge');
    if (statusBadge) {
        const span = statusBadge.querySelector('span');
        if (span) {
            span.textContent = item.status;
            span.className = `status-${item.status.toLowerCase().replace(' ', '-')}`;
        }
    }

    const tbody = document.getElementById('transactionsTableBody');
    if (tbody) {
        const transactions = result.data.transactions || [];
        if (transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;">No transactions recorded yet</td></tr>';
        } else {
            tbody.innerHTML = transactions.map(t => `<tr>
                <td>${formatDate(t.date)}</td>
                <td>${t.type === 'IN' ? 'Stock In' : 'Stock Out'}</td>
                <td>${t.quantity} ${escapeHtml(item.unit)}</td>
                <td>${escapeHtml(t.party || '—')}</td>
                <td>${escapeHtml(t.purpose || t.remarks || '—')}</td>
            </tr>`).join('');
        }
    }

    document.getElementById('inventoryListView').classList.remove('active');
    document.getElementById('viewItemView').classList.add('active');
};

window.editItem = async function (itemId) {
    const result = await inventoryApi('GET', 'id=' + encodeURIComponent(itemId));

    if (!result || result.success !== true || !result.data || !result.data.item) {
        alert(apiMessage(result, 'Could not load this item.'));
        return;
    }

    const item = result.data.item;
    currentEditingItemId = item.id;

    const subtitle = document.getElementById('editItemSubtitle');
    if (subtitle) subtitle.textContent = `Update information for ${item.name}.`;

    setInputValue('editItemName', item.name);
    setInputValue('editItemCode', item.itemCode);
    setInputValue('editCategory', item.category);
    setInputValue('editConsumable', item.consumable ? 'Consumable' : 'Non-consumable');
    setInputValue('editTotalQuantity', `${item.total} ${item.unit}`);
    setInputValue('editUnit', item.unit);
    setInputValue('editBrandModel', item.brandModel || '');
    setInputValue('editSerialNumber', item.serialNumber || '');
    setInputValue('editLocation', item.location || '');
    setInputValue('editAssignedOfficer', item.assignedOfficer || '');
    setInputValue('editSupplier', item.supplier || '');
    setInputValue('editCondition', item.condition || '');
    setInputValue('editDateAcquired', item.dateAcquired || '');
    setInputValue('editNotes', item.notes || '');

    // Status is derived server-side from the on-hand quantity, so the stored
    // value is display-only here. The select is disabled to avoid implying it can
    // be set by hand.
    setInputValue('editStatus', item.status);
    const statusSelect = document.getElementById('editStatus');
    if (statusSelect) {
        statusSelect.disabled = true;
        statusSelect.title = 'Status is calculated from the on-hand quantity (0 = Critical, under 10 = Low Stock, otherwise Available).';
    }

    document.getElementById('inventoryListView').classList.remove('active');
    document.getElementById('viewItemView').classList.remove('active');
    document.getElementById('editItemView').classList.add('active');
};

function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

async function saveEditedItem() {
    if (!currentEditingItemId) return;

    const result = await inventoryApi('PUT', 'id=' + currentEditingItemId, {
        itemName: document.getElementById('editItemName')?.value,
        category: document.getElementById('editCategory')?.value,
        unit: document.getElementById('editUnit')?.value,
        brandModel: document.getElementById('editBrandModel')?.value,
        serialNumber: document.getElementById('editSerialNumber')?.value,
        location: document.getElementById('editLocation')?.value,
        assignedOfficer: document.getElementById('editAssignedOfficer')?.value,
        supplier: document.getElementById('editSupplier')?.value,
        condition: document.getElementById('editCondition')?.value,
        dateAcquired: document.getElementById('editDateAcquired')?.value,
        notes: document.getElementById('editNotes')?.value,
        consumable: document.getElementById('editConsumable')?.value || 'Non-consumable'
    });

    if (!result || result.success !== true) {
        alert(apiMessage(result, 'Could not update the item.'));
        return;
    }

    alert('Item updated successfully!');
    const statusSelect = document.getElementById('editStatus');
    if (statusSelect) statusSelect.disabled = false;

    await loadInventoryData();
    await updateStats();
    await showViewItem(currentEditingItemId);
}

async function showViewItem(itemId) {
    await window.viewItem(itemId);
}

window.deleteItem = async function (id) {
    if (!confirm('Are you sure you want to archive this item?')) return;

    const result = await inventoryApi('DELETE', 'id=' + id);

    if (!result || result.success !== true) {
        alert(apiMessage(result, 'Could not archive the item.'));
        return;
    }

    alert('Item archived successfully!');
    if (currentViewingItemId === id) currentViewingItemId = null;

    await loadInventoryData();
    await updateStats();
    showInventoryListView();
};

// ---------------------------------------------------------------------------
// Borrow log
// ---------------------------------------------------------------------------

function renderBorrowLogTable(logs) {
    const tbody = document.getElementById('borrowLogTableBody');
    if (!tbody) return;
    if (!logs || logs.length === 0) { tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;">No borrow records found</td></tr>'; return; }

    tbody.innerHTML = logs.map(log => {
        const isReturned = log.status === 'Returned';
        const isOverdue = log.status === 'Overdue';
        const statusClass = isReturned ? 'returned' : (isOverdue ? 'overdue' : 'borrowed');

        return `<tr>
            <td>${escapeHtml(log.logId)}</td>
            <td><strong>${escapeHtml(log.itemName)}</strong><br><span style="font-size: 12px; color: #5F7385;">Quantity: ${log.quantity} ${escapeHtml(log.unit)}</span><br><span style="font-size: 12px; color: #5F7385;">Item Type: ${escapeHtml(log.consumableLabel || '—')}</span></td>
            <td><strong>${escapeHtml(log.borrower)}</strong><br><span style="font-size: 12px; color: #5F7385;">${escapeHtml(log.borrowerType || '')}</span></td>
            <td>${formatDate(log.dateBorrowed)}</td>
            <td>${formatDate(log.expectedReturn)}</td>
            <td><span class="borrow-status ${statusClass}">${log.status}</span></td>
            <td><div class="borrow-action-buttons">
                <button class="borrow-action-btn view" onclick="window.viewBorrowRecord(${log.id})">View</button>
                ${!isReturned ? `<button class="borrow-action-btn return" onclick="window.showReturnModal(${log.id})">Return</button>` : `<button class="borrow-action-btn returned" disabled>Returned</button>`}
            </div></td>
        </tr>`;
    }).join('');
}

function renderBorrowPagination(totalPages) {
    const container = document.getElementById('borrowPaginationControls');
    if (!container) return;
    if (!totalPages || totalPages <= 1) { container.innerHTML = ''; return; }

    let html = `<button class="pagination-btn" onclick="window.changeBorrowPage(${currentBorrowPage - 1})" ${currentBorrowPage === 1 ? 'disabled' : ''}>‹</button>`;
    for (let i = 1; i <= Math.min(totalPages, 5); i++) html += `<button class="pagination-btn ${i === currentBorrowPage ? 'active' : ''}" onclick="window.changeBorrowPage(${i})">${i}</button>`;
    if (totalPages > 5) html += `<button class="pagination-btn" disabled>...</button><button class="pagination-btn" onclick="window.changeBorrowPage(${totalPages})">${totalPages}</button>`;
    html += `<button class="pagination-btn" onclick="window.changeBorrowPage(${currentBorrowPage + 1})" ${currentBorrowPage === totalPages ? 'disabled' : ''}>›</button>`;
    container.innerHTML = html;
}

window.changeBorrowPage = function (page) { if (page < 1) return; currentBorrowPage = page; loadBorrowLogData(); };

function showBorrowLogView() {
    document.getElementById('inventoryListView').classList.remove('active');
    document.getElementById('addItemView').classList.remove('active');
    document.getElementById('stockInOutView').classList.remove('active');
    document.getElementById('viewItemView').classList.remove('active');
    document.getElementById('editItemView').classList.remove('active');
    document.getElementById('borrowLogView').classList.add('active');
    document.getElementById('logNewBorrowView').classList.remove('active');
    loadBorrowLogData();
    populateBorrowItemSelect();
}

function populateBorrowItemSelect() {
    const select = document.getElementById('borrowItemSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Choose an item...</option>';
    inventoryData.filter(item => item.stock > 0).forEach(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.name} (${item.stock} ${item.unit} available)`; select.appendChild(option); });
}

function closeReturnModal() {
    const modal = document.getElementById('returnItemModal');
    if (modal) modal.style.display = 'none';
    currentReturnLogId = null;
}

window.showReturnModal = function (logId) {
    const log = borrowLogData.find(l => l.id === logId);
    if (!log) {
        // The visible page holds only one page of records, so a record can fall
        // outside it.
        alert('This borrow record is not on the current page. Return it from the full log.');
        return;
    }

    currentReturnLogId = log.id;
    setText('returnItemName', log.itemName);
    setText('returnQuantity', `${log.quantity} ${log.unit}`);
    setText('returnBorrower', log.borrower);
    const dateInput = document.getElementById('returnDate');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    const condition = document.getElementById('returnCondition');
    if (condition) condition.value = '';

    const modal = document.getElementById('returnItemModal');
    if (modal) modal.style.display = 'flex';
};

async function confirmReturn() {
    if (!currentReturnLogId) return;

    const result = await inventoryApi('POST', 'action=return', {
        borrowId: currentReturnLogId,
        dateReturned: document.getElementById('returnDate')?.value,
        condition: document.getElementById('returnCondition')?.value
    });

    if (!result || result.success !== true) {
        alert(apiMessage(result, 'Could not record the return.'));
        return;
    }

    alert('Item returned successfully!');
    closeReturnModal();

    await loadInventoryData();
    await loadBorrowLogData();
    await updateStats();
}

window.viewBorrowRecord = function (id) {
    const log = borrowLogData.find(l => l.id === id);
    if (!log) return;
    alert(`Borrow Record Details:\n\nLog ID: ${log.logId}\nItem: ${log.itemName}\nQuantity: ${log.quantity} ${log.unit}\nBorrower: ${log.borrower}\nDate Borrowed: ${formatDate(log.dateBorrowed)}\nExpected Return: ${formatDate(log.expectedReturn)}\nStatus: ${log.status}\nPurpose: ${log.purpose || 'N/A'}`);
};

// ---------------------------------------------------------------------------
// Log a new borrow
// ---------------------------------------------------------------------------

function showLogNewBorrowView() {
    document.getElementById('inventoryListView').classList.remove('active');
    document.getElementById('addItemView').classList.remove('active');
    document.getElementById('stockInOutView').classList.remove('active');
    document.getElementById('viewItemView').classList.remove('active');
    document.getElementById('editItemView').classList.remove('active');
    document.getElementById('borrowLogView').classList.remove('active');
    document.getElementById('logNewBorrowView').classList.add('active');

    const today = new Date().toISOString().split('T')[0];
    setInputValue('logBorrowDateReleased', today);
    const releasedBy = document.getElementById('logBorrowReleasedBy');
    if (releasedBy && !releasedBy.value) releasedBy.value = 'Ricardo Dalisay';

    populateBorrowCategorySelect();
}

function populateBorrowCategorySelect() {
    const categorySelect = document.getElementById('logBorrowCategory');
    if (!categorySelect) return;

    const categories = ['Office Supply', 'Emergency', 'Facility Use', 'Equipment', 'Furniture'];
    categorySelect.innerHTML = '<option value="">Select Category</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        categorySelect.appendChild(option);
    });
}

function setupBorrowCategoryListener() {
    const categorySelect = document.getElementById('logBorrowCategory');
    if (categorySelect) {
        categorySelect.addEventListener('change', function () {
            const selectedCategory = this.value;
            const itemSelect = document.getElementById('logBorrowItemName');
            if (!itemSelect) return;

            itemSelect.innerHTML = '<option value="">Select Item</option>';
            if (selectedCategory) {
                const filteredItems = inventoryData.filter(item => item.category === selectedCategory && item.stock > 0);
                filteredItems.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = `${item.name} (${item.stock} ${item.unit} available)`;
                    option.setAttribute('data-stock', item.stock);
                    option.setAttribute('data-unit', item.unit);
                    itemSelect.appendChild(option);
                });
            }
        });
    }
}

function setupBorrowItemListener() {
    const itemSelect = document.getElementById('logBorrowItemName');
    if (itemSelect) {
        itemSelect.addEventListener('change', function () {
            const selectedOption = this.options[this.selectedIndex];
            const stockDisplay = document.getElementById('logBorrowAvailableStock');
            const typeDisplay = document.getElementById('logBorrowItemType');

            if (selectedOption && selectedOption.value) {
                const stock = selectedOption.getAttribute('data-stock') || 0;
                const unit = selectedOption.getAttribute('data-unit') || 'units';
                if (stockDisplay) stockDisplay.textContent = `${stock} ${unit}`;

                const item = inventoryData.find(i => i.id == selectedOption.value);
                if (typeDisplay) {
                    typeDisplay.textContent = item
                        ? `Item type: ${item.consumableLabel || (item.consumable ? 'Consumable' : 'Non-consumable')}`
                        : 'Item type: —';
                }
            } else {
                if (stockDisplay) stockDisplay.textContent = '0 units';
                if (typeDisplay) typeDisplay.textContent = 'Item type: —';
            }
        });
    }
}

function clearBorrowForm() {
    ['logBorrowPurpose', 'logBorrowRequester', 'logBorrowContact', 'logBorrowCategory', 'logBorrowQuantity', 'logBorrowExpectedReturn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const itemSelect = document.getElementById('logBorrowItemName');
    if (itemSelect) itemSelect.innerHTML = '<option value="">Select Item</option>';
    const stock = document.getElementById('logBorrowAvailableStock');
    if (stock) stock.textContent = '0 units';
    const itemType = document.getElementById('logBorrowItemType');
    if (itemType) itemType.textContent = 'Item type: —';
    const date = document.getElementById('logBorrowDateReleased');
    if (date) date.value = new Date().toISOString().split('T')[0];
}

async function submitBorrowRecord() {
    const payload = {
        itemId: parseInt(document.getElementById('logBorrowItemName')?.value),
        quantity: parseInt(document.getElementById('logBorrowQuantity')?.value),
        borrowerName: document.getElementById('logBorrowRequester')?.value,
        borrowerType: 'Resident',
        borrowerContact: document.getElementById('logBorrowContact')?.value,
        dateBorrowed: document.getElementById('logBorrowDateReleased')?.value,
        expectedReturn: document.getElementById('logBorrowExpectedReturn')?.value,
        purpose: document.getElementById('logBorrowPurpose')?.value,
        releasedBy: document.getElementById('logBorrowReleasedBy')?.value
    };

    const purpose = document.getElementById('logBorrowPurpose')?.value;
    const requester = document.getElementById('logBorrowRequester')?.value;
    const contact = document.getElementById('logBorrowContact')?.value;
    const category = document.getElementById('logBorrowCategory')?.value;
    const dateReleased = document.getElementById('logBorrowDateReleased')?.value;
    const expectedReturn = document.getElementById('logBorrowExpectedReturn')?.value;

    if (!purpose || !requester || !contact || !category || !payload.itemId || !payload.quantity || !dateReleased || !expectedReturn) {
        alert('Please fill in all required fields marked with *');
        return;
    }

    const result = await inventoryApi('POST', 'action=borrow', payload);

    if (!result || result.success !== true) {
        alert(apiMessage(result, 'Could not record the borrow.'));
        return;
    }

    alert(`Borrow logged successfully!\nLog ID: ${result.data.borrow.logId}`);

    await loadInventoryData();
    await loadBorrowLogData();
    await updateStats();
    showBorrowLogView();
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>]/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}
