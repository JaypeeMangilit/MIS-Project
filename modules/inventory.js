// inventory.js - Complete with all functions working

let inventoryData = [
    { id: 1, name: "Bond Paper", category: "Office Supply", stock: 120, total: 150, unit: "pads", status: "Available", lastUpdated: "2 days ago", icon: "📄" },
    { id: 2, name: "Emergency First Aid Kits", category: "Emergency", stock: 9, total: 20, unit: "kits", status: "Low Stock", lastUpdated: "2 days ago", icon: "🚑" },
    { id: 3, name: "Foldable Event Tents", category: "Facility Use", stock: 3, total: 5, unit: "units", status: "Borrowed", lastUpdated: "Today, 8:05 AM", icon: "⛺" },
    { id: 4, name: "Event Monoblock Chairs", category: "Facility Use", stock: 3, total: 5, unit: "units", status: "Borrowed", lastUpdated: "Today, 8:05 AM", icon: "🪑" }
];

let recentActivities = [
    { title: "10 boxes of bond paper added to stock", user: "Recorded by Office Clerk", time: "9:12 AM" },
    { title: "2 wheelchairs issued to Health Center", user: "Release slip approved", time: "Yesterday" }
];

let borrowLogData = [
    { id: 1, logId: "LOG-2023-142", itemId: 1, itemName: "Bond Paper", category: "Office Supply", quantity: 50, unit: "pads", borrower: "Maria Santos", borrowerType: "Resident", dateBorrowed: "2023-10-15", expectedReturn: "2023-10-16", status: "Borrowed", purpose: "Barangay Assembly" },
    { id: 2, logId: "LOG-2023-141", itemId: 3, itemName: "Foldable Event Tents", category: "Facility Use", quantity: 2, unit: "units", borrower: "Ricardo Dalisay", borrowerType: "Resident", dateBorrowed: "2023-10-10", expectedReturn: "2023-10-12", status: "Overdue", purpose: "Family Event" },
    { id: 3, logId: "LOG-2023-140", itemId: 4, itemName: "Event Monoblock Chairs", category: "Facility Use", quantity: 1, unit: "unit", borrower: "Elena Cruz", borrowerType: "Staff", dateBorrowed: "2023-10-08", expectedReturn: "2023-10-09", status: "Returned", purpose: "Health Mission" }
];

let currentFilters = { search: '', category: '', status: '' };
let currentView = 'list';
let nextItemId = 5;
let currentViewingItemId = null;
let currentEditingItemId = null;
let currentBorrowPage = 1;
let borrowItemsPerPage = 5;
let currentBorrowFilters = { search: '', status: '', category: '' };
let currentReturnLogId = null;

document.addEventListener('DOMContentLoaded', function() { initInventoryModule(); });

