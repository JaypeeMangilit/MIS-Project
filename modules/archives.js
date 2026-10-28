// Archives Module
// ============================================
//
// Wrapped in an IIFE on purpose: sidebar.js removes and re-appends this script on
// every visit to the module, and a second execution of a top-level const/let throws
// ("Identifier 'archivesData' has already been declared"), leaving the PREVIOUS
// load's state serving a freshly injected DOM (wrong tab title, stale rows).
// Nothing outside this file references its internals - the entry point and the
// onclick handlers are assigned to window below.

(function () {

// ============================================
// API HELPER
// ============================================
// Like every other module here, this file carries its own helper rather than
// relying on js/api.js (that file is only loaded by login.php, and a second
// top-level API_BASE_URL declaration would collide with the other modules).
// A failed request returns {success:false} so it can never look like a save.
const ARCHIVES_API_BASE = 'api/';

async function apiCall(endpoint, method, data) {
    const options = {
        method: method || 'GET',
        headers: { 'Content-Type': 'application/json' }
    };
    if (data) {
        options.body = JSON.stringify(data);
    }
    try {
        const response = await fetch(ARCHIVES_API_BASE + endpoint, options);
        return await response.json();
    } catch (error) {
        console.error('Archives API error:', error);
        return { success: false, message: 'Unable to reach the server. Please check your connection and try again.' };
    }
}

/** Permanently delete archived records older than 30 days. Runs silently on load. */
async function runArchiveCleanup() {
    const tables = ['residents', 'officials', 'certificates', 'users', 'blotter', 'inventory'];
    const results = await Promise.allSettled(
        tables.map(table => apiCall('cleanup_archives.php?table=' + table, 'POST'))
    );
    const cleaned = results
        .filter(r => r.status === 'fulfilled' && r.value && r.value.success)
        .map(r => r.value)
        .filter(r => r.deleted > 0);
    if (cleaned.length) {
        console.log('Archive cleanup removed ' + cleaned.map(r => r.deleted).reduce((a, b) => a + b, 0) + ' old records.');
    }
}

// Mock Archives Data
const archivesData = {
    residents: [
        { id: 1, name: "Corazon Aquino", address: "Purok 2 - Balagtas Street", residentId: "RES-0921", archivedDate: "Oct 15, 2023", archivedBy: "Juan Dela Cruz", avatar: null, initials: "CA" },
        { id: 2, name: "Andres Bonifacio", address: "Purok 5 - Mariano Street", residentId: "RES-1054", archivedDate: "Sep 28, 2023", archivedBy: "System Admin", avatar: null, initials: "AB" },
        { id: 3, name: "Jose Rizal", address: "Purok 1 - Mateo Street", residentId: "RES-1120", archivedDate: "Sep 10, 2023", archivedBy: "Juan Dela Cruz", avatar: null, initials: "JR" },
        { id: 4, name: "Gabriela Silang", address: "Purok 3 - Jimenez Street", residentId: "RES-0433", archivedDate: "Aug 22, 2023", archivedBy: "Maria Santos", avatar: null, initials: "GS" },
        { id: 5, name: "Emilio Aguinaldo", address: "Purok 4 - Rizal Street", residentId: "RES-0782", archivedDate: "Aug 5, 2023", archivedBy: "System Admin", avatar: null, initials: "EA" },
        { id: 6, name: "Melchora Aquino", address: "Purok 6 - Bonifacio Street", residentId: "RES-1145", archivedDate: "Jul 18, 2023", archivedBy: "Juan Dela Cruz", avatar: null, initials: "MA" }
    ],
    blotter: [
        { id: 1, caseNo: "BL-2023-001", complainant: "Maria Santos", respondent: "Pedro Cruz", incidentDate: "Oct 10, 2023", archivedDate: "Oct 15, 2023", archivedBy: "Admin", status: "Archived" },
        { id: 2, caseNo: "BL-2023-002", complainant: "Juan Reyes", respondent: "Lito Garcia", incidentDate: "Sep 25, 2023", archivedDate: "Sep 30, 2023", archivedBy: "Secretary", status: "Archived" }
    ],
    certificates: [
        { id: 1, certificateNo: "CERT-2023-001", residentName: "Ana Lopez", type: "Barangay Clearance", issuedDate: "Oct 1, 2023", archivedDate: "Oct 15, 2023", archivedBy: "Admin" },
        { id: 2, certificateNo: "CERT-2023-002", residentName: "Carlos Mendoza", type: "Certificate of Residency", issuedDate: "Sep 15, 2023", archivedDate: "Sep 28, 2023", archivedBy: "Secretary" }
    ],
    inventory: [
        { id: 1, itemName: "Office Chair", category: "Furniture", quantity: 5, location: "Admin Office", archivedDate: "Oct 10, 2023", archivedBy: "Admin" },
        { id: 2, itemName: "Desktop Computer", category: "Electronics", quantity: 3, location: "Computer Room", archivedDate: "Sep 20, 2023", archivedBy: "IT Staff" }
    ],
    officials: [
        { id: 1, name: "Hon. Juan Dela Cruz", position: "Barangay Captain", termStart: "2022", termEnd: "2025", archivedDate: "Oct 1, 2023", archivedBy: "Admin", initials: "JC" },
        { id: 2, name: "Hon. Maria Reyes", position: "Barangay Kagawad", termStart: "2022", termEnd: "2025", archivedDate: "Sep 15, 2023", archivedBy: "Secretary", initials: "MR" }
    ],
    
    users: [
        { id: 1, name: "John Doe", username: "johndoe", role: "Encoder", archivedDate: "Oct 12, 2023", archivedBy: "Admin", initials: "JD" },
        { id: 2, name: "Jane Smith", username: "janesmith", role: "Secretary", archivedDate: "Sep 25, 2023", archivedBy: "Admin", initials: "JS" }
    ]
};

// Column configurations for each category
const columnConfig = {
    residents: [
        { key: "name", label: "Name", type: "user" },
        { key: "address", label: "Address / Purok", type: "text" },
        { key: "archivedDate", label: "Archived Date", type: "date" },
        { key: "archivedBy", label: "Archived By", type: "text" },
        { key: "actions", label: "Actions", type: "actions" }
    ],
    blotter: [
        { key: "caseNo", label: "Case No.", type: "text" },
        { key: "complainant", label: "Complainant", type: "text" },
        { key: "respondent", label: "Respondent", type: "text" },
        { key: "archivedDate", label: "Archived Date", type: "date" },
        { key: "archivedBy", label: "Archived By", type: "text" },
        { key: "actions", label: "Actions", type: "actions" }
    ],
    certificates: [
        { key: "control_number", label: "Control No." },
        { key: "resident_name", label: "Resident Name" },
        { key: "certificate_type", label: "Certificate Type" },
        { key: "date_issued", label: "Issued Date" },
        { key: "archived_date", label: "Archived Date" },
        { key: "archived_by", label: "Archived By" },
        { key: "actions", label: "Actions", type: "actions" }
    ],
    inventory: [
        { key: "itemName", label: "Item Name", type: "text" },
        { key: "category", label: "Category", type: "text" },
        { key: "quantity", label: "Quantity", type: "text" },
        { key: "location", label: "Location", type: "text" },
        { key: "archivedDate", label: "Archived Date", type: "date" },
        { key: "archivedBy", label: "Archived By", type: "text" },
        { key: "actions", label: "Actions", type: "actions" }
    ],
    officials: [
        { key: "name", label: "Name", type: "user" },
        { key: "position", label: "Position", type: "text" },
        { key: "termStart", label: "Term Start", type: "text" },
        { key: "termEnd", label: "Term End", type: "text" },
        { key: "archivedDate", label: "Archived Date", type: "date" },
        { key: "archivedBy", label: "Archived By", type: "text" },
        { key: "actions", label: "Actions", type: "actions" }
    ],
   
    users: [
        { key: "name", label: "Name", type: "user" },
        { key: "username", label: "Username", type: "text" },
        { key: "role", label: "Role", type: "text" },
        { key: "archivedDate", label: "Archived Date", type: "date" },
        { key: "archivedBy", label: "Archived By", type: "text" },
        { key: "actions", label: "Actions", type: "actions" }
    ],
    blotter: [
        { key: "caseNo", label: "Case No.", type: "text" },
        { key: "complainant", label: "Complainant", type: "text" },
        { key: "respondent", label: "Respondent", type: "text" },
        { key: "status", label: "Status", type: "text" },
        { key: "archivedDate", label: "Archived Date", type: "date" },
        { key: "archivedBy", label: "Archived By", type: "text" },
        { key: "actions", label: "Actions", type: "actions" }
    ]
};

// Titles for each category
const categoryTitles = {
    residents: "Archived Residents",
    blotter: "Archived Blotter Cases",
    certificates: "Archived Certificates",
    inventory: "Archived Inventory Items",
    officials: "Archived Barangay Officials",
    users: "Archived Users"
};

// Current state
let currentCategory = "residents";
let currentPage = 1;
let rowsPerPage = 4;
let searchTerm = "";

// Certificates archive: real rows from archived_certificate_issuances, loaded from
// api/certificates.php?archived=1. Every other category above still renders the
// mock archivesData.
let certificateArchive = { rows: [], total: 0, totalPages: 1, page: 1 };

/** Escape a value before it goes into the table markup. */
function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** "2026-10-20" (or a stored datetime) -> "Oct 20, 2026". */
function formatArchiveDate(value) {
    const raw = String(value === null || value === undefined ? '' : value).trim();
    if (!raw) return '—';
    const date = new Date(raw.indexOf('T') !== -1 ? raw.replace(' ', 'T') : raw);
    if (isNaN(date.getTime())) return escapeHtml(raw);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Initialize the module - Called by sidebar.js
window.initArchives = function() {
    console.log("Initializing Archives Module");
    setupEventListeners();
    runArchiveCleanup();
    loadArchivesTable();
};

// Setup event listeners
function setupEventListeners() {
    // Tab clicks
    const tabs = document.querySelectorAll('.tab-item');
    tabs.forEach(tab => {
        tab.removeEventListener('click', handleTabClick);
        tab.addEventListener('click', handleTabClick);
    });
    
    // Search input
    const searchInput = document.getElementById('archiveSearchInput');
    if (searchInput) {
        searchInput.removeEventListener('input', handleSearch);
        searchInput.addEventListener('input', handleSearch);
    }
}

function handleTabClick(e) {
    const tab = e.currentTarget;
    const category = tab.getAttribute('data-category');
    
    // Update active tab
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Update current category
    currentCategory = category;
    currentPage = 1;
    searchTerm = "";
    
    // Clear search input
    const searchInput = document.getElementById('archiveSearchInput');
    if (searchInput) searchInput.value = "";
    
    // Update table title
    const tableTitle = document.getElementById('tableTitle');
    if (tableTitle) tableTitle.textContent = categoryTitles[category] || "Archived Items";
    
    // Reload table
    loadArchivesTable();
}

function handleSearch(e) {
    searchTerm = e.target.value.toLowerCase();
    currentPage = 1;
    loadArchivesTable();
}

function loadArchivesTable() {
    // Real archive tables are read through the API; categories without one (blotter,
    // inventory) still render the mock archivesData above.
    if (isDbBacked(currentCategory)) {
        loadDbArchive(currentCategory);
        return;
    }

    // Get data for current category
    let data = archivesData[currentCategory] || [];
    
    // Filter by search term
    if (searchTerm) {
        data = data.filter(item => {
            return Object.values(item).some(value => 
                String(value).toLowerCase().includes(searchTerm)
            );
        });
    }
    
    // Calculate pagination
    const totalItems = data.length;
    const totalPages = Math.ceil(totalItems / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginatedData = data.slice(startIndex, startIndex + rowsPerPage);
    
    // Render table headers
    renderTableHeaders();
    
    // Render table body
    renderTableBody(paginatedData);
    
    // Update pagination info
    updatePaginationInfo(startIndex, paginatedData.length, totalItems);
    
    // Render pagination controls
    renderPaginationControls(totalPages);
}

function renderTableHeaders() {
    const thead = document.querySelector('#archivesTableBody')?.closest('table')?.querySelector('thead tr');
    if (!thead) return;

    // Database-backed tabs own their own column list.
    if (isDbBacked(currentCategory)) {
        thead.innerHTML = dbArchiveConfig[currentCategory].columns
            .map(col => `<th>${col}</th>`).join('');
        return;
    }
    
    const columns = columnConfig[currentCategory] || [];
    thead.innerHTML = columns.map(col => `<th>${col.label}</th>`).join('');
}

// ============================================
// DATABASE-BACKED ARCHIVE TABS
// ============================================
// Certificates, Residents, Officials and User Management read their archived rows
// from their real archive tables and restore through their own endpoint. Blotter and
// Inventory still render the mock archivesData above - they have no archive table yet,
// so they must keep the mock path.

const dbArchiveConfig = {
    certificates: {
        label: 'certificates',
        endpoint: 'certificates.php?archived=1',
        restoreFile: 'certificates.php',
        deleteFile: 'certificates.php',
        restoreTitle: 'Restore this certificate back to the Certificates module?',
        columns: ['Control No.', 'Resident Name', 'Certificate Type', 'Issued Date', 'Archived Date', 'Archived By', 'Actions'],
        cells: (item) => [
            item.control_number,
            item.resident_name,
            item.certificate_type,
            formatArchiveDate(item.date_issued),
            formatArchiveDate(item.archived_date),
            item.archived_by,
        ],
        name: (item) => item.resident_name,
        emptyText: 'No archived certificates found',
    },
    residents: {
        label: 'residents',
        endpoint: 'residents.php?archived=1',
        restoreFile: 'residents.php',
        deleteFile: 'residents.php',
        restoreTitle: 'Restore this resident back to the Residents module?',
        columns: ['Name', 'Resident ID', 'Purok', 'Status', 'Archived Date', 'Archived By', 'Actions'],
        cells: (item) => [
            archiveResidentName(item),
            item.resident_id,
            item.purok,
            item.resident_status,
            formatArchiveDate(item.archived_at),
            item.archived_by,
        ],
        name: (item) => archiveResidentName(item),
        emptyText: 'No archived residents found',
    },
    officials: {
        label: 'officials',
        endpoint: 'officials.php?archived=1',
        restoreFile: 'officials.php',
        deleteFile: 'officials.php',
        restoreTitle: 'Restore this official back to the Officials module?',
        columns: ['Name', 'Position', 'Term', 'Archived Date', 'Archived By', 'Actions'],
        cells: (item) => [
            archiveOfficialName(item),
            item.position,
            officialArchiveTerm(item),
            formatArchiveDate(item.archived_at),
            item.archived_by,
        ],
        name: (item) => archiveOfficialName(item),
        emptyText: 'No archived officials found',
    },
    users: {
        label: 'users',
        // Archived accounts are flagged in place (status = 'Archived'), not moved to the
        // archive table, so the activity trail stays attached to a real account.
        endpoint: 'users.php?archived=1',
        restoreFile: 'users.php',
        deleteFile: 'users.php',
        restoreTitle: 'Restore this account back to User Management?',
        columns: ['Name', 'Username', 'Role', 'Archived Date', 'Archived By', 'Actions'],
        cells: (item) => [
            archiveUserName(item),
            item.username,
            item.role,
            formatArchiveDate(item.archived_at),
            item.archived_by,
        ],
        name: (item) => archiveUserName(item),
        emptyText: 'No archived users found',
    },
    blotter: {
        label: 'blotter',
        endpoint: 'blotter.php?archived=1',
        restoreFile: 'blotter.php',
        deleteFile: 'blotter.php',
        restoreTitle: 'Restore this blotter case back to the Blotter module?',
        columns: ['Case No.', 'Complainant', 'Respondent', 'Status', 'Incident Date', 'Archived Date', 'Archived By', 'Actions'],
        cells: (item) => [
            item.case_number,
            item.complainant_name,
            item.respondent_name,
            item.status,
            formatArchiveDate(item.incident_date),
            formatArchiveDate(item.archived_at),
            item.archived_by,
        ],
        name: (item) => item.case_number,
        emptyText: 'No archived blotter cases found',
    },
    inventory: {
        label: 'inventory',
        endpoint: 'inventory.php?archived=1',
        restoreFile: 'inventory.php',
        deleteFile: 'inventory.php',
        restoreTitle: 'Restore this item back to the Inventory module?',
        columns: ['Item Name', 'Category', 'Quantity', 'Location', 'Archived Date', 'Archived By', 'Actions'],
        cells: (item) => [
            item.item_name || '—',
            item.category || '—',
            item.quantity ?? '—',
            item.location || '—',
            formatArchiveDate(item.archived_at),
            item.archived_by || '—',
        ],
        name: (item) => item.item_name,
        emptyText: 'No archived inventory items found',
    },
};

/** Whether the current tab reads real rows. */
function isDbBacked(category) {
    return Object.prototype.hasOwnProperty.call(dbArchiveConfig, category);
}

/** "Last, First Suffix" for an archived resident. */
function archiveResidentName(item) {
    const parts = [item.last_name, item.first_name, item.suffix].filter(function (part) {
        return String(part || '').trim() !== '';
    });
    return parts.length ? parts.join(', ').replace(',  ', ', ') : '—';
}

/** "First Middle Last Suffix" for an archived official. */
function archiveOfficialName(item) {
    const parts = [item.first_name, item.middle_name, item.last_name, item.suffix].filter(function (part) {
        return String(part || '').trim() !== '';
    });
    return parts.length ? parts.join(' ') : '—';
}

/** "First Middle Last Suffix" for an archived user. */
function archiveUserName(item) {
    const parts = [item.first_name, item.middle_name, item.last_name, item.suffix].filter(function (part) {
        return String(part || '').trim() !== '';
    });
    return parts.length ? parts.join(' ') : (item.username || '—');
}

/** Term label for an archived official. */
function officialArchiveTerm(item) {
    const start = item.term_start ? String(item.term_start).slice(0, 10) : '';
    const end = item.term_end ? String(item.term_end).slice(0, 10) : '';
    return start && end ? start + ' - ' + end : (end || start || '—');
}

/** The shared empty-state markup. */
function archiveEmptyState(colspan, text) {
    return `
        <tr>
            <td colspan="${colspan}" style="text-align: center; padding: 60px 20px;">
                <div class="empty-state">
                    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                        <rect x="25" y="25" width="30" height="30" rx="4" stroke="#D6E2EA" stroke-width="2"/>
                        <path d="M40 35V45M35 40H45" stroke="#D6E2EA" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <h4>${escapeHtml(text)}</h4>
                    <p>Try adjusting your search or filter criteria.</p>
                </div>
            </td>
        </tr>
    `;
}

/** One archived row: the config's cells plus a Restore action. */
function renderDbArchiveRow(item, config) {
    const cells = config.cells(item);

    return `
        <tr>
            ${cells.map(function (cell) {
                return `<td class="text-cell">${escapeHtml(cell === null || cell === undefined ? '—' : cell)}</td>`;
            }).join('')}
            <td>${dbArchiveActions(item, config)}</td>
        </tr>
    `;
}

/** Restore icon for a database-backed archive row. */
function dbArchiveActions(item, config) {
    return `
        <div class="action-buttons-archive">
            <div class="action-icon-archive restore" onclick="window.restoreArchiveItem('${escapeHtml(config.category)}', ${item.id})" title="Restore to ${escapeHtml(config.restoreTitle)}">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3 5H15M3 5V15C3 16.5 4 17 5 17H13C14 17 15 16.5 15 15V5" stroke="#0F6CBD" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M6 2H12" stroke="#0F6CBD" stroke-width="1.5" stroke-linecap="round"/>
                    <rect x="7" y="8" width="4" height="6" stroke="#0F6CBD" stroke-width="1.5" rx="0.5"/>
                </svg>
            </div>
            <div class="action-icon-archive delete" onclick="window.permanentlyDeleteArchiveItem('${escapeHtml(config.category)}', ${item.id})" title="Permanently Delete">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3 5H15M3 5V15C3 16.5 4 17 5 17H13C14 17 15 16.5 15 15V5" stroke="#C94A4A" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M6 2H12" stroke="#C94A4A" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M7 8V13M11 8V13" stroke="#C94A4A" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </div>
        </div>
    `;
}

/** Load a database-backed archive tab. */
async function loadDbArchive(category) {
    const config = dbArchiveConfig[category];
    config.category = category;
    const tbody = document.getElementById('archivesTableBody');

    renderTableHeaders();

    tbody.innerHTML = `<tr><td colspan="${config.columns.length}" class="text-cell" style="text-align: center; padding: 60px 20px; color: #5F7385;">Loading…</td></tr>`;

    const result = await apiCall(config.endpoint + '&page=' + currentPage
        + '&limit=' + rowsPerPage
        + (searchTerm ? '&search=' + encodeURIComponent(searchTerm) : ''));

    if (!result || !result.success) {
        tbody.innerHTML = `<tr><td colspan="${config.columns.length}" class="text-cell" style="text-align: center; padding: 60px 20px; color: #5F7385;">${
            escapeHtml((result && result.message) || 'The archived records could not be loaded.')
        }</td></tr>`;
        updatePaginationInfo(0, 0, 0);
        renderPaginationControls(0);
        return;
    }

    const rows = result.data || [];

    if (rows.length === 0) {
        tbody.innerHTML = archiveEmptyState(config.columns.length, config.emptyText);
        updatePaginationInfo(0, 0, 0);
        renderPaginationControls(0);
        return;
    }

    tbody.innerHTML = rows.map(function (item) {
        return renderDbArchiveRow(item, config);
    }).join('');

    updatePaginationInfo((currentPage - 1) * rowsPerPage, rows.length, result.total || rows.length);
    renderPaginationControls(result.totalPages || 1);
}

/** Load the archived certificates from api/certificates.php?archived=1. */
async function loadCertificateArchive() {
    renderTableHeaders();

    const tbody = document.getElementById('archivesTableBody');
    const columns = columnConfig.certificates.length;

    tbody.innerHTML = `<tr><td colspan="${columns}" class="text-cell" style="text-align: center; padding: 60px 20px; color: #5F7385;">Loading archived certificates…</td></tr>`;

    const endpoint = 'certificates.php?archived=1&page=' + currentPage
        + '&limit=' + rowsPerPage
        + (searchTerm ? '&search=' + encodeURIComponent(searchTerm) : '');

    const result = await apiCall(endpoint);

    if (!result || !result.success) {
        tbody.innerHTML = `<tr><td colspan="${columns}" class="text-cell" style="text-align: center; padding: 60px 20px; color: #5F7385;">${
            escapeHtml((result && result.message) || 'The archived certificates could not be loaded.')
        }</td></tr>`;
        updatePaginationInfo(0, 0, 0);
        renderPaginationControls(0);
        return;
    }

    certificateArchive = {
        rows: result.data || [],
        total: result.total || 0,
        totalPages: result.totalPages || 1,
        page: result.page || 1,
    };
    currentPage = certificateArchive.page;

    renderCertificateArchiveRows(certificateArchive.rows);
    updatePaginationInfo((certificateArchive.page - 1) * rowsPerPage, certificateArchive.rows.length, certificateArchive.total);
    renderPaginationControls(certificateArchive.totalPages);
}

/** Kept for the certificates tab; the generic renderer above replaced its body. */
function renderCertificateArchiveRows(rows) {
    const tbody = document.getElementById('archivesTableBody');
    const config = dbArchiveConfig.certificates;

    if (!rows || rows.length === 0) {
        tbody.innerHTML = archiveEmptyState(config.columns.length, config.emptyText);
        return;
    }

    tbody.innerHTML = rows.map(function (item) {
        return renderDbArchiveRow(item, config);
    }).join('');
}

function renderCertificateArchiveRowsLegacy(rows) {
    const tbody = document.getElementById('archivesTableBody');
    const columns = columnConfig.certificates.length;

    if (!rows || rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${columns}" style="text-align: center; padding: 60px 20px;">
                    <div class="empty-state">
                        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                            <rect x="25" y="25" width="30" height="30" rx="4" stroke="#D6E2EA" stroke-width="2"/>
                            <path d="M40 35V45M35 40H45" stroke="#D6E2EA" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        <h4>No archived certificates found</h4>
                        <p>Try adjusting your search or filter criteria.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map(renderCertificateArchiveRow).join('');
}

/** One archived certificate row. */
function renderCertificateArchiveRow(item) {
    const issued = item.date_issued ? formatArchiveDate(item.date_issued) : '—';

    return `
        <tr>
            <td class="text-cell">${escapeHtml(item.control_number || '—')}</td>
            <td class="text-cell">${escapeHtml(item.resident_name || '—')}</td>
            <td class="text-cell">${escapeHtml(item.certificate_type || '—')}</td>
            <td class="date-cell">${escapeHtml(issued)}</td>
            <td class="date-cell">${escapeHtml(item.archived_date || '—')}</td>
            <td class="text-cell">${escapeHtml(item.archived_by || '—')}</td>
            <td>${certificateArchiveActions(item)}</td>
        </tr>
    `;
}

/** Restore / delete icons for an archived certificate. */
function certificateArchiveActions(item) {
    return `
        <div class="action-buttons-archive">
            <div class="action-icon-archive restore" onclick="window.restoreCertificateArchiveItem(${item.id})" title="Restore to Certificates">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3 5H15M3 5V15C3 16.5 4 17 5 17H13C14 17 15 16.5 15 15V5" stroke="#0F6CBD" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M6 2H12" stroke="#0F6CBD" stroke-width="1.5" stroke-linecap="round"/>
                    <rect x="7" y="8" width="4" height="6" stroke="#0F6CBD" stroke-width="1.5" rx="0.5"/>
                </svg>
            </div>
            <div class="action-icon-archive delete" onclick="window.requestCertificateArchiveDelete(${item.id})" title="Permanently Delete">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3 5H15M3 5V15C3 16.5 4 17 5 17H13C14 17 15 16.5 15 15V5" stroke="#C94A4A" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M6 2H12" stroke="#C94A4A" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M7 8V13M11 8V13" stroke="#C94A4A" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </div>
        </div>
    `;
}

function renderTableBody(data) {
    const tbody = document.getElementById('archivesTableBody');
    if (!tbody) return;
    
    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${columnConfig[currentCategory].length}" style="text-align: center; padding: 60px 20px;">
                    <div class="empty-state">
                        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                            <rect x="25" y="25" width="30" height="30" rx="4" stroke="#D6E2EA" stroke-width="2"/>
                            <path d="M40 35V45M35 40H45" stroke="#D6E2EA" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        <h4>No archived records found</h4>
                        <p>Try adjusting your search or filter criteria.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = data.map(item => renderTableRow(item)).join('');
}

function renderTableRow(item) {
    const columns = columnConfig[currentCategory];
    let rowHtml = '<tr>';
    
    columns.forEach(col => {
        if (col.type === 'user') {
            rowHtml += renderUserCell(item);
        } else if (col.type === 'actions') {
            rowHtml += renderActionCell(item);
        } else {
            rowHtml += `<td class="${col.type}-cell">${item[col.key] || '—'}</td>`;
        }
    });
    
    rowHtml += '</tr>';
    return rowHtml;
}

function renderUserCell(item) {
    const name = item.name || item.officialName || item.residentName;
    const initials = item.initials || (name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '?');
    const subtitle = item.residentId || item.username || item.position || '';
    
    return `
        <td>
            <div class="user-archive-cell">
                <div class="user-avatar">
                    ${item.avatar ? 
                        `<img src="${item.avatar}" alt="${name}">` : 
                        `<div class="avatar-placeholder">${initials}</div>`
                    }
                </div>
                <div class="user-info">
                    <div class="user-name">${name || '—'}</div>
                    ${subtitle ? `<div class="user-id">${subtitle}</div>` : ''}
                </div>
            </div>
        </td>
    `;
}

function renderActionCell(item) {
    return `
        <td>
            <div class="action-buttons-archive">
                <div class="action-icon-archive restore" onclick="window.restoreArchiveItem('${currentCategory}', ${item.id})" title="Restore">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M3 5H15M3 5V15C3 16.5 4 17 5 17H13C14 17 15 16.5 15 15V5" stroke="#0F6CBD" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M6 2H12" stroke="#0F6CBD" stroke-width="1.5" stroke-linecap="round"/>
                        <rect x="7" y="8" width="4" height="6" stroke="#0F6CBD" stroke-width="1.5" rx="0.5"/>
                    </svg>
                </div>
                <div class="action-icon-archive delete" onclick="window.permanentlyDeleteArchiveItem('${currentCategory}', ${item.id})" title="Permanently Delete">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M3 5H15M3 5V15C3 16.5 4 17 5 17H13C14 17 15 16.5 15 15V5" stroke="#C94A4A" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M6 2H12" stroke="#C94A4A" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M7 8V13M11 8V13" stroke="#C94A4A" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </div>
            </div>
        </td>
    `;
}

function updatePaginationInfo(startIndex, currentCount, totalItems) {
    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        const start = totalItems === 0 ? 0 : startIndex + 1;
        const end = startIndex + currentCount;
        paginationInfo.textContent = `Showing ${start} to ${end} of ${totalItems} entries`;
    }
}

function renderPaginationControls(totalPages) {
    const container = document.getElementById('paginationControls');
    if (!container) return;
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let buttonsHtml = '';
    
    // Previous button
    buttonsHtml += `
        <button class="pagination-btn" onclick="window.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
            Previous
        </button>
    `;
    
    // Page numbers
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    
    if (endPage - startPage + 1 < maxVisible && startPage > 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        buttonsHtml += `
            <button class="pagination-btn pagination-number ${i === currentPage ? 'active' : ''}" onclick="window.changePage(${i})">
                ${i}
            </button>
        `;
    }
    
    // Next button
    buttonsHtml += `
        <button class="pagination-btn" onclick="window.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
            Next
        </button>
    `;
    
    container.innerHTML = buttonsHtml;
}

// Global functions for pagination and actions
window.changePage = function(page) {
    if (page < 1) return;
    currentPage = page;
    loadArchivesTable();
};

/** Move an archived certificate back into the Certificates module. */
window.restoreCertificateArchiveItem = async function(id) {
    if (!confirm('Restore this certificate back to the Certificates module?')) {
        return;
    }

    const result = await apiCall('certificates.php', 'POST', { action: 'restore', id: id });

    if (!result || !result.success) {
        alert((result && result.message) || 'The certificate could not be restored.');
        return;
    }

    alert(result.message || 'Certificate restored.');
    loadArchivesTable();
};

/**
 * Permanent deletion of an archived certificate is deliberately not wired up
 * yet: it needs an endpoint that deletes rows from archived_certificate_issuances,
 * which is a destructive change and needs approval first. Say so here rather than
 * pretending the row disappeared.
 */
/**
 * Permanent deletion of an archived row is deliberately not wired up: it needs an
 * endpoint that deletes rows from the archive table, which is a destructive change
 * and needs approval first. Say so here rather than pretending the row disappeared.
 */
window.requestArchiveDelete = function(category, id) {
    const label = dbArchiveConfig[category]
        ? dbArchiveConfig[category].label
        : 'this archive';
    alert('Permanent deletion for ' + label + ' is not enabled yet. Only Restore is available.');
};

// Kept for backward compatibility with the certificates-only wiring.
window.requestCertificateArchiveDelete = function(id) {
    window.requestArchiveDelete('certificates', id);
};

/**
 * Restore an archived row. Database-backed tabs call their own module endpoint; the
 * mock tabs keep the in-memory behaviour they have always had.
 */
window.restoreArchiveItem = async function(category, id) {
    if (isDbBacked(category)) {
        const config = dbArchiveConfig[category];
        const label = config.name ? config.name : 'this record';

        if (!confirm(config.restoreTitle)) {
            return;
        }

        const result = await apiCall(config.restoreFile, 'POST', { action: 'restore', id: id });

        if (!result || !result.success) {
            alert((result && result.message) || 'The record could not be restored.');
            return;
        }

        alert(result.message || 'Restored.');
        loadArchivesTable();
        return;
    }

    if (confirm('Are you sure you want to restore this item? It will be moved back to the main module.')) {
        const item = archivesData[category].find(i => i.id === id);
        if (item) {
            console.log(`Restoring ${category} item:`, item);
            // Remove from archives data
            archivesData[category] = archivesData[category].filter(i => i.id !== id);
            alert(`"${item.name || item.itemName || item.caseNo || 'Item'}" has been restored.`);
            loadArchivesTable();
        }
    }
};

window.permanentlyDeleteArchiveItem = async function(category, id) {
    // Database-backed rows are real records - never let the mock path remove one.
    if (isDbBacked(category)) {
        const config = dbArchiveConfig[category];

        // Only tabs with a configured delete endpoint can really delete; the rest say so.
        if (!config.deleteFile) {
            window.requestArchiveDelete(category, id);
            return;
        }

        if (!confirm('WARNING: this archived record will be permanently deleted and cannot be recovered. Continue?')) {
            return;
        }

        const result = await apiCall(config.deleteFile, 'POST', { action: 'delete', id: id });

        if (!result || !result.success) {
            alert((result && result.message) || 'The record could not be deleted.');
            return;
        }

        alert(result.message || 'Permanently deleted.');
        loadArchivesTable();
        return;
    }

    if (confirm('WARNING: This action cannot be undone. Are you sure you want to permanently delete this archived item?')) {
        const item = archivesData[category].find(i => i.id === id);
        if (item) {
            archivesData[category] = archivesData[category].filter(i => i.id !== id);
            alert(`"${item.name || item.itemName || item.caseNo || 'Item'}" has been permanently deleted.`);
            
            // Adjust pagination if needed
            const totalPages = Math.ceil(archivesData[category].length / rowsPerPage);
            if (currentPage > totalPages && totalPages > 0) {
                currentPage = totalPages;
            } else if (totalPages === 0) {
                currentPage = 1;
            }
            loadArchivesTable();
        }
    }
};

console.log('Archives Module loaded. Use initArchives() to initialize.');

})();