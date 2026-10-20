// certificates.js - Complete Certificate Management Module (WITH ARCHIVE)

// Sample Data
let certificatesData = [
    { id: 1, resident_id: 1, resident_name: "Juan Dela Cruz", certificate_type: "Barangay Clearance", purpose: "Employment", or_number: "OR-2023-0891", amount: "50.00", date_issued: "2023-10-24", status: "Valid" },
    { id: 2, resident_id: 2, resident_name: "Maria Clara Santos", certificate_type: "Certificate of Indigency", purpose: "Medical Assistance", or_number: "", amount: "0.00", date_issued: "2023-10-23", status: "Valid" },
    { id: 3, resident_id: 3, resident_name: "Jose Rizalino", certificate_type: "Business Permit", purpose: "Sari-Sari Store Renewal", or_number: "OR-2023-0890", amount: "150.00", date_issued: "2023-10-23", status: "Valid" },
    { id: 4, resident_id: 4, resident_name: "Andres Bonifacio", certificate_type: "Barangay Clearance", purpose: "Police Clearance Req.", or_number: "OR-2023-0889", amount: "50.00", date_issued: "2023-10-22", status: "Valid" },
    { id: 5, resident_id: 5, resident_name: "Leonor Rivera", certificate_type: "Certificate of Residency", purpose: "Bank Requirements", or_number: "OR-2023-0888", amount: "50.00", date_issued: "2023-10-21", status: "Valid" }
];

let residentsList = [
    { id: 1, name: "Juan Dela Cruz", address: "Purok 1 - M. Gregorio St." },
    { id: 2, name: "Maria Clara Santos", address: "Purok 3 - G. Santos St." },
    { id: 3, name: "Jose Rizalino", address: "Purok 4 - Mariano St." },
    { id: 4, name: "Andres Bonifacio", address: "Purok 5 - Crescini Ext." },
    { id: 5, name: "Leonor Rivera", address: "Purok 2 - F. Javier St." }
];

let currentPage = 1;
let itemsPerPage = 5;
let totalItems = 0;
let currentSearch = '';
let pendingEditCertificateId = null;
let currentViewingCertificateId = null;
let currentEditingCertificateId = null;
let pendingArchiveCertificateId = null;

// ============================================
// INITIALIZATION
// ============================================
function initCertificates() {
    console.log('Initializing Certificates Module...');
    
    const certificatesModule = document.getElementById('certificatesModule');
    const detailsView = document.getElementById('certificateDetailsView');
    const editView = document.getElementById('editCertificateView');
    
    if (certificatesModule) certificatesModule.style.display = 'flex';
    if (detailsView) detailsView.style.display = 'none';
    if (editView) editView.style.display = 'none';
    
    loadCertificatesTable();
    setupEventListeners();
    setDefaultDate();
}

// ============================================
// TABLE & PAGINATION
// ============================================
function loadCertificatesTable() {
    // Only show non-archived certificates in the main table
    let filteredData = certificatesData.filter(cert => 
        cert.status !== 'Archived' &&
        (cert.resident_name.toLowerCase().includes(currentSearch.toLowerCase()) ||
        cert.certificate_type.toLowerCase().includes(currentSearch.toLowerCase()))
    );
    
    totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);
    
    renderTable(paginatedData);
    
    const startItem = totalItems === 0 ? 0 : startIndex + 1;
    const endItem = Math.min(startIndex + itemsPerPage, totalItems);
    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        paginationInfo.textContent = `Showing ${startItem} to ${endItem} of ${totalItems} entries`;
    }
    
    renderPagination(totalPages);
}