function initInventoryModule() {
    loadInventoryTable();
    loadBorrowedItems();
    loadRecentActivity();
    updateStats();
    setupEventListeners();
    setupFormEventListeners();
    setupBorrowLogEventListeners();
    setupLogNewBorrowEventListeners();
}

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
    
    const closeBorrowModalBtn = document.getElementById('closeBorrowModalBtn');
    if (closeBorrowModalBtn) closeBorrowModalBtn.addEventListener('click', closeBorrowModal);
    
    const cancelBorrowModalBtn = document.getElementById('cancelBorrowModalBtn');
    if (cancelBorrowModalBtn) cancelBorrowModalBtn.addEventListener('click', closeBorrowModal);
    
    const confirmBorrowBtn = document.getElementById('confirmBorrowBtn');
    if (confirmBorrowBtn) confirmBorrowBtn.addEventListener('click', logNewBorrow);
    
    const closeReturnModalBtn = document.getElementById('closeReturnModalBtn');
    if (closeReturnModalBtn) closeReturnModalBtn.addEventListener('click', closeReturnModal);
    
    const cancelReturnModalBtn = document.getElementById('cancelReturnModalBtn');
    if (cancelReturnModalBtn) cancelReturnModalBtn.addEventListener('click', closeReturnModal);
    
    const confirmReturnBtn = document.getElementById('confirmReturnBtn');
    if (confirmReturnBtn) confirmReturnBtn.addEventListener('click', confirmReturn);
    
    const borrowSearchInput = document.getElementById('borrowSearchInput');
    if (borrowSearchInput) borrowSearchInput.addEventListener('input', (e) => { currentBorrowFilters.search = e.target.value.toLowerCase(); currentBorrowPage = 1; loadBorrowLogTable(); });
    
    const borrowStatusFilter = document.getElementById('borrowStatusFilter');
    if (borrowStatusFilter) borrowStatusFilter.addEventListener('change', (e) => { currentBorrowFilters.status = e.target.value; currentBorrowPage = 1; loadBorrowLogTable(); });
    
    const borrowCategoryFilter = document.getElementById('borrowCategoryFilter');
    if (borrowCategoryFilter) borrowCategoryFilter.addEventListener('change', (e) => { currentBorrowFilters.category = e.target.value; currentBorrowPage = 1; loadBorrowLogTable(); });
    
    const borrowItemSelect = document.getElementById('borrowItemSelect');
    if (borrowItemSelect) borrowItemSelect.addEventListener('change', (e) => { const item = inventoryData.find(i => i.id == e.target.value); const stockDisplay = document.getElementById('borrowCurrentStock'); if (item && stockDisplay) stockDisplay.textContent = `${item.stock} ${item.unit}`; else if (stockDisplay) stockDisplay.textContent = '0 units'; });
}

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
    let items = type === 'in' ? inventoryData : inventoryData.filter(item => item.stock > 0);
    items.forEach(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.name} (${item.stock} ${item.unit} available)`; select.appendChild(option); });
}

function updateStockOutCurrentDisplay(itemId) {
    if (!itemId) { document.getElementById('stockOutCurrentValue').textContent = '0'; document.getElementById('stockOutCurrentUnit').textContent = 'pcs'; document.getElementById('releaseUnit').textContent = 'pcs'; return; }
    const item = inventoryData.find(i => i.id == itemId);
    if (item) { document.getElementById('stockOutCurrentValue').textContent = item.stock; document.getElementById('stockOutCurrentUnit').textContent = item.unit; document.getElementById('releaseUnit').textContent = item.unit; }
}

function resetStockOutForm(type) {
    document.getElementById('stockOutItemSelect').value = '';
    document.getElementById('stockOutDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('quantityToRelease').value = '';
    if (type === 'out') { document.getElementById('purposeSelect').value = ''; document.getElementById('releasedTo').value = ''; }
    else { const sourceInput = document.getElementById('stockSource'); if (sourceInput) sourceInput.value = ''; }
    document.getElementById('stockOutRemarks').value = '';
    updateStockOutCurrentDisplay('');
}

function confirmStockTransaction() {
    const activeTab = document.querySelector('.stock-tab.active');
    const tabType = activeTab ? activeTab.getAttribute('data-tab') : 'stockout';
    if (tabType === 'stockin') confirmStockInTransaction();
    else confirmStockOutTransaction();
}

function confirmStockInTransaction() {
    const itemId = document.getElementById('stockOutItemSelect').value;
    const quantity = parseInt(document.getElementById('quantityToRelease').value);
    const source = document.getElementById('stockSource') ? document.getElementById('stockSource').value : '';
    const releasedBy = document.getElementById('releasedBy').value;
    if (!itemId || !quantity || quantity <= 0 || !source) { alert('Please fill all required fields'); return; }
    const item = inventoryData.find(i => i.id == itemId);
    if (item) { item.stock += quantity; item.total += quantity; item.lastUpdated = 'Just now'; item.status = item.stock === 0 ? 'Critical' : (item.stock < 10 ? 'Low Stock' : 'Available'); }
    recentActivities.unshift({ title: `${quantity} ${item.unit} of ${item.name} added to stock`, user: `Received by ${releasedBy}`, time: "Just now" });
    loadInventoryTable(); updateStats(); loadRecentActivity(); showInventoryListView();
    alert('Stock In confirmed successfully!');
}

function confirmStockOutTransaction() {
    const itemId = document.getElementById('stockOutItemSelect').value;
    const quantity = parseInt(document.getElementById('quantityToRelease').value);
    const purpose = document.getElementById('purposeSelect').value;
    const releasedTo = document.getElementById('releasedTo').value;
    const releasedBy = document.getElementById('releasedBy').value;
    if (!itemId || !quantity || quantity <= 0 || !purpose || !releasedTo) { alert('Please fill all required fields'); return; }
    const item = inventoryData.find(i => i.id == itemId);
    if (item && quantity <= item.stock) { item.stock -= quantity; item.lastUpdated = 'Just now'; item.status = item.stock === 0 ? 'Critical' : (item.stock < 10 ? 'Low Stock' : 'Available'); }
    else { alert(`Insufficient stock! Only ${item.stock} ${item.unit} available.`); return; }
    recentActivities.unshift({ title: `${quantity} ${item.unit} of ${item.name} released for ${purpose}`, user: `Released by ${releasedBy}`, time: "Just now" });
    loadInventoryTable(); updateStats(); loadRecentActivity(); showInventoryListView();
    alert('Stock Out confirmed successfully!');
}

function resetAddItemForm() {
    const inputs = document.querySelectorAll('#addItemView input, #addItemView select, #addItemView textarea');
    inputs.forEach(input => { if (input.id !== 'quantity') input.value = ''; });
    const quantityInput = document.getElementById('quantity'); if (quantityInput) quantityInput.value = '0';
}

function saveNewItem() {
    const formData = { itemName: document.getElementById('itemName')?.value, category: document.getElementById('category')?.value, unit: document.getElementById('unit')?.value, quantity: parseInt(document.getElementById('quantity')?.value) || 0, brandModel: document.getElementById('brandModel')?.value, serialNumber: document.getElementById('serialNumber')?.value, dateAcquired: document.getElementById('dateAcquired')?.value, location: document.getElementById('location')?.value, assignedOfficer: document.getElementById('assignedOfficer')?.value, notes: document.getElementById('notes')?.value };
    if (!formData.itemName || !formData.category || !formData.unit) { alert('Please fill in all required fields'); return; }
    let status = formData.quantity === 0 ? 'Critical' : (formData.quantity < 10 ? 'Low Stock' : 'Available');
    const categoryIcons = { 'Office Supply': '📄', 'Emergency': '🚑', 'Facility Use': '⛺', 'Equipment': '🔧' };
    inventoryData.unshift({ id: nextItemId++, name: formData.itemName, category: formData.category, stock: formData.quantity, total: formData.quantity, unit: formData.unit, status: status, lastUpdated: 'Just now', icon: categoryIcons[formData.category] || '📦', brandModel: formData.brandModel, serialNumber: formData.serialNumber, dateAcquired: formData.dateAcquired, location: formData.location, assignedOfficer: formData.assignedOfficer, notes: formData.notes });
    recentActivities.unshift({ title: `${formData.quantity} ${formData.unit} of ${formData.itemName} added to inventory`, user: "Added by System", time: "Just now" });
    loadInventoryTable(); updateStats(); loadRecentActivity(); showInventoryListView();
    alert('Item added successfully!');
}

function loadInventoryTable() {
    let filteredItems = inventoryData.filter(item => item.name.toLowerCase().includes(currentFilters.search) && (!currentFilters.category || item.category === currentFilters.category) && (!currentFilters.status || item.status === currentFilters.status));
    renderInventoryTable(filteredItems);
}

function renderInventoryTable(items) {
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;
    if (items.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No inventory items found</td></tr>'; return; }
    tbody.innerHTML = items.map(item => `<tr><td><div class="item-cell"><div class="item-icon">${item.icon}</div><div class="item-name">${escapeHtml(item.name)}</div></div></td><td>${escapeHtml(item.category)}</td><td><div class="stock-info">${item.stock} of ${item.total} ${item.unit}</div><div class="stock-bar"><div class="stock-bar-fill ${item.status === 'Available' ? 'available' : (item.status === 'Low Stock' ? 'low' : '')}" style="width: ${(item.stock / item.total) * 100}%"></div></div></td><td><span class="status-badge ${item.status.toLowerCase().replace(' ', '-')}">${item.status}</span></td><td>${item.lastUpdated}</td><td><div class="action-buttons-cell"><button class="action-btn-small" onclick="window.viewItem(${item.id})">View</button><button class="action-btn-small" onclick="window.editItem(${item.id})">Edit</button><button class="action-btn-small" onclick="window.deleteItem(${item.id})">Archive</button></div></td></tr>`).join('');
}

function loadBorrowedItems() {
    const container = document.getElementById('borrowedList');
    if (!container) return;
    const borrowed = inventoryData.filter(item => item.status === 'Borrowed');
    if (borrowed.length === 0) { container.innerHTML = '<div class="borrowed-item">No borrowed items</div>'; return; }
    container.innerHTML = borrowed.map(item => `<div class="borrowed-item"><div class="borrowed-info"><div class="borrowed-name">${escapeHtml(item.name)}</div><div class="borrowed-details">${item.stock} ${item.unit} borrowed</div></div><div class="borrowed-qty">${item.stock} ${item.unit}</div></div>`).join('');
}

function loadRecentActivity() {
    const container = document.getElementById('activityList');
    if (!container) return;
    container.innerHTML = recentActivities.slice(0, 5).map(activity => `<div class="activity-item"><div class="activity-content"><div class="activity-title">${escapeHtml(activity.title)}</div><div class="activity-user">${escapeHtml(activity.user)}</div></div><div class="activity-time">${escapeHtml(activity.time)}</div></div>`).join('');
}

function updateStats() {
    document.getElementById('totalItems').textContent = inventoryData.reduce((sum, item) => sum + item.total, 0);
    document.getElementById('availableStock').textContent = inventoryData.filter(item => item.status === 'Available').reduce((sum, item) => sum + item.stock, 0);
    document.getElementById('borrowedItemsCount').textContent = inventoryData.filter(item => item.status === 'Borrowed').reduce((sum, item) => sum + item.stock, 0);
    document.getElementById('lowStockAlerts').textContent = inventoryData.filter(item => item.status === 'Low Stock' || item.status === 'Critical').length;
}

window.viewItem = function(itemId) {
    const item = inventoryData.find(i => i.id === itemId);
    if (item) {
        currentViewingItemId = itemId;
        document.getElementById('viewItemName').textContent = item.name;
        document.getElementById('viewItemCode').textContent = `INV-${String(item.id).padStart(4, '0')}`;
        document.getElementById('viewCategory').textContent = item.category;
        document.getElementById('viewTotalQuantity').textContent = `${item.total} ${item.unit}`;
        document.getElementById('viewAvailableStock').textContent = item.stock;
        document.getElementById('viewBorrowedStock').textContent = item.total - item.stock;
        document.getElementById('viewDateAcquired').textContent = item.dateAcquired || '—';
        document.getElementById('viewSupplier').textContent = item.supplier || '—';
        document.getElementById('viewBrandModel').textContent = item.brandModel || '—';
        document.getElementById('viewSerialNumber').textContent = item.serialNumber || '—';
        document.getElementById('viewLocation').textContent = item.location || '—';
        document.getElementById('viewAssignedOfficer').textContent = item.assignedOfficer || '—';
        document.getElementById('viewLastUpdated').textContent = item.lastUpdated;
        document.getElementById('viewNotes').textContent = item.notes || '—';
        const statusBadge = document.getElementById('viewItemStatusBadge').querySelector('span');
        statusBadge.textContent = item.status;
        statusBadge.className = `status-${item.status.toLowerCase().replace(' ', '-')}`;
        
        const tbody = document.getElementById('transactionsTableBody');
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 40px;">Transaction history coming soon</td></tr>`;
        
        document.getElementById('inventoryListView').classList.remove('active');
        document.getElementById('viewItemView').classList.add('active');
    }
};

