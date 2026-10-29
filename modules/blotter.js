// Wrapped in an IIFE on purpose: sidebar.js removes and re-adds this script on
// every visit, and a second top-level const/let would throw
// "Identifier has already been declared", leaving the PREVIOUS load's state
// serving a freshly injected DOM. Nothing outside this file references its
// internals - the entry point is assigned to window below.

(function () {
    'use strict';

// blotter.js - Complete with Database Integration, Beautiful Case Details, and Export Page View
//
// Wrapped in an IIFE on purpose: sidebar.js removes and re-adds this script on
// every visit, and a second top-level const/let would throw
// "Identifier has already been declared", leaving the PREVIOUS load's state
// serving a freshly injected DOM. Nothing outside this file references its
// internals - the entry point is assigned to window below.

(function () {
    'use strict';

// blotter.js - Complete with Database Integration, Beautiful Case Details, and Export Page View

const API_BASE_URL = 'api/';

let blotterData = [];
let currentPage = 1;
let itemsPerPage = 5;
let currentFilters = { search: '', caseType: '', status: '', filterDate: '' };
let currentView = 'list';
let currentEditingCaseId = null;
let pendingArchiveCaseId = null;
let totalPages = 1;
let totalCases = 0;
let exportData = [];

async function apiCall(endpoint, method = 'GET', data = null) {
    const url = API_BASE_URL + endpoint;
    const options = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (data) options.body = JSON.stringify(data);
    try {
        const response = await fetch(url, options);
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        showNotification('Network error. Please check your connection.', 'error');
        return { success: false, error: error.message };
    }
}

async function initBlotterModule() {
    console.log('Initializing Blotter Module...');
    
    // Reset all state variables
    currentPage = 1;
    currentFilters = { search: '', caseType: '', status: '', filterDate: '' };
    currentView = 'list';
    currentEditingCaseId = null;
    pendingArchiveCaseId = null;
    totalPages = 1;
    totalCases = 0;
    
    // Ensure we're showing the list view
    const listView = document.getElementById('blotterListView');
    const logCaseView = document.getElementById('logCaseView');
    const detailsView = document.getElementById('caseDetailsView');
    const editView = document.getElementById('editCaseView');
    const exportView = document.getElementById('exportBlotterView');
    
    if (listView) listView.classList.add('active');
    if (logCaseView) logCaseView.classList.remove('active');
    if (detailsView) detailsView.classList.remove('active');
    if (editView) editView.classList.remove('active');
    if (exportView) exportView.classList.remove('active');
    
    // Load data
    await loadCasesTable();
    await updateStats();
    await generateCaseNumber();
    
    // Setup event listeners
    setupEventListeners();
    setupExportViewListeners();

    if (window.applyModuleReadOnly) {
        window.applyModuleReadOnly({
            addBtnId: 'addCaseBtn',
            saveBtnIds: ['saveEditBtn'],
            editSelectors: ['.action-icon[onclick*="editCase"]', '#editCaseBtn'],
        });
    }
}

async function loadCasesTable() {
    showLoading();
    const params = new URLSearchParams({
        page: currentPage, limit: itemsPerPage,
        search: currentFilters.search || '', caseType: currentFilters.caseType || '',
        status: currentFilters.status || '', filterDate: currentFilters.filterDate || ''
    });
    const result = await apiCall(`blotter.php?${params.toString()}`);
    if (result.success !== false) {
        blotterData = result.data || [];
        totalCases = result.total || 0;
        totalPages = result.totalPages || 1;
        renderTable(blotterData);
        await updateStats();
        const startItem = totalCases === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
        const endItem = Math.min(currentPage * itemsPerPage, totalCases);
        const paginationInfo = document.getElementById('paginationInfo');
        if (paginationInfo) paginationInfo.textContent = `Showing ${startItem} to ${endItem} of ${totalCases} cases`;
        renderPagination(totalPages, currentPage);
    }
    hideLoading();
}

async function updateStats() {
    const result = await apiCall('blotter.php?limit=10000');
    if (result.success !== false && result.data) {
        const cases = result.data;
        const totalCasesEl = document.getElementById('totalCases');
        const activeCasesEl = document.getElementById('activeCases');
        const settledCasesEl = document.getElementById('settledCases');
        const escalatedCasesEl = document.getElementById('escalatedCases');
        
        if (totalCasesEl) totalCasesEl.textContent = cases.length;
        if (activeCasesEl) activeCasesEl.textContent = cases.filter(c => c.status === "Ongoing").length;
        if (settledCasesEl) settledCasesEl.textContent = cases.filter(c => c.status === "Settled").length;
        if (escalatedCasesEl) escalatedCasesEl.textContent = cases.filter(c => c.status === "Escalated").length;
    }
}

function renderTable(cases) {
    const tbody = document.getElementById('casesTableBody');
    if (!tbody) return;
    if (!cases || cases.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px;">No blotter cases found</div>`;
        return;
    }
    tbody.innerHTML = cases.map(c => `
        <tr>
            <td><div class="case-details"><div class="case-title">${escapeHtml(c.case_type || '')}</div><div class="case-id">${escapeHtml(c.case_number || '')}</div></div></div>
            <td>${escapeHtml(c.complainant_name || '')}</div>
            <td>${escapeHtml(c.respondent_name || '')}</div>
            <td><div class="incident-date"><div class="date">${formatDate(c.incident_date)}</div><div class="time">${c.incident_time || ''}</div></div></div>
            <td><span class="status-badge ${(c.status || 'ongoing').toLowerCase()}">${c.status || 'Ongoing'}</span></div>
            <td><div class="action-buttons-cell"><div class="action-icon" onclick="window.viewCase(${c.id})"><img src="Images/View_Icon.svg" alt="View"></div><div class="action-icon" onclick="window.editCase(${c.id})"><img src="Images/Edit_Icon.svg" alt="Edit"></div><div class="action-icon archive-action" onclick="window.archiveCase(${c.id})"><img src="Images/Archives_Icon.svg" alt="Archive"></div></div></div>
        </tr>
    `).join('');
}

function renderPagination(totalPages, currentPage) {
    const container = document.getElementById('paginationControls');
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    let html = `<button class="pagination-btn" onclick="window.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>`;
    for (let i = 1; i <= Math.min(totalPages, 5); i++) {
        html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="window.changePage(${i})">${i}</button>`;
    }
    html += `<button class="pagination-btn" onclick="window.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>`;
    container.innerHTML = html;
}

async function generateCaseNumber() {
    const result = await apiCall('blotter.php?limit=1');
    if (result.success !== false) {
        const nextNumber = (result.total || 0) + 1;
        const caseNumber = `BL-${new Date().getFullYear()}-${String(nextNumber).padStart(4, '0')}`;
        const caseNumberDisplay = document.getElementById('caseNumberDisplay');
        const bannerBadge = document.querySelector('.banner-badge');
        if (caseNumberDisplay) caseNumberDisplay.textContent = `Case No. ${caseNumber}`;
        if (bannerBadge) bannerBadge.textContent = `Case No. ${caseNumber}`;
    }
}

function showListView() {
    currentView = 'list';
    const listView = document.getElementById('blotterListView');
    const logCaseView = document.getElementById('logCaseView');
    const detailsView = document.getElementById('caseDetailsView');
    const editView = document.getElementById('editCaseView');
    const exportView = document.getElementById('exportBlotterView');
    
    if (listView) listView.classList.add('active');
    if (logCaseView) logCaseView.classList.remove('active');
    if (detailsView) detailsView.classList.remove('active');
    if (editView) editView.classList.remove('active');
    if (exportView) exportView.classList.remove('active');
    
    loadCasesTable();
    
    const breadcrumb = document.getElementById('breadcrumb');
    const pageTitle = document.getElementById('pageTitle');
    if (breadcrumb) breadcrumb.textContent = 'Barangay Information System / Blotter Cases';
    if (pageTitle) pageTitle.textContent = 'Blotter Management';
}

function showAddCaseView() {
    currentView = 'add';
    const listView = document.getElementById('blotterListView');
    const logCaseView = document.getElementById('logCaseView');
    const detailsView = document.getElementById('caseDetailsView');
    const editView = document.getElementById('editCaseView');
    const exportView = document.getElementById('exportBlotterView');
    
    if (listView) listView.classList.remove('active');
    if (logCaseView) logCaseView.classList.add('active');
    if (detailsView) detailsView.classList.remove('active');
    if (editView) editView.classList.remove('active');
    if (exportView) exportView.classList.remove('active');
    
    generateCaseNumber();
    resetCaseForm();
}

// ============================================
// EXPORT VIEW FUNCTIONS
// ============================================

function showExportView() {
    currentView = 'export';
    const listView = document.getElementById('blotterListView');
    const logCaseView = document.getElementById('logCaseView');
    const detailsView = document.getElementById('caseDetailsView');
    const editView = document.getElementById('editCaseView');
    const exportView = document.getElementById('exportBlotterView');
    
    if (listView) listView.classList.remove('active');
    if (logCaseView) logCaseView.classList.remove('active');
    if (detailsView) detailsView.classList.remove('active');
    if (editView) editView.classList.remove('active');
    if (exportView) exportView.classList.add('active');
    
    const breadcrumb = document.getElementById('breadcrumb');
    const pageTitle = document.getElementById('pageTitle');
    if (breadcrumb) breadcrumb.textContent = 'Barangay Information System / Blotter Cases / Export Data';
    if (pageTitle) pageTitle.textContent = 'Export Blotter Data';
    
    updateEstimatedCount();
}

async function updateEstimatedCount() {
    const caseType = document.getElementById('exportCaseTypeFilter')?.value || '';
    const month = document.getElementById('exportMonthFilter')?.value || '';
    const status = document.getElementById('exportStatusFilter')?.value || '';
    
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthText = month ? monthNames[parseInt(month)] : 'All Months';
    const statusText = status || 'All Statuses';
    const caseTypeText = caseType || 'All Types';
    
    const estimatedFiltersText = document.getElementById('estimatedFiltersText');
    if (estimatedFiltersText) {
        estimatedFiltersText.textContent = `Selected: ${monthText} | ${statusText} | ${caseTypeText}`;
    }
    
    const params = new URLSearchParams({ limit: 10000 });
    if (caseType) params.append('caseType', caseType);
    if (status) params.append('status', status);
    if (month) params.append('month', month);
    
    const result = await apiCall(`blotter.php?${params.toString()}`);
    if (result.success !== false) {
        exportData = result.data || [];
        const estimatedCount = document.getElementById('estimatedCount');
        if (estimatedCount) estimatedCount.textContent = exportData.length;
    }
}

async function generateBlotterExport() {
    const caseType = document.getElementById('exportCaseTypeFilter')?.value || '';
    const month = document.getElementById('exportMonthFilter')?.value || '';
    const status = document.getElementById('exportStatusFilter')?.value || '';
    const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'pdf';
    
    if (exportData.length === 0) {
        alert('No records found matching the selected filters.');
        return;
    }
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const fileName = `Blotter_Cases_Export_${timestamp}`;
    
    if (format === 'pdf') {
        exportBlotterToPDF(exportData, fileName);
    } else if (format === 'csv') {
        exportBlotterToCSV(exportData, fileName);
    }
    
    alert(`Exported ${exportData.length} blotter cases successfully!`);
}

function exportBlotterToPDF(cases, fileName) {
    const printWindow = window.open('', '_blank');
    const now = new Date();
    const dateGenerated = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    let html = `
        <!DOCTYPE html>
        <html>
        <head><title>${fileName}</title><meta charset="UTF-8">
        <style>
            *{margin:0;padding:0;box-sizing:border-box;}
            body{font-family:'Arial',sans-serif;padding:40px;background:white;font-size:12px;}
            .header{text-align:center;margin-bottom:30px;border-bottom:2px solid #16324A;padding-bottom:20px;}
            .header h1{color:#16324A;font-size:22px;margin-bottom:8px;text-transform:uppercase;}
            .header h2{color:#5F7385;font-size:16px;font-weight:normal;}
            .info-section{margin-bottom:25px;padding:15px;background:#F4F8FB;border-radius:5px;}
            .info-row{margin-bottom:8px;}
            .info-label{font-weight:bold;color:#16324A;width:120px;display:inline-block;}
            table{width:100%;border-collapse:collapse;margin-top:20px;font-size:11px;}
            th{background:#0F6CBD;color:white;padding:10px 8px;text-align:left;border:1px solid #0F6CBD;}
            td{padding:8px;border:1px solid #D6E2EA;color:#16324A;}
            .footer{margin-top:30px;text-align:center;font-size:11px;color:#666;}
            @media print{body{padding:20px;}th{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
        </style>
        </head>
        <body>
            <div class="header"><h1>BLOTTER CASES REPORT</h1><h2>Barangay 49 Akasya, Cavite City</h2></div>
            <div class="info-section"><div class="info-row"><span class="info-label">Date Generated:</span><span>${dateGenerated}</span></div><div class="info-row"><span class="info-label">Total Records:</span><span>${cases.length}</span></div></div>
            <table><thead><tr><th>Case No.</th><th>Case Type</th><th>Complainant</th><th>Respondent</th><th>Incident Date</th><th>Status</th></tr></thead><tbody>
    `;
    cases.forEach(c => {
        html += `<tr>
            <td>${escapeHtml(c.case_number || '')}</div>
            <td>${escapeHtml(c.case_type || '')}</div>
            <td>${escapeHtml(c.complainant_name || '')}</div>
            <td>${escapeHtml(c.respondent_name || '')}</div>
            <td>${formatDate(c.incident_date)}</div>
            <td>${c.status || '—'}</div>
        </tr>`;
    });
    html += `</tbody></table><div class="footer"><p>This is an official document from Barangay 49 Akasya Information System.</p></div></body></html>`;
    
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
}

function exportBlotterToCSV(cases, fileName) {
    const headers = ['Case Number', 'Case Type', 'Complainant', 'Complainant Contact', 'Complainant Address', 'Respondent', 'Respondent Contact', 'Respondent Address', 'Incident Date', 'Incident Time', 'Location', 'Status', 'Assigned Officer', 'Incident Summary'];
    const rows = cases.map(c => [
        c.case_number || '',
        c.case_type || '',
        c.complainant_name || '',
        c.complainant_contact || '',
        c.complainant_address || '',
        c.respondent_name || '',
        c.respondent_contact || '',
        c.respondent_address || '',
        c.incident_date || '',
        c.incident_time || '',
        c.location || '',
        c.status || '',
        c.assigned_officer || '',
        (c.incident_summary || '').replace(/,/g, ';')
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `${fileName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function setupExportViewListeners() {
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        const newExportBtn = exportBtn.cloneNode(true);
        exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
        newExportBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showExportView();
        });
    }
    
    const backBtn = document.getElementById('backToListFromExportBtn');
    if (backBtn) {
        const newBackBtn = backBtn.cloneNode(true);
        backBtn.parentNode.replaceChild(newBackBtn, backBtn);
        newBackBtn.addEventListener('click', () => showListView());
    }
    
    const cancelBtn = document.getElementById('cancelExportBtn');
    if (cancelBtn) {
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        newCancelBtn.addEventListener('click', () => showListView());
    }
    
    const generateBtn = document.getElementById('generateExportBtn');
    if (generateBtn) {
        const newGenerateBtn = generateBtn.cloneNode(true);
        generateBtn.parentNode.replaceChild(newGenerateBtn, generateBtn);
        newGenerateBtn.addEventListener('click', () => generateBlotterExport());
    }
    
    const filters = ['exportCaseTypeFilter', 'exportMonthFilter', 'exportStatusFilter'];
    filters.forEach(filterId => {
        const element = document.getElementById(filterId);
        if (element) {
            const newElement = element.cloneNode(true);
            element.parentNode.replaceChild(newElement, element);
            newElement.addEventListener('change', () => updateEstimatedCount());
        }
    });
}

// ============================================
// CASE DETAILS FUNCTIONS
// ============================================

async function showCaseDetailsView(caseId) {
    const result = await apiCall(`blotter.php?id=${caseId}`);
    if (result && result.id) {
        currentEditingCaseId = caseId;
        
        const listView = document.getElementById('blotterListView');
        const logCaseView = document.getElementById('logCaseView');
        const detailsView = document.getElementById('caseDetailsView');
        const editView = document.getElementById('editCaseView');
        const exportView = document.getElementById('exportBlotterView');
        
        if (listView) listView.classList.remove('active');
        if (logCaseView) logCaseView.classList.remove('active');
        if (detailsView) detailsView.classList.add('active');
        if (editView) editView.classList.remove('active');
        if (exportView) exportView.classList.remove('active');
        
        const detailsContent = document.getElementById('caseDetailsContent');
        if (detailsContent) {
            detailsContent.innerHTML = renderBeautifulCaseDetailsHTML(result);
        }
        
        // Re-attach event listeners after content is loaded
        setTimeout(() => {
            // Back button from case details
            const backFromDetailsBtn = document.getElementById('backFromDetailsBtn');
            if (backFromDetailsBtn) {
                const newBackBtn = backFromDetailsBtn.cloneNode(true);
                backFromDetailsBtn.parentNode.replaceChild(newBackBtn, backFromDetailsBtn);
                newBackBtn.addEventListener('click', () => showListView());
            }
            
            const settleBtn = document.getElementById('settleCaseBtn');
            const escalateBtn = document.getElementById('escalateCaseBtn');
            const editBtn = document.getElementById('editCaseBtn');
            const printBtn = document.getElementById('printCaseBtn');
            const archiveBtn = document.getElementById('archiveCaseBtn');
            
            if (settleBtn) {
                const newSettleBtn = settleBtn.cloneNode(true);
                settleBtn.parentNode.replaceChild(newSettleBtn, settleBtn);
                newSettleBtn.addEventListener('click', () => updateCaseStatus(result.id, 'Settled'));
            }
            if (escalateBtn) {
                const newEscalateBtn = escalateBtn.cloneNode(true);
                escalateBtn.parentNode.replaceChild(newEscalateBtn, escalateBtn);
                newEscalateBtn.addEventListener('click', () => updateCaseStatus(result.id, 'Escalated'));
            }
            if (editBtn) {
                const newEditBtn = editBtn.cloneNode(true);
                editBtn.parentNode.replaceChild(newEditBtn, editBtn);
                newEditBtn.addEventListener('click', () => showEditCaseView(result.id));
            }
            if (printBtn) {
                const newPrintBtn = printBtn.cloneNode(true);
                printBtn.parentNode.replaceChild(newPrintBtn, printBtn);
                newPrintBtn.addEventListener('click', () => printCaseDetails(result));
            }
            if (archiveBtn) {
                const newArchiveBtn = archiveBtn.cloneNode(true);
                archiveBtn.parentNode.replaceChild(newArchiveBtn, archiveBtn);
                newArchiveBtn.addEventListener('click', () => openArchiveModal(result.id));
            }
        }, 100);
    }
}

function renderBeautifulCaseDetailsHTML(c) {
    const statusColor = c.status === 'Ongoing' ? '#E3A008' : (c.status === 'Settled' ? '#1F8F5F' : '#C94A4A');
    const formattedDate = formatDate(c.reported_date || c.incident_date);
    
    return `
        <div class="beautiful-case-details">
            <div class="details-back-wrapper">
                <button class="back-btn" id="backFromDetailsBtn">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M12.5 15L7.5 10L12.5 5" stroke="#5F7385" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>Back to Blotter Cases List</span>
                </button>
            </div>

            <div class="case-header-card">
                <div class="case-header-left">
                    <div class="case-icon-large" style="background: #158A76;">
                        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                            <path d="M18 4L4 12L18 20L32 12L18 4Z" stroke="white" stroke-width="2.5"/>
                            <path d="M4 22L18 30L32 22" stroke="white" stroke-width="2.5"/>
                            <path d="M4 17L18 25L32 17" stroke="white" stroke-width="2.5"/>
                        </svg>
                    </div>
                    <div class="case-header-info">
                        <h1 class="case-title-large">${escapeHtml(c.case_type || '')}</h1>
                        <div class="case-badges-row">
                            <span class="status-badge-large" style="background: ${statusColor};">${c.status || 'ONGOING'}</span>
                            <span class="case-id-badge-large">${escapeHtml(c.case_number || '')}</span>
                            <div class="case-reported-date">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <circle cx="8" cy="8" r="6.5" stroke="#5F7385" stroke-width="1.33"/>
                                    <path d="M8 4V8L10 10" stroke="#5F7385" stroke-width="1.33" stroke-linecap="round"/>
                                </svg>
                                <span>Reported: ${formattedDate}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="case-header-actions">
                    <button class="btn-print-case" id="printCaseBtn">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <rect x="1.5" y="4.5" width="13" height="8" rx="1" stroke="#16324A" stroke-width="1.33"/>
                            <path d="M4 1.5H12V4.5H4V1.5Z" stroke="#16324A" stroke-width="1.33"/>
                        </svg>
                        <span>Print Report</span>
                    </button>
                    <button class="btn-edit-case" id="editCaseBtn">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M11.3333 2L14 4.66667L4.66667 14H2V11.3333L11.3333 2Z" stroke="white" stroke-width="1.33"/>
                        </svg>
                        <span>Edit</span>
                    </button>
                </div>
            </div>

            <div class="info-card">
                <div class="card-header">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M3 3H15V15H3V3Z" stroke="#0F6CBD" stroke-width="1.5"/>
                        <circle cx="9" cy="9" r="2" stroke="#0F6CBD" stroke-width="1.5"/>
                    </svg>
                    <h3>Incident Details</h3>
                </div>
                <div class="details-grid-3col">
                    <div class="detail-field"><label>Date Reported</label><span>${formattedDate}</span></div>
                    <div class="detail-field"><label>Time of Incident</label><span>${c.incident_time || '—'}</span></div>
                    <div class="detail-field"><label>Location / Area</label><span>${escapeHtml(c.location || '—')}</span></div>
                    <div class="detail-field"><label>Assigned Officer</label><span>${escapeHtml(c.assigned_officer || 'Not assigned')}</span></div>
                    <div class="detail-field"><label>Case Type</label><span>${escapeHtml(c.case_type || '—')}</span></div>
                    <div class="detail-field"><label>Schedule</label><span>${c.schedule_date ? formatDate(c.schedule_date) + (c.schedule_time ? ' at ' + c.schedule_time : '') : 'Not scheduled'}</span></div>
                    <div class="detail-field"><label>Case Status</label><span>${c.status || '—'}</span></div>
                </div>
            </div>

            <div class="info-card">
                <div class="card-header">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M3 3H15V15H3V3Z" stroke="#0F6CBD" stroke-width="1.5"/>
                        <path d="M6 6H12M6 9H12" stroke="#0F6CBD" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                    <h3>Incident Summary</h3>
                </div>
                <div class="summary-content">
                    <p>${escapeHtml(c.incident_summary || '').split('\n').join('<br>')}</p>
                </div>
            </div>

            <div class="two-column-layout">
                <div class="info-card">
                    <div class="card-header">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <circle cx="9" cy="6" r="3" stroke="#0F6CBD" stroke-width="1.5"/>
                            <path d="M3 15C3 12.5 5.5 11 9 11C12.5 11 15 12.5 15 15" stroke="#0F6CBD" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        <h3>Complainant</h3>
                    </div>
                    <div class="details-list">
                        <div class="detail-row"><label>Name</label><span>${escapeHtml(c.complainant_name || '—')}</span></div>
                        <div class="detail-row"><label>Contact Number</label><span>${escapeHtml(c.complainant_contact || 'Not provided')}</span></div>
                        <div class="detail-row"><label>Address</label><span>${escapeHtml(c.complainant_address || 'Not provided')}</span></div>
                        <div class="detail-row"><label>Relationship to Incident</label><span>${escapeHtml(c.complainant_relation || 'Not provided')}</span></div>
                    </div>
                </div>

                <div class="info-card">
                    <div class="card-header">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <circle cx="9" cy="6" r="3" stroke="#C94A4A" stroke-width="1.5"/>
                            <path d="M3 15C3 12.5 5.5 11 9 11C12.5 11 15 12.5 15 15" stroke="#C94A4A" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        <h3>Respondent</h3>
                    </div>
                    <div class="details-list">
                        <div class="detail-row"><label>Name</label><span>${escapeHtml(c.respondent_name || '—')}</span></div>
                        <div class="detail-row"><label>Contact Number</label><span>${escapeHtml(c.respondent_contact || 'Not provided')}</span></div>
                        <div class="detail-row"><label>Address</label><span>${escapeHtml(c.respondent_address || 'Not provided')}</span></div>
                        <div class="detail-row"><label>Resident Status</label><span>${escapeHtml(c.respondent_status || 'Not provided')}</span></div>
                    </div>
                </div>
            </div>

            <div class="info-card">
                <div class="card-header">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M9 1.5V4.5M9 13.5V16.5M1.5 9H4.5M13.5 9H16.5M3.75 3.75L6 6M12 12L14.25 14.25M12 6L14.25 3.75M3.75 14.25L6 12" stroke="#0F6CBD" stroke-width="1.5" stroke-linecap="round"/>
                        <circle cx="9" cy="9" r="2.25" stroke="#0F6CBD" stroke-width="1.5"/>
                    </svg>
                    <h3>Case Actions</h3>
                </div>
                <div class="case-actions-buttons">
                    ${c.status !== 'Settled' ? '<button class="btn-action-settle" id="settleCaseBtn">✓ Mark as Settled</button>' : ''}
                    ${c.status !== 'Escalated' && c.status !== 'Settled' ? '<button class="btn-action-escalate" id="escalateCaseBtn">↗ Mark as Referred / Escalated</button>' : ''}
                </div>
            </div>
        </div>
    `;
}

async function showEditCaseView(caseId) {
    const result = await apiCall(`blotter.php?id=${caseId}`);
    if (result && result.id) {
        currentEditingCaseId = caseId;
        
        const listView = document.getElementById('blotterListView');
        const logCaseView = document.getElementById('logCaseView');
        const detailsView = document.getElementById('caseDetailsView');
        const editView = document.getElementById('editCaseView');
        const exportView = document.getElementById('exportBlotterView');
        
        if (listView) listView.classList.remove('active');
        if (logCaseView) logCaseView.classList.remove('active');
        if (detailsView) detailsView.classList.remove('active');
        if (editView) editView.classList.add('active');
        if (exportView) exportView.classList.remove('active');
        
        const editTitle = document.getElementById('editCaseTitle');
        if (editTitle) editTitle.textContent = `Edit Case: ${result.case_number}`;
        
        const editIncidentDate = document.getElementById('editIncidentDate');
        const editIncidentTime = document.getElementById('editIncidentTime');
        const editLocation = document.getElementById('editLocation');
        const editCaseStatus = document.getElementById('editCaseStatus');
        const editCaseType = document.getElementById('editCaseType');
        const editAssignedOfficer = document.getElementById('editAssignedOfficer');
        const editComplainantName = document.getElementById('editComplainantName');
        const editComplainantContact = document.getElementById('editComplainantContact');
        const editComplainantAddress = document.getElementById('editComplainantAddress');
        const editComplainantRelation = document.getElementById('editComplainantRelation');
        const editRespondentName = document.getElementById('editRespondentName');
        const editRespondentContact = document.getElementById('editRespondentContact');
        const editRespondentAddress = document.getElementById('editRespondentAddress');
        const editRespondentStatus = document.getElementById('editRespondentStatus');
        const editIncidentSummary = document.getElementById('editIncidentSummary');
        
        if (editIncidentDate) editIncidentDate.value = result.incident_date || '';
        if (editIncidentTime) editIncidentTime.value = result.incident_time || '';
        if (editLocation) editLocation.value = result.location || '';
        if (editCaseStatus) editCaseStatus.value = result.status || 'Ongoing';
        if (editCaseType) editCaseType.value = result.case_type || '';
        if (editAssignedOfficer) editAssignedOfficer.value = result.assigned_officer || '';
        if (editComplainantName) editComplainantName.value = result.complainant_name || '';
        if (editComplainantContact) editComplainantContact.value = result.complainant_contact || '';
        if (editComplainantAddress) editComplainantAddress.value = result.complainant_address || '';
        if (editComplainantRelation) editComplainantRelation.value = result.complainant_relation || '';
        if (editRespondentName) editRespondentName.value = result.respondent_name || '';
        if (editRespondentContact) editRespondentContact.value = result.respondent_contact || '';
        if (editRespondentAddress) editRespondentAddress.value = result.respondent_address || '';
        if (editRespondentStatus) editRespondentStatus.value = result.respondent_status || '';
        if (editIncidentSummary) editIncidentSummary.value = result.incident_summary || '';
    }
}

async function saveEditedCase() {
    if (!currentEditingCaseId) return;
    
    const formData = {
        id: currentEditingCaseId,
        case_type: document.getElementById('editCaseType')?.value || '',
        location: document.getElementById('editLocation')?.value || '',
        incident_date: document.getElementById('editIncidentDate')?.value || '',
        incident_time: document.getElementById('editIncidentTime')?.value || '',
        complainant_name: document.getElementById('editComplainantName')?.value || '',
        complainant_contact: document.getElementById('editComplainantContact')?.value || '',
        complainant_address: document.getElementById('editComplainantAddress')?.value || '',
        complainant_relation: document.getElementById('editComplainantRelation')?.value || '',
        respondent_name: document.getElementById('editRespondentName')?.value || '',
        respondent_contact: document.getElementById('editRespondentContact')?.value || '',
        respondent_address: document.getElementById('editRespondentAddress')?.value || '',
        respondent_status: document.getElementById('editRespondentStatus')?.value || '',
        incident_summary: document.getElementById('editIncidentSummary')?.value || '',
        assigned_officer: document.getElementById('editAssignedOfficer')?.value || '',
        status: document.getElementById('editCaseStatus')?.value || 'Ongoing'
    };
    
    const requiredFields = ['case_type', 'location', 'complainant_name', 'complainant_address', 'respondent_name', 'respondent_address', 'incident_summary'];
    let isValid = true;
    requiredFields.forEach(field => { if (!formData[field]) isValid = false; });
    
    if (!isValid) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    const saveBtn = document.getElementById('saveEditBtn');
    const originalText = saveBtn?.innerHTML;
    if (saveBtn) { saveBtn.innerHTML = 'Saving...'; saveBtn.disabled = true; }
    
    const result = await apiCall('blotter.php', 'PUT', formData);
    
    if (result.success) {
        showNotification('Case updated successfully!', 'success');
        await loadCasesTable();
        await updateStats();
        showCaseDetailsView(currentEditingCaseId);
    } else {
        showNotification(result.error || result.message || 'Failed to update case', 'error');
        console.error('Blotter update failed:', result);
    }
    
    if (saveBtn) { saveBtn.innerHTML = originalText; saveBtn.disabled = false; }
}

async function saveCase(action) {
    const formData = {
        case_type: document.getElementById('caseType')?.value || '',
        location: document.getElementById('location')?.value || '',
        incident_date: document.getElementById('reportedDate')?.value || '',
        incident_time: document.getElementById('reportedTime')?.value || '',
        complainant_name: document.getElementById('complainantName')?.value || '',
        complainant_contact: document.getElementById('complainantContact')?.value || '',
        complainant_address: document.getElementById('complainantAddress')?.value || '',
        complainant_relation: document.getElementById('complainantRelation')?.value || '',
        respondent_name: document.getElementById('respondentName')?.value || '',
        respondent_contact: document.getElementById('respondentContact')?.value || '',
        respondent_address: document.getElementById('respondentAddress')?.value || '',
        respondent_status: document.getElementById('respondentStatus')?.value || '',
        incident_summary: document.getElementById('incidentSummary')?.value || '',
        assigned_officer: document.getElementById('assignedOfficer')?.value || '',
        status: document.getElementById('caseStatus')?.value || 'Ongoing',
        schedule_date: document.getElementById('scheduleDate')?.value || null,
        schedule_time: document.getElementById('scheduleTime')?.value || null
    };
    
    if (action === 'submitted') {
        const requiredFields = ['case_type', 'location', 'complainant_name', 'complainant_address', 'respondent_name', 'respondent_address', 'incident_summary'];
        let isValid = true;
        requiredFields.forEach(field => { if (!formData[field]) isValid = false; });
        if (!isValid) { showNotification('Please fill in all required fields', 'error'); return; }
    }
    
    const submitBtn = document.getElementById('submitCaseBtn');
    if (submitBtn && action === 'submitted') {
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = 'Submitting...';
        submitBtn.disabled = true;
        const result = await apiCall('blotter.php', 'POST', formData);
        if (result.success) {
            showNotification('Case submitted successfully!', 'success');
            await loadCasesTable();
            await updateStats();
            showListView();
        } else {
            showNotification(result.error || result.message || 'Failed to submit case', 'error');
            console.error('Blotter submit failed:', result);
            if (result.detail) console.error('Database detail:', result.detail);
        }
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

async function updateCaseStatus(caseId, newStatus) {
    const result = await apiCall(`blotter.php?id=${caseId}`, 'GET');
    if (result && result.id) {
        const formData = { ...result, id: caseId, status: newStatus };
        const updateResult = await apiCall('blotter.php', 'PUT', formData);
        if (updateResult.success) {
            showNotification(`Case marked as ${newStatus}`, 'success');
            await loadCasesTable();
            await updateStats();
            showCaseDetailsView(caseId);
        }
    }
}

async function confirmArchiveCase() {
    if (pendingArchiveCaseId) {
        const result = await apiCall(`blotter.php?id=${pendingArchiveCaseId}`, 'DELETE');
        if (result.success) {
            showNotification('Case archived successfully!', 'success');
            closeArchiveModal();
            await loadCasesTable();
            await updateStats();
            if (currentView === 'details') showListView();
        } else { showNotification('Failed to archive case', 'error'); }
    }
}

async function openArchiveModal(caseId) {
    const result = await apiCall(`blotter.php?id=${caseId}`);
    if (result && result.id) {
        pendingArchiveCaseId = caseId;
        const archiveCaseNumber = document.getElementById('archiveCaseNumber');
        const archiveCaseType = document.getElementById('archiveCaseType');
        const archiveComplainant = document.getElementById('archiveComplainant');
        const archiveRespondent = document.getElementById('archiveRespondent');
        
        if (archiveCaseNumber) archiveCaseNumber.textContent = result.case_number || '';
        if (archiveCaseType) archiveCaseType.textContent = result.case_type || '';
        if (archiveComplainant) archiveComplainant.textContent = result.complainant_name || '';
        if (archiveRespondent) archiveRespondent.textContent = result.respondent_name || '';
        
        const checkbox = document.getElementById('archiveConfirmCheckbox');
        if (checkbox) checkbox.checked = false;
        
        const confirmBtn = document.getElementById('confirmArchiveBtn');
        if (confirmBtn) confirmBtn.disabled = true;
        
        const modal = document.getElementById('archiveModal');
        if (modal) modal.classList.add('active');
    }
}

function closeArchiveModal() {
    const modal = document.getElementById('archiveModal');
    if (modal) modal.classList.remove('active');
    pendingArchiveCaseId = null;
}

function resetCaseForm() {
    const formInputs = document.querySelectorAll('#logCaseView input, #logCaseView select, #logCaseView textarea');
    formInputs.forEach(input => { if (input.type !== 'hidden') input.value = ''; });
    const today = new Date();
    const reportedDate = document.getElementById('reportedDate');
    if (reportedDate) reportedDate.value = today.toISOString().split('T')[0];
    const reportedTime = document.getElementById('reportedTime');
    if (reportedTime) reportedTime.value = today.toLocaleTimeString('en-US', { hour12: false });
    const statusOptions = document.querySelectorAll('.status-option');
    statusOptions.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-status') === 'Ongoing') btn.classList.add('active');
    });
    const caseStatusInput = document.getElementById('caseStatus');
    if (caseStatusInput) caseStatusInput.value = 'Ongoing';
}

function printCaseDetails(caseItem) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html><head><title>Case Report - ${caseItem.case_number}</title>
        <style>
            body{font-family:Arial,sans-serif;padding:40px;}
            h1{color:#16324A;}.header{text-align:center;margin-bottom:30px;}
            .section{margin-bottom:20px;}.label{font-weight:bold;color:#5F7385;}
            .value{margin-left:10px;}hr{margin:20px 0;}
        </style>
        </head>
        <body>
            <div class="header"><h2>Barangay 49 Akasya</h2><h3>Blotter Case Report</h3><p>Case No: ${caseItem.case_number}</p></div>
            <div class="section"><div class="label">Case Type:</div><div class="value">${caseItem.case_type}</div></div>
            <div class="section"><div class="label">Status:</div><div class="value">${caseItem.status}</div></div>
            <div class="section"><div class="label">Complainant:</div><div class="value">${caseItem.complainant_name}</div><div class="value">Relationship to Incident: ${caseItem.complainant_relation || 'Not provided'}</div></div>
            <div class="section"><div class="label">Respondent:</div><div class="value">${caseItem.respondent_name}</div></div>
            <div class="section"><div class="label">Incident Date:</div><div class="value">${formatDate(caseItem.incident_date)} at ${caseItem.incident_time}</div></div>
            <div class="section"><div class="label">Location:</div><div class="value">${caseItem.location}</div></div>
            <div class="section"><div class="label">Incident Summary:</div><div class="value">${caseItem.incident_summary}</div></div>
            <hr><p>Generated on: ${new Date().toLocaleString()}</p>
        </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
}

function showLoading() {
    const tbody = document.getElementById('casesTableBody');
    if (tbody && blotterData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px;"><div class="loading-spinner"></div><p>Loading cases...</p></div>`;
    }
}

function hideLoading() {}

function showNotification(message, type) { 
    alert(message); 
}

function formatDate(dateString) { 
    if (!dateString) return ''; 
    const d = new Date(dateString); 
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); 
}

function escapeHtml(str) { 
    if (!str) return ''; 
    return str.replace(/[&<>]/g, function(m) { 
        if (m === '&') return '&amp;'; 
        if (m === '<') return '&lt;'; 
        if (m === '>') return '&gt;'; 
        return m; 
    }); 
}

function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        newSearchInput.addEventListener('input', (e) => { 
            currentFilters.search = e.target.value.toLowerCase(); 
            currentPage = 1; 
            loadCasesTable(); 
        });
    }
    
    // Case type filter
    const caseTypeFilter = document.getElementById('caseTypeFilter');
    if (caseTypeFilter) {
        const newCaseTypeFilter = caseTypeFilter.cloneNode(true);
        caseTypeFilter.parentNode.replaceChild(newCaseTypeFilter, caseTypeFilter);
        newCaseTypeFilter.addEventListener('change', (e) => { 
            currentFilters.caseType = e.target.value; 
            currentPage = 1; 
            loadCasesTable(); 
        });
    }
    
    // Status filter
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        const newStatusFilter = statusFilter.cloneNode(true);
        statusFilter.parentNode.replaceChild(newStatusFilter, statusFilter);
        newStatusFilter.addEventListener('change', (e) => { 
            currentFilters.status = e.target.value; 
            currentPage = 1; 
            loadCasesTable(); 
        });
    }
    
    // Date filter
    const filterDate = document.getElementById('filterDate');
    if (filterDate) {
        const newFilterDate = filterDate.cloneNode(true);
        filterDate.parentNode.replaceChild(newFilterDate, filterDate);
        newFilterDate.addEventListener('change', (e) => { 
            currentFilters.filterDate = e.target.value; 
            currentPage = 1; 
            loadCasesTable(); 
        });
    }
    
    // Add case button
    const addBtn = document.getElementById('addCaseBtn');
    if (addBtn) {
        const newAddBtn = addBtn.cloneNode(true);
        addBtn.parentNode.replaceChild(newAddBtn, addBtn);
        newAddBtn.addEventListener('click', () => showAddCaseView());
    }
    
    // Back button from add view
    const backBtn = document.getElementById('backToListBtn');
    if (backBtn) {
        const newBackBtn = backBtn.cloneNode(true);
        backBtn.parentNode.replaceChild(newBackBtn, backBtn);
        newBackBtn.addEventListener('click', () => showListView());
    }
    
    // Back from edit view
    const backFromEditBtn = document.getElementById('backFromEditBtn');
    if (backFromEditBtn) {
        const newBackFromEditBtn = backFromEditBtn.cloneNode(true);
        backFromEditBtn.parentNode.replaceChild(newBackFromEditBtn, backFromEditBtn);
        newBackFromEditBtn.addEventListener('click', () => { 
            if (currentEditingCaseId) showCaseDetailsView(currentEditingCaseId); 
            else showListView(); 
        });
    }
    
    // Cancel edit button
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    if (cancelEditBtn) {
        const newCancelEditBtn = cancelEditBtn.cloneNode(true);
        cancelEditBtn.parentNode.replaceChild(newCancelEditBtn, cancelEditBtn);
        newCancelEditBtn.addEventListener('click', () => { 
            if (currentEditingCaseId) showCaseDetailsView(currentEditingCaseId); 
            else showListView(); 
        });
    }
    
    // Save edit button
    const saveEditBtn = document.getElementById('saveEditBtn');
    if (saveEditBtn) {
        const newSaveEditBtn = saveEditBtn.cloneNode(true);
        saveEditBtn.parentNode.replaceChild(newSaveEditBtn, saveEditBtn);
        newSaveEditBtn.addEventListener('click', () => saveEditedCase());
    }
    
    // Cancel case button
    const cancelCaseBtn = document.getElementById('cancelCaseBtn');
    if (cancelCaseBtn) {
        const newCancelCaseBtn = cancelCaseBtn.cloneNode(true);
        cancelCaseBtn.parentNode.replaceChild(newCancelCaseBtn, cancelCaseBtn);
        newCancelCaseBtn.addEventListener('click', () => showListView());
    }
    
    // Submit case button
    const submitBtn = document.getElementById('submitCaseBtn');
    if (submitBtn) {
        const newSubmitBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        newSubmitBtn.addEventListener('click', () => saveCase('submitted'));
    }
    
    // Status options for add case
    const statusOptions = document.querySelectorAll('.status-option');
    statusOptions.forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', () => {
            statusOptions.forEach(b => {
                const existingBtn = document.querySelector(`.status-option[data-status="${b.getAttribute('data-status')}"]`);
                if (existingBtn) existingBtn.classList.remove('active');
            });
            newBtn.classList.add('active');
            const status = newBtn.getAttribute('data-status');
            const caseStatusInput = document.getElementById('caseStatus');
            if (caseStatusInput) caseStatusInput.value = status;
        });
    });
    
    // Archive modal buttons
    const cancelArchiveBtn = document.getElementById('cancelArchiveBtn');
    if (cancelArchiveBtn) {
        const newCancelArchiveBtn = cancelArchiveBtn.cloneNode(true);
        cancelArchiveBtn.parentNode.replaceChild(newCancelArchiveBtn, cancelArchiveBtn);
        newCancelArchiveBtn.addEventListener('click', closeArchiveModal);
    }
    
    const confirmArchiveBtn = document.getElementById('confirmArchiveBtn');
    if (confirmArchiveBtn) {
        const newConfirmArchiveBtn = confirmArchiveBtn.cloneNode(true);
        confirmArchiveBtn.parentNode.replaceChild(newConfirmArchiveBtn, confirmArchiveBtn);
        newConfirmArchiveBtn.addEventListener('click', confirmArchiveCase);
    }
    
    const confirmCheckbox = document.getElementById('archiveConfirmCheckbox');
    if (confirmCheckbox) {
        const newConfirmCheckbox = confirmCheckbox.cloneNode(true);
        confirmCheckbox.parentNode.replaceChild(newConfirmCheckbox, confirmCheckbox);
        newConfirmCheckbox.addEventListener('change', (e) => { 
            const archiveBtn = document.getElementById('confirmArchiveBtn');
            if (archiveBtn) archiveBtn.disabled = !e.target.checked; 
        });
    }
    
    // Set default dates
    const today = new Date();
    const reportedDate = document.getElementById('reportedDate');
    if (reportedDate && !reportedDate.value) reportedDate.value = today.toISOString().split('T')[0];
    const reportedTime = document.getElementById('reportedTime');
    if (reportedTime && !reportedTime.value) reportedTime.value = today.toLocaleTimeString('en-US', { hour12: false });
}

// ============================================
// GLOBAL FUNCTIONS EXPOSED FOR HTML ONCLICK
// ============================================
window.viewCase = function(id) { 
    showCaseDetailsView(id); 
};

window.editCase = function(id) { 
    showEditCaseView(id); 
};

window.archiveCase = function(id) { 
    openArchiveModal(id); 
};

window.changePage = function(page) { 
    if (page < 1 || page > totalPages) return; 
    currentPage = page; 
    loadCasesTable(); 
};

// ============================================
// MODULE INITIALIZATION (Called by router.js)
// ============================================
window.initBlotterModule = initBlotterModule;
window.showAddCaseView = showAddCaseView;

// Optional: Listen for module loaded event (for debugging only)
document.addEventListener('moduleLoaded', function(e) {
    if (e.detail && e.detail.module === 'blotter') {
        console.log('Blotter module content loaded, initialization handled by router.js');
    }
});

console.log('Blotter.js loaded, waiting for router.js to call initBlotterModule()');

})();


})();