function renderTable(certificates) {
    const tbody = document.getElementById('issuancesTableBody');
    if (!tbody) return;
    
    if (certificates.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px;">No certificates found</td></tr>`;
        return;
    }
    
    tbody.innerHTML = certificates.map(cert => {
        const badgeClass = getBadgeClass(cert.certificate_type);
        const formattedDate = formatDate(cert.date_issued);
        
        return `
            <tr>
                <td>${formattedDate}</td>
                <td>${escapeHtml(cert.resident_name)}</td>
                <td><span class="cert-badge ${badgeClass}">${escapeHtml(cert.certificate_type)}</span></td>
                <td>${escapeHtml(cert.purpose)}</td>
                <td>${cert.or_number || '—'}</td>
                <td>
                    <div class="action-buttons">
                        <div class="action-btn" onclick="window.viewCertificateModal(${cert.id})" title="View">
                            <img src="Images/View_Icon.svg" alt="View Icon">
                        </div>
                        <div class="action-btn" onclick="window.showEditConfirmModal(${cert.id})" title="Edit">
                            <img src="Images/Edit_Icon.svg" alt="Edit Icon">
                        </div>
                        <div class="action-btn archive" onclick="window.showArchiveConfirmModal(${cert.id})" title="Archive">
                            <img src="Images/Archives_Icon.svg" alt="Archive Icon">
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPagination(totalPages) {
    const container = document.getElementById('paginationControls');
    if (!container) return;
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = `<button class="pagination-btn" onclick="window.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;
    
    for (let i = 1; i <= Math.min(totalPages, 5); i++) {
        html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="window.changePage(${i})">${i}</button>`;
    }
    
    if (totalPages > 5) {
        html += `<button class="pagination-btn" disabled>...</button>`;
        html += `<button class="pagination-btn" onclick="window.changePage(${totalPages})">${totalPages}</button>`;
    }
    
    html += `<button class="pagination-btn" onclick="window.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`;
    
    container.innerHTML = html;
}

window.changePage = function(page) {
    if (page < 1) return;
    currentPage = page;
    loadCertificatesTable();
};

// ============================================
// HELPER FUNCTIONS
// ============================================
function getBadgeClass(certificateType) {
    if (certificateType.includes('Clearance')) return 'clearance';
    if (certificateType.includes('Indigency')) return 'indigency';
    if (certificateType.includes('Residency')) return 'residency';
    if (certificateType.includes('Business')) return 'business';
    if (certificateType.includes('Cedula')) return 'cedula';
    if (certificateType.includes('Good Moral')) return 'moral';
    return 'clearance';
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function setDefaultDate() {
    const dateIssued = document.getElementById('dateIssued');
    if (dateIssued && !dateIssued.value) {
        dateIssued.value = new Date().toISOString().split('T')[0];
    }
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

function calculateValidUntil(dateIssued) {
    if (!dateIssued) return '—';
    const date = new Date(dateIssued);
    date.setMonth(date.getMonth() + 6);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function calculateValidUntilForEdit(dateIssued) {
    if (!dateIssued) return '';
    const date = new Date(dateIssued);
    date.setMonth(date.getMonth() + 6);
    return date.toISOString().split('T')[0];
}

function generateControlNumber(certificate) {
    const prefix = 'BRGY49';
    let typeCode = 'GEN';
    
    if (certificate.certificate_type.includes('Clearance')) typeCode = 'CLR';
    else if (certificate.certificate_type.includes('Indigency')) typeCode = 'IND';
    else if (certificate.certificate_type.includes('Residency')) typeCode = 'RES';
    else if (certificate.certificate_type.includes('Business')) typeCode = 'BUS';
    else if (certificate.certificate_type.includes('Cedula')) typeCode = 'CED';
    else if (certificate.certificate_type.includes('Good Moral')) typeCode = 'GMC';
    
    const year = certificate.date_issued ? new Date(certificate.date_issued).getFullYear() : new Date().getFullYear();
    const sequence = String(certificate.id).padStart(4, '0');
    
    return `${prefix}-${typeCode}-${year}-${sequence}`;
}

// ============================================
// RESIDENT SEARCH
// ============================================
function setupResidentSearch() {
    const searchInput = document.getElementById('residentSearch');
    const resultsDiv = document.getElementById('residentResults');
    
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            if (searchTerm.length < 2) {
                resultsDiv.style.display = 'none';
                return;
            }
            
            const filtered = residentsList.filter(r => 
                r.name.toLowerCase().includes(searchTerm)
            );
            
            if (filtered.length === 0) {
                resultsDiv.style.display = 'none';
                return;
            }
            
            resultsDiv.innerHTML = filtered.map(r => `
                <div class="search-result-item" onclick="window.selectResident(${r.id}, '${r.name.replace(/'/g, "\\'")}')">
                    <div class="resident-name">${escapeHtml(r.name)}</div>
                    <div class="resident-address">${escapeHtml(r.address)}</div>
                </div>
            `).join('');
            resultsDiv.style.display = 'block';
        });
        
        document.addEventListener('click', function(e) {
            if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
                resultsDiv.style.display = 'none';
            }
        });
    }
}

window.selectResident = function(id, name) {
    document.getElementById('residentSearch').value = name;
    document.getElementById('selectedResidentId').value = id;
    document.getElementById('selectedResidentName').value = name;
    document.getElementById('residentResults').style.display = 'none';
};

// ============================================
// SAVE NEW CERTIFICATE
// ============================================
async function saveCertificate() {
    const residentId = document.getElementById('selectedResidentId').value;
    const residentName = document.getElementById('selectedResidentName').value;
    const certificateType = document.getElementById('certificateType').value;
    const purpose = document.getElementById('purpose').value;
    const orNumber = document.getElementById('orNumber').value;
    const amount = document.getElementById('amount').value;
    const dateIssued = document.getElementById('dateIssued').value;
    
    if (!residentId || !certificateType || !purpose || !dateIssued) {
        alert('Please fill in all required fields.');
        return;
    }
    
    const newId = Math.max(...certificatesData.map(c => c.id), 0) + 1;
    
    const newCertificate = {
        id: newId,
        resident_id: parseInt(residentId),
        resident_name: residentName,
        certificate_type: certificateType,
        purpose: purpose,
        or_number: orNumber || '',
        amount: amount.replace('₱', '').trim() || '0.00',
        date_issued: dateIssued,
        status: 'Valid'
    };
    
    certificatesData.unshift(newCertificate);
    
    // Reset form
    document.getElementById('residentSearch').value = '';
    document.getElementById('selectedResidentId').value = '';
    document.getElementById('selectedResidentName').value = '';
    document.getElementById('purpose').value = '';
    document.getElementById('orNumber').value = '';
    document.getElementById('amount').value = '';
    setDefaultDate();
    
    loadCertificatesTable();
    alert('Certificate saved successfully!');
}

// ============================================
// CERTIFICATE DETAILS VIEW (FULL PAGE)
// ============================================
window.showCertificateDetailsView = function(certificateId) {
    const certificate = certificatesData.find(c => c.id === certificateId);
    if (!certificate) return;
    
    currentViewingCertificateId = certificateId;
    
    const certificatesModule = document.getElementById('certificatesModule');
    const detailsView = document.getElementById('certificateDetailsView');
    const editView = document.getElementById('editCertificateView');
    
    if (certificatesModule) certificatesModule.style.display = 'none';
    if (editView) editView.style.display = 'none';
    if (detailsView) detailsView.style.display = 'block';
    
    const nameElem = document.getElementById('detailsResidentName');
    if (nameElem) nameElem.textContent = certificate.resident_name;
    
    const badgeClass = getBadgeClass(certificate.certificate_type);
    const typeElem = document.getElementById('detailsCertificateType');
    if (typeElem) typeElem.innerHTML = `<span class="badge ${badgeClass}">${escapeHtml(certificate.certificate_type)}</span>`;
    
    const purposeElem = document.getElementById('detailsPurpose');
    if (purposeElem) purposeElem.textContent = certificate.purpose || '—';
    
    const dateElem = document.getElementById('detailsDateIssued');
    if (dateElem) dateElem.textContent = formatDate(certificate.date_issued);
    
    const validElem = document.getElementById('detailsValidUntil');
    if (validElem) validElem.textContent = calculateValidUntil(certificate.date_issued);
    
    const orElem = document.getElementById('detailsOrNumber');
    if (orElem) orElem.textContent = certificate.or_number || '—';
    
    const amountElem = document.getElementById('detailsAmount');
    if (amountElem) amountElem.textContent = `₱ ${parseFloat(certificate.amount).toFixed(2)}`;
    
    const issuedByElem = document.getElementById('detailsIssuedBy');
    if (issuedByElem) issuedByElem.textContent = 'Admin Akasya (Barangay Secretary)';
    
    const ctrlElem = document.getElementById('detailsControlNumber');
    if (ctrlElem) ctrlElem.textContent = generateControlNumber(certificate);
};

function backToCertificatesList() {
    const certificatesModule = document.getElementById('certificatesModule');
    const detailsView = document.getElementById('certificateDetailsView');
    
    if (certificatesModule) certificatesModule.style.display = 'flex';
    if (detailsView) detailsView.style.display = 'none';
    
    loadCertificatesTable();
}

// ============================================
// VIEW MODAL (POPUP MODAL)
// ============================================
window.viewCertificateModal = function(id) {
    const certificate = certificatesData.find(c => c.id === id);
    if (certificate) {
        currentViewingCertificateId = id;
        
        const content = `
            <div class="certificate-view-details" style="padding: 15px 20px; line-height: 1.8;">
                <div class="view-row" style="margin-bottom: 8px;"><strong>Resident Name:</strong> ${escapeHtml(certificate.resident_name)}</div>
                <div class="view-row" style="margin-bottom: 8px;"><strong>Certificate Type:</strong> ${escapeHtml(certificate.certificate_type)}</div>
                <div class="view-row" style="margin-bottom: 8px;"><strong>Purpose:</strong> ${escapeHtml(certificate.purpose)}</div>
                <div class="view-row" style="margin-bottom: 8px;"><strong>OR Number:</strong> ${certificate.or_number || '—'}</div>
                <div class="view-row" style="margin-bottom: 8px;"><strong>Amount Paid:</strong> ₱ ${parseFloat(certificate.amount).toFixed(2)}</div>
                <div class="view-row" style="margin-bottom: 8px;"><strong>Date Issued:</strong> ${formatDate(certificate.date_issued)}</div>
                <div class="view-row" style="margin-bottom: 8px;"><strong>Valid Until:</strong> ${calculateValidUntil(certificate.date_issued)}</div>
                <div class="view-row" style="margin-bottom: 8px;"><strong>Control Number:</strong> ${generateControlNumber(certificate)}</div>
            </div>
        `;
        
        const contentContainer = document.getElementById('viewCertificateContent') || document.querySelector('.modal-body');
        if (contentContainer) {
            contentContainer.innerHTML = content;
        }
        
        const modal = document.getElementById('viewCertificateModal') || document.querySelector('.modal-overlay');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.remove('hidden');
        }
    }
};

function closeViewModal() {
    const modal = document.getElementById('viewCertificateModal') || document.querySelector('.modal-overlay');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
}

function printCertificate() {
    const contentContainer = document.getElementById('viewCertificateContent') || document.querySelector('.modal-body');
    const content = contentContainer ? contentContainer.innerHTML : '';
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head><title>Certificate Preview</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 40px; }
            .certificate { border: 2px solid #16324A; padding: 30px; max-width: 650px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #16324A; padding-bottom: 15px; }
            .title { font-size: 24px; font-weight: bold; color: #16324A; text-transform: uppercase; }
            .view-row { margin-bottom: 12px; font-size: 16px; }
            .signatures { margin-top: 60px; display: flex; justify-content: space-between; }
        </style>
        </head>
        <body>
            <div class="certificate">
                <div class="header">
                    <div class="title">Republic of the Philippines</div>
                    <div>Barangay 49 Akasya, Cavite City</div>
                    <h3 style="margin-top: 15px;">OFFICIAL CERTIFICATION</h3>
                </div>
                ${content}
                <div class="signatures">
                    <div>____________________<br><strong>Barangay Secretary</strong></div>
                    <div>____________________<br><strong>Punong Barangay</strong></div>
                </div>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

// ============================================
// EDIT CERTIFICATE VIEW (FULL PAGE)
// ============================================
window.showEditCertificateView = function(certificateId) {
    const certificate = certificatesData.find(c => c.id === certificateId);
    if (!certificate) return;
    
    currentEditingCertificateId = certificateId;
    
    const certificatesModule = document.getElementById('certificatesModule');
    const detailsView = document.getElementById('certificateDetailsView');
    const editView = document.getElementById('editCertificateView');
    
    if (certificatesModule) certificatesModule.style.display = 'none';
    if (detailsView) detailsView.style.display = 'none';
    if (editView) editView.style.display = 'block';
    
    const resNameElem = document.getElementById('editResidentNameDisplay');
    if (resNameElem) resNameElem.textContent = certificate.resident_name;
    
    const certTypeElem = document.getElementById('editCertificateTypeDisplay');
    if (certTypeElem) certTypeElem.textContent = certificate.certificate_type;
    
    const purposeField = document.getElementById('editPurposeField');
    if (purposeField) purposeField.value = certificate.purpose || '';
    
    const dateField = document.getElementById('editDateIssuedField');
    if (dateField) dateField.value = certificate.date_issued;
    
    const validField = document.getElementById('editValidUntilField');
    if (validField) validField.value = calculateValidUntilForEdit(certificate.date_issued);
    
    const orField = document.getElementById('editOrNumberField');
    if (orField) orField.value = certificate.or_number || '';
    
    const amountField = document.getElementById('editAmountField');
    if (amountField) amountField.value = parseFloat(certificate.amount).toFixed(2);
    
    const statusField = document.getElementById('editStatusField');
    if (statusField) statusField.value = certificate.status || 'Valid';
    
    const ctrlDisplay = document.getElementById('editControlNumberDisplay');
    if (ctrlDisplay) ctrlDisplay.textContent = generateControlNumber(certificate);
};

function saveEditedCertificateView() {
    if (!currentEditingCertificateId) return;
    
    const updatedData = {
        purpose: document.getElementById('editPurposeField').value,
        date_issued: document.getElementById('editDateIssuedField').value,
        or_number: document.getElementById('editOrNumberField').value,
        amount: document.getElementById('editAmountField').value,
        status: document.getElementById('editStatusField').value
    };
    
    if (!updatedData.purpose || !updatedData.date_issued || !updatedData.amount) {
        alert('Please fill in all required fields.');
        return;
    }
    
    const index = certificatesData.findIndex(c => c.id === currentEditingCertificateId);
    if (index !== -1) {
        certificatesData[index] = {
            ...certificatesData[index],
            purpose: updatedData.purpose,
            date_issued: updatedData.date_issued,
            or_number: updatedData.or_number,
            amount: updatedData.amount,
            status: updatedData.status
        };
    }
    
    alert('Certificate updated successfully!');
    backToDetailsFromEdit();
}

function backToDetailsFromEdit() {
    const detailsView = document.getElementById('certificateDetailsView');
    const editView = document.getElementById('editCertificateView');
    
    if (editView) editView.style.display = 'none';
    if (detailsView) detailsView.style.display = 'block';
    
    if (currentEditingCertificateId) {
        window.showCertificateDetailsView(currentEditingCertificateId);
    }
}

function cancelEditView() {
    backToDetailsFromEdit();
}

function editFromDetails() {
    if (currentViewingCertificateId) {
        window.showEditConfirmModal(currentViewingCertificateId);
    }
}

// ============================================
// EDIT CONFIRMATION MODAL
// ============================================
window.showEditConfirmModal = function(certificateId) {
    pendingEditCertificateId = certificateId;
    const modal = document.getElementById('editConfirmModal');
    if (modal) {
        modal.style.display = 'flex';
    }
};

function closeEditConfirmModal() {
    const modal = document.getElementById('editConfirmModal');
    if (modal) {
        modal.style.display = 'none';
    }
    pendingEditCertificateId = null;
}

window.proceedWithEdit = function() {
    if (pendingEditCertificateId) {
        const idToEdit = pendingEditCertificateId;
        closeEditConfirmModal();
        window.showEditCertificateView(idToEdit);
    }
};

// ============================================
// ARCHIVE FUNCTIONALITY
// ============================================
window.showArchiveConfirmModal = function(certificateId) {
    pendingArchiveCertificateId = certificateId;
    const modal = document.getElementById('archiveCertificateModal');
    if (modal) {
        modal.style.display = 'flex';
    }
};

function closeArchiveModal() {
    const modal = document.getElementById('archiveCertificateModal');
    if (modal) {
        modal.style.display = 'none';
    }
    pendingArchiveCertificateId = null;
}

function proceedWithArchive() {
    if (pendingArchiveCertificateId) {
        const idToArchive = pendingArchiveCertificateId;
        
        const index = certificatesData.findIndex(c => c.id === idToArchive);
        if (index !== -1) {
            certificatesData[index].status = 'Archived';
            certificatesData[index].archived_date = new Date().toISOString();
            
            alert('Certificate has been archived successfully!');
            closeArchiveModal();
            
            if (currentViewingCertificateId === idToArchive) {
                backToCertificatesList();
            }
            
            loadCertificatesTable();
        } else {
            alert('Certificate not found.');
            closeArchiveModal();
        }
    }
}

// ============================================
// DELETE CERTIFICATE (Permanent)
// ============================================
window.deleteCertificate = function(id) {
    const delInput = document.getElementById('deleteCertificateId');
    if (delInput) delInput.value = id;
    const modal = document.getElementById('deleteCertificateModal');
    if (modal) modal.style.display = 'flex';
};

function confirmDelete() {
    const delInput = document.getElementById('deleteCertificateId');
    if (!delInput) return;
    
    const id = parseInt(delInput.value);
    const index = certificatesData.findIndex(c => c.id === id);
    
    if (index !== -1) {
        certificatesData.splice(index, 1);
        closeDeleteModal();
        loadCertificatesTable();
        
        if (currentViewingCertificateId === id) {
            backToCertificatesList();
        }
        alert('Certificate deleted successfully!');
    }
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteCertificateModal');
    if (modal) modal.style.display = 'none';
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    const saveBtn = document.getElementById('saveCertificateBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveCertificate);
    
    const searchInput = document.getElementById('searchIssuances');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value;
            currentPage = 1;
            loadCertificatesTable();
        });
    }
    
    setupResidentSearch();
    
    const backToListBtn = document.getElementById('backToCertificatesBtn');
    if (backToListBtn) backToListBtn.addEventListener('click', backToCertificatesList);
    
    const backFromEditBtn = document.getElementById('backToDetailsFromEditBtn');
    if (backFromEditBtn) backFromEditBtn.addEventListener('click', backToDetailsFromEdit);
    
    const editFromDetailsBtn = document.getElementById('editFromDetailsBtn');
    if (editFromDetailsBtn) editFromDetailsBtn.addEventListener('click', editFromDetails);
    
    const cancelEditBtn = document.getElementById('cancelEditViewBtn');
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', cancelEditView);
    
    const saveEditBtn = document.getElementById('saveEditViewBtn');
    if (saveEditBtn) saveEditBtn.addEventListener('click', saveEditedCertificateView);
    
    const cancelConfirmBtn = document.getElementById('cancelConfirmEditBtn');
    if (cancelConfirmBtn) cancelConfirmBtn.addEventListener('click', closeEditConfirmModal);
    
    const confirmEditBtn = document.getElementById('confirmEditBtn');
    if (confirmEditBtn) confirmEditBtn.addEventListener('click', window.proceedWithEdit);
    
    const cancelArchiveBtn = document.getElementById('cancelArchiveBtn');
    if (cancelArchiveBtn) cancelArchiveBtn.addEventListener('click', closeArchiveModal);
    
    const confirmArchiveBtn = document.getElementById('confirmArchiveBtn');
    if (confirmArchiveBtn) confirmArchiveBtn.addEventListener('click', proceedWithArchive);
    
    const closeDeleteBtn = document.getElementById('closeDeleteModalBtn');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (closeDeleteBtn) closeDeleteBtn.addEventListener('click', closeDeleteModal);
    if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', confirmDelete);
    
    const closeViewBtn = document.getElementById('closeViewModalBtn');
    const closeViewFooterBtn = document.getElementById('closeViewFooterBtn');
    const printBtn = document.getElementById('printCertificateBtn');
    if (closeViewBtn) closeViewBtn.addEventListener('click', closeViewModal);
    if (closeViewFooterBtn) closeViewFooterBtn.addEventListener('click', closeViewModal);
    if (printBtn) printBtn.addEventListener('click', printCertificate);
    
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
}

// Global Exports
window.initCertificates = initCertificates;
window.viewCertificateModal = viewCertificateModal;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initCertificates, 100));
} else {
    setTimeout(initCertificates, 100);
}