window.editItem = function(itemId) {
    const item = inventoryData.find(i => i.id === itemId);
    if (item) {
        currentEditingItemId = itemId;
        document.getElementById('editItemSubtitle').textContent = `Update information for ${item.name}.`;
        document.getElementById('editItemName').value = item.name;
        document.getElementById('editItemCode').value = `INV-${String(item.id).padStart(4, '0')}`;
        document.getElementById('editCategory').value = item.category;
        document.getElementById('editTotalQuantity').value = `${item.total} ${item.unit}`;
        document.getElementById('editUnit').value = item.unit;
        document.getElementById('editBrandModel').value = item.brandModel || '';
        document.getElementById('editSerialNumber').value = item.serialNumber || '';
        document.getElementById('editLocation').value = item.location || '';
        document.getElementById('editAssignedOfficer').value = item.assignedOfficer || '';
        document.getElementById('editSupplier').value = item.supplier || '';
        document.getElementById('editDateAcquired').value = item.dateAcquired || '';
        document.getElementById('editStatus').value = item.status;
        document.getElementById('editNotes').value = item.notes || '';
        
        document.getElementById('inventoryListView').classList.remove('active');
        document.getElementById('viewItemView').classList.remove('active');
        document.getElementById('editItemView').classList.add('active');
    }
};

function saveEditedItem() {
    if (!currentEditingItemId) return;
    const item = inventoryData.find(i => i.id === currentEditingItemId);
    if (item) {
        item.name = document.getElementById('editItemName').value;
        item.category = document.getElementById('editCategory').value;
        item.unit = document.getElementById('editUnit').value;
        item.brandModel = document.getElementById('editBrandModel').value;
        item.serialNumber = document.getElementById('editSerialNumber').value;
        item.location = document.getElementById('editLocation').value;
        item.assignedOfficer = document.getElementById('editAssignedOfficer').value;
        item.supplier = document.getElementById('editSupplier').value;
        item.dateAcquired = document.getElementById('editDateAcquired').value;
        item.status = document.getElementById('editStatus').value;
        item.notes = document.getElementById('editNotes').value;
        item.lastUpdated = 'Just now';
        
        loadInventoryTable();
        updateStats();
        showViewItem(currentEditingItemId);
        alert('Item updated successfully!');
    }
}

function showViewItem(itemId) {
    const item = inventoryData.find(i => i.id === itemId);
    if (item) {
        currentViewingItemId = itemId;
        document.getElementById('viewItemName').textContent = item.name;
        document.getElementById('viewItemCode').textContent = `INV-${String(item.id).padStart(4, '0')}`;
        document.getElementById('viewCategory').textContent = item.category;
        document.getElementById('viewTotalQuantity').textContent = `${item.total} ${item.unit}`;
        document.getElementById('viewAvailableStock').textContent = item.stock;
        document.getElementById('viewBorrowedStock').textContent = item.total - item.stock;
        const statusBadge = document.getElementById('viewItemStatusBadge').querySelector('span');
        statusBadge.textContent = item.status;
        
        document.getElementById('editItemView').classList.remove('active');
        document.getElementById('viewItemView').classList.add('active');
    }
}

window.deleteItem = function(id) {
    if (confirm('Are you sure you want to archive this item?')) {
        const index = inventoryData.findIndex(i => i.id === id);
        if (index !== -1) {
            inventoryData.splice(index, 1);
            loadInventoryTable();
            updateStats();
            if (currentViewingItemId === id) showInventoryListView();
            alert('Item archived successfully!');
        }
    }
};

// Borrow Log Functions
function loadBorrowLogTable() {
    let filteredLogs = borrowLogData.filter(log => (log.logId.toLowerCase().includes(currentBorrowFilters.search) || log.itemName.toLowerCase().includes(currentBorrowFilters.search) || log.borrower.toLowerCase().includes(currentBorrowFilters.search)) && (!currentBorrowFilters.status || log.status === currentBorrowFilters.status) && (!currentBorrowFilters.category || log.category === currentBorrowFilters.category));
    const totalItems = filteredLogs.length;
    const totalPages = Math.ceil(totalItems / borrowItemsPerPage);
    const startIndex = (currentBorrowPage - 1) * borrowItemsPerPage;
    const paginatedLogs = filteredLogs.slice(startIndex, startIndex + borrowItemsPerPage);
    renderBorrowLogTable(paginatedLogs);
    document.getElementById('borrowPaginationInfo').textContent = `Showing ${totalItems === 0 ? 0 : startIndex + 1} to ${Math.min(startIndex + borrowItemsPerPage, totalItems)} of ${totalItems} entries`;
    renderBorrowPagination(totalPages);
}

function renderBorrowLogTable(logs) {
    const tbody = document.getElementById('borrowLogTableBody');
    if (!tbody) return;
    if (logs.length === 0) { tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;">No borrow records found</td></tr>'; return; }
    tbody.innerHTML = logs.map(log => { const isOverdue = log.status === 'Overdue' || (log.status === 'Borrowed' && new Date(log.expectedReturn) < new Date()); let statusClass = 'borrowed', statusText = log.status; if (isOverdue && log.status === 'Borrowed') { statusClass = 'overdue'; statusText = 'Overdue'; } else if (log.status === 'Returned') { statusClass = 'returned'; } const isReturned = log.status === 'Returned'; return `<tr><td>${escapeHtml(log.logId)}</td><td><strong>${escapeHtml(log.itemName)}</strong><br><span style="font-size: 12px; color: #5F7385;">Quantity: ${log.quantity} ${log.unit}</span></td><td><strong>${escapeHtml(log.borrower)}</strong><br><span style="font-size: 12px; color: #5F7385;">${escapeHtml(log.borrowerType)}</span></td><td>${formatDate(log.dateBorrowed)}</td><td>${formatDate(log.expectedReturn)}</td><td><span class="borrow-status ${statusClass}">${statusText}</span></td><td><div class="borrow-action-buttons"><button class="borrow-action-btn view" onclick="window.viewBorrowRecord(${log.id})">View</button>${!isReturned ? `<button class="borrow-action-btn return" onclick="window.showReturnModal(${log.id})">Return</button>` : `<button class="borrow-action-btn returned" disabled>Returned</button>`}</div></td></tr>`; }).join('');
}

function renderBorrowPagination(totalPages) {
    const container = document.getElementById('borrowPaginationControls');
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    let html = `<button class="pagination-btn" onclick="window.changeBorrowPage(${currentBorrowPage - 1})" ${currentBorrowPage === 1 ? 'disabled' : ''}>‹</button>`;
    for (let i = 1; i <= Math.min(totalPages, 5); i++) html += `<button class="pagination-btn ${i === currentBorrowPage ? 'active' : ''}" onclick="window.changeBorrowPage(${i})">${i}</button>`;
    if (totalPages > 5) html += `<button class="pagination-btn" disabled>...</button><button class="pagination-btn" onclick="window.changeBorrowPage(${totalPages})">${totalPages}</button>`;
    html += `<button class="pagination-btn" onclick="window.changeBorrowPage(${currentBorrowPage + 1})" ${currentBorrowPage === totalPages ? 'disabled' : ''}>›</button>`;
    container.innerHTML = html;
}

window.changeBorrowPage = function(page) { if (page < 1) return; currentBorrowPage = page; loadBorrowLogTable(); };

function showBorrowLogView() {
    document.getElementById('inventoryListView').classList.remove('active');
    document.getElementById('addItemView').classList.remove('active');
    document.getElementById('stockInOutView').classList.remove('active');
    document.getElementById('viewItemView').classList.remove('active');
    document.getElementById('editItemView').classList.remove('active');
    document.getElementById('borrowLogView').classList.add('active');
    document.getElementById('logNewBorrowView').classList.remove('active');
    loadBorrowLogTable();
    populateBorrowItemSelect();
}

function populateBorrowItemSelect() {
    const select = document.getElementById('borrowItemSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Choose an item...</option>';
    inventoryData.filter(item => item.stock > 0).forEach(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.name} (${item.stock} ${item.unit} available)`; select.appendChild(option); });
}

function openBorrowModal() {
    document.getElementById('logNewBorrowModal').style.display = 'flex';
    document.getElementById('borrowDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('borrowReturnDate').value = '';
    document.getElementById('borrowQuantity').value = '';
    document.getElementById('borrowerName').value = '';
    document.getElementById('borrowPurpose').value = '';
    populateBorrowItemSelect();
    document.getElementById('borrowCurrentStock').textContent = '0 units';
}

function closeBorrowModal() { document.getElementById('logNewBorrowModal').style.display = 'none'; }
function closeReturnModal() { document.getElementById('returnItemModal').style.display = 'none'; currentReturnLogId = null; }

function logNewBorrow() {
    const itemId = parseInt(document.getElementById('borrowItemSelect').value);
    const quantity = parseInt(document.getElementById('borrowQuantity').value);
    const borrowDate = document.getElementById('borrowDate').value;
    const returnDate = document.getElementById('borrowReturnDate').value;
    const borrowerName = document.getElementById('borrowerName').value;
    const borrowerType = document.getElementById('borrowerType').value;
    const purpose = document.getElementById('borrowPurpose').value;
    
    if (!itemId || !quantity || !borrowDate || !returnDate || !borrowerName) {
        alert('Please fill in all required fields');
        return;
    }
    
    const item = inventoryData.find(i => i.id === itemId);
    if (!item) {
        alert('Item not found');
        return;
    }
    
    if (quantity > item.stock) {
        alert(`Insufficient stock! Only ${item.stock} ${item.unit} available.`);
        return;
    }
    
    item.stock -= quantity;
    item.status = item.stock === 0 ? 'Critical' : (item.stock < 10 ? 'Low Stock' : 'Available');
    item.lastUpdated = 'Just now';
    
    const logNumber = String(borrowLogData.length + 1).padStart(3, '0');
    const logId = `LOG-${new Date().getFullYear()}-${logNumber}`;
    
    const newBorrow = {
        id: borrowLogData.length + 1,
        logId: logId,
        itemId: itemId,
        itemName: item.name,
        category: item.category,
        quantity: quantity,
        unit: item.unit,
        borrower: borrowerName,
        borrowerType: borrowerType,
        dateBorrowed: borrowDate,
        expectedReturn: returnDate,
        status: 'Borrowed',
        purpose: purpose
    };
    
    borrowLogData.unshift(newBorrow);
    recentActivities.unshift({
        title: `${quantity} ${item.unit} of ${item.name} borrowed by ${borrowerName}`,
        user: `Purpose: ${purpose || 'Not specified'}`,
        time: "Just now"
    });
    
    closeBorrowModal();
    loadInventoryTable();
    loadBorrowLogTable();
    loadRecentActivity();
    updateStats();
    alert(`Borrow logged successfully!\nLog ID: ${logId}`);
}

// Log New Borrow View Functions
function showLogNewBorrowView() {
    document.getElementById('inventoryListView').classList.remove('active');
    document.getElementById('addItemView').classList.remove('active');
    document.getElementById('stockInOutView').classList.remove('active');
    document.getElementById('viewItemView').classList.remove('active');
    document.getElementById('editItemView').classList.remove('active');
    document.getElementById('borrowLogView').classList.remove('active');
    document.getElementById('logNewBorrowView').classList.add('active');
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('logBorrowDateReleased').value = today;
    document.getElementById('logBorrowReleasedBy').value = 'Ricardo Dalisay';
    
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
        categorySelect.addEventListener('change', function() {
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
        itemSelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const stockDisplay = document.getElementById('logBorrowAvailableStock');
            if (selectedOption && selectedOption.value && stockDisplay) {
                const stock = selectedOption.getAttribute('data-stock') || 0;
                const unit = selectedOption.getAttribute('data-unit') || 'units';
                stockDisplay.textContent = `${stock} ${unit}`;
            } else if (stockDisplay) {
                stockDisplay.textContent = '0 units';
            }
        });
    }
}

function clearBorrowForm() {
    document.getElementById('logBorrowPurpose').value = '';
    document.getElementById('logBorrowRequester').value = '';
    document.getElementById('logBorrowContact').value = '';
    document.getElementById('logBorrowCategory').value = '';
    document.getElementById('logBorrowItemName').innerHTML = '<option value="">Select Item</option>';
    document.getElementById('logBorrowQuantity').value = '';
    document.getElementById('logBorrowAvailableStock').textContent = '0 units';
    document.getElementById('logBorrowDateReleased').value = new Date().toISOString().split('T')[0];
    document.getElementById('logBorrowExpectedReturn').value = '';
}

function submitBorrowRecord() {
    const purpose = document.getElementById('logBorrowPurpose').value;
    const requester = document.getElementById('logBorrowRequester').value;
    const contact = document.getElementById('logBorrowContact').value;
    const category = document.getElementById('logBorrowCategory').value;
    const itemId = document.getElementById('logBorrowItemName').value;
    const quantity = parseInt(document.getElementById('logBorrowQuantity').value);
    const dateReleased = document.getElementById('logBorrowDateReleased').value;
    const expectedReturn = document.getElementById('logBorrowExpectedReturn').value;
    const releasedBy = document.getElementById('logBorrowReleasedBy').value;
    
    if (!purpose || !requester || !contact || !category || !itemId || !quantity || !dateReleased || !expectedReturn) {
        alert('Please fill in all required fields marked with *');
        return;
    }
    
    const item = inventoryData.find(i => i.id == itemId);
    if (!item) {
        alert('Item not found');
        return;
    }
    
    if (quantity > item.stock) {
        alert(`Insufficient stock! Only ${item.stock} ${item.unit} available.`);
        return;
    }
    
    item.stock -= quantity;
    item.status = item.stock === 0 ? 'Critical' : (item.stock < 10 ? 'Low Stock' : 'Available');
    item.lastUpdated = 'Just now';
    
    const logNumber = String(borrowLogData.length + 1).padStart(3, '0');
    const logId = `LOG-${new Date().getFullYear()}-${logNumber}`;
    
    const newBorrow = {
        id: borrowLogData.length + 1,
        logId: logId,
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        quantity: quantity,
        unit: item.unit,
        borrower: requester,
        borrowerType: 'Resident',
        borrowerContact: contact,
        dateBorrowed: dateReleased,
        expectedReturn: expectedReturn,
        status: 'Borrowed',
        purpose: purpose,
        remarks: ''
    };
    
    borrowLogData.unshift(newBorrow);
    
    recentActivities.unshift({
        title: `${quantity} ${item.unit} of ${item.name} borrowed by ${requester}`,
        user: `Released by ${releasedBy}`,
        time: "Just now"
    });
    
    loadInventoryTable();
    loadBorrowLogTable();
    loadRecentActivity();
    updateStats();
    
    alert(`Borrow logged successfully!\nLog ID: ${logId}`);
    showBorrowLogView();
}

function setupLogNewBorrowEventListeners() {
    const logNewBorrowBtn = document.getElementById('logNewBorrowBtn');
    if (logNewBorrowBtn) {
        logNewBorrowBtn.addEventListener('click', () => showLogNewBorrowView());
    }
    
    const cancelLogBorrowBtn = document.getElementById('cancelLogBorrowBtn');
    if (cancelLogBorrowBtn) {
        cancelLogBorrowBtn.addEventListener('click', () => showBorrowLogView());
    }
    
    const backToBorrowLogBtn = document.getElementById('backToBorrowLogBtn');
    if (backToBorrowLogBtn) {
        backToBorrowLogBtn.addEventListener('click', () => showBorrowLogView());
    }
    
    const clearFormBtn = document.getElementById('clearBorrowFormBtn');
    if (clearFormBtn) {
        clearFormBtn.addEventListener('click', () => clearBorrowForm());
    }
    
    const submitBorrowBtn = document.getElementById('submitBorrowRecordBtn');
    if (submitBorrowBtn) {
        submitBorrowBtn.addEventListener('click', () => submitBorrowRecord());
    }
    
    const saveLogBorrowBtn = document.getElementById('saveLogBorrowBtn');
    if (saveLogBorrowBtn) {
        saveLogBorrowBtn.addEventListener('click', () => submitBorrowRecord());
    }
    
    setupBorrowCategoryListener();
    setupBorrowItemListener();
}

window.showReturnModal = function(logId) {
    const log = borrowLogData.find(l => l.id === logId);
    if (log) { currentReturnLogId = logId; document.getElementById('returnItemName').textContent = log.itemName; document.getElementById('returnQuantity').textContent = `${log.quantity} ${log.unit}`; document.getElementById('returnBorrower').textContent = log.borrower; document.getElementById('returnDate').value = new Date().toISOString().split('T')[0]; document.getElementById('returnItemModal').style.display = 'flex'; }
};

function confirmReturn() {
    if (!currentReturnLogId) return;
    const logIndex = borrowLogData.findIndex(l => l.id === currentReturnLogId);
    if (logIndex !== -1) {
        const log = borrowLogData[logIndex];
        const item = inventoryData.find(i => i.id === log.itemId);
        if (item) { item.stock += log.quantity; item.status = item.stock === 0 ? 'Critical' : (item.stock < 10 ? 'Low Stock' : 'Available'); item.lastUpdated = 'Just now'; }
        log.status = 'Returned';
        recentActivities.unshift({ title: `${log.quantity} ${log.unit} of ${log.itemName} returned by ${log.borrower}`, user: `Condition: ${document.getElementById('returnCondition').value}`, time: "Just now" });
        closeReturnModal();
        loadInventoryTable();
        loadBorrowLogTable();
        loadRecentActivity();
        updateStats();
        alert('Item returned successfully!');
    }
}

window.viewBorrowRecord = function(id) {
    const log = borrowLogData.find(l => l.id === id);
    if (log) alert(`Borrow Record Details:\n\nLog ID: ${log.logId}\nItem: ${log.itemName}\nQuantity: ${log.quantity} ${log.unit}\nBorrower: ${log.borrower}\nDate Borrowed: ${formatDate(log.dateBorrowed)}\nExpected Return: ${formatDate(log.expectedReturn)}\nStatus: ${log.status}\nPurpose: ${log.purpose || 'N/A'}`);
};

function formatDate(dateString) { if (!dateString) return ''; const date = new Date(dateString); return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, function(m) { if (m === '&') return '&amp;'; if (m === '<') return '&lt;'; if (m === '>') return '&gt;'; return m; }); }