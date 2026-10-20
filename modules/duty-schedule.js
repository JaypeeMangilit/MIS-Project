// ---------- MOCK DATA ----------
const mockSchedules = [
    { id: 1, date: "Oct 18, 2023", day: "Wednesday (Today)", shiftStart: "08:00 AM", shiftEnd: "04:00 PM", officialName: "Hon. Maria Santos", role: "Barangay Kagawad / Desk Officer", location: "Barangay Hall Desk", status: "Upcoming", assignment: "Barangay Hall Desk", avatarInitials: "MS" },
    { id: 2, date: "Oct 18, 2023", day: "Wednesday (Today)", shiftStart: "08:00 AM", shiftEnd: "04:00 PM", officialName: "Roberto Reyes", role: "Chief Tanod", location: "Patrol Unit (Zone 1-3)", status: "On Duty", assignment: "Patrol Unit (Zone 1-3)", avatarInitials: "RR" },
    { id: 3, date: "Oct 18, 2023", day: "Wednesday (Today)", shiftStart: "04:00 PM", shiftEnd: "12:00 MN", officialName: "Eduardo Lim", role: "Barangay Tanod", location: "Checkpoint A (M. Gregorio St.)", status: "Upcoming", assignment: "Checkpoint A", avatarInitials: "EL" },
    { id: 4, date: "Oct 19, 2023", day: "Thursday", shiftStart: "08:00 AM", shiftEnd: "04:00 PM", officialName: "Hon. Luisito Cruz", role: "Barangay Kagawad", location: "Barangay Hall Desk", status: "Upcoming", assignment: "Barangay Hall Desk", avatarInitials: "LC" },
    { id: 5, date: "Oct 17, 2023", day: "Tuesday", shiftStart: "08:00 AM", shiftEnd: "04:00 PM", officialName: "Anita Bautista", role: "Health Worker", location: "Health Center Clinic", status: "Completed", assignment: "Health Center Clinic", avatarInitials: "AB" },
    { id: 6, date: "Oct 17, 2023", day: "Tuesday", shiftStart: "12:00 MN", shiftEnd: "08:00 AM", officialName: "Juanito Dela Cruz", role: "Barangay Tanod", location: "Patrol Unit (Zone 4-6)", status: "Absent", assignment: "Patrol Unit (Zone 4-6)", avatarInitials: "JC" },
    { id: 7, date: "Oct 20, 2023", day: "Friday", shiftStart: "08:00 AM", shiftEnd: "04:00 PM", officialName: "Cristina Flores", role: "Desk Officer", location: "Barangay Hall Desk", status: "Upcoming", assignment: "Barangay Hall Desk", avatarInitials: "CF" },
    { id: 8, date: "Oct 20, 2023", day: "Friday", shiftStart: "04:00 PM", shiftEnd: "12:00 MN", officialName: "Ramon Villanueva", role: "Barangay Tanod", location: "Checkpoint B", status: "Upcoming", assignment: "Checkpoint B", avatarInitials: "RV" }
];

// Mock officials/staff list for dropdown
const mockOfficials = [
    { id: 1, name: "Hon. Maria Santos", role: "Barangay Kagawad / Desk Officer", initials: "MS" },
    { id: 2, name: "Roberto Reyes", role: "Chief Tanod", initials: "RR" },
    { id: 3, name: "Eduardo Lim", role: "Barangay Tanod", initials: "EL" },
    { id: 4, name: "Hon. Luisito Cruz", role: "Barangay Kagawad", initials: "LC" },
    { id: 5, name: "Anita Bautista", role: "Health Worker", initials: "AB" },
    { id: 6, name: "Juanito Dela Cruz", role: "Barangay Tanod", initials: "JC" },
    { id: 7, name: "Cristina Flores", role: "Desk Officer", initials: "CF" },
    { id: 8, name: "Ramon Villanueva", role: "Barangay Tanod", initials: "RV" },
    { id: 9, name: "Teresa Garcia", role: "Barangay Secretary", initials: "TG" },
    { id: 10, name: "Rico Mercado", role: "Barangay Tanod", initials: "RM" }
];

let schedules = [...mockSchedules];
let currentView = "list";
let currentPage = 1;
const rowsPerPage = 6;
let searchTerm = "";
let roleFilter = "All Roles";
let attendanceStatusFilter = "All";

// Shift type mappings
const shiftTypeMap = {
    morning: { start: "08:00 AM", end: "04:00 PM", label: "Morning Shift (08:00 AM - 04:00 PM)" },
    afternoon: { start: "04:00 PM", end: "12:00 MN", label: "Afternoon Shift (04:00 PM - 12:00 MN)" },
    graveyard: { start: "12:00 MN", end: "08:00 AM", label: "Graveyard Shift (12:00 MN - 08:00 AM)" }
};

// Helper functions
function formatDateToDisplay(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    return date.toLocaleDateString('en-US', options).replace(/,/g, ',');
}

function getDayName(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
        return "Today";
    }
    return date.toLocaleDateString('en-US', { weekday: 'long' });
}

function computeStats() {
    const onDutyNow = schedules.filter(s => s.status === "On Duty").length;
    const shiftsThisWeek = schedules.length;
    const unassigned = schedules.filter(s => s.location === "Unassigned").length;
    const totalStaff = [...new Set(schedules.map(s => s.officialName))].length;
    document.getElementById("onDutyNowCount").innerText = onDutyNow;
    document.getElementById("shiftsThisWeekCount").innerText = shiftsThisWeek;
    document.getElementById("unassignedShiftsCount").innerText = unassigned;
    document.getElementById("totalStaffScheduled").innerText = totalStaff;
}

function getStatusBadgeClass(status) {
    if (status === "On Duty") return "status-on-duty";
    if (status === "Upcoming") return "status-upcoming";
    if (status === "Completed") return "status-completed";
    if (status === "Absent") return "status-absent";
    return "";
}

function renderTable() {
    let filtered = schedules.filter(s => {
        const matchesSearch = s.officialName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === "All Roles" || s.role.toLowerCase().includes(roleFilter.toLowerCase());
        let matchesAttendance = true;
        if (attendanceStatusFilter !== "All") matchesAttendance = s.status === attendanceStatusFilter;
        return matchesSearch && matchesRole && matchesAttendance;
    });
    
    const totalFiltered = filtered.length;
    const totalPages = Math.ceil(totalFiltered / rowsPerPage);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const start = (currentPage - 1) * rowsPerPage;
    const paginated = filtered.slice(start, start + rowsPerPage);
    const tbody = document.getElementById("tableBody");
    tbody.innerHTML = "";
    
    paginated.forEach(s => {
        const row = tbody.insertRow();
        row.insertCell(0).innerHTML = `<div><strong>${s.date}</strong><br/><span style="font-size:12px;color:#5F7385">${s.day}</span></div>`;
        row.insertCell(1).innerHTML = `<div style="display:flex;align-items:center;gap:6px"><span>🕒</span> ${s.shiftStart} - ${s.shiftEnd}</div>`;
        row.insertCell(2).innerHTML = `<div class="official-cell"><div class="avatar">${s.avatarInitials}</div><div><div class="official-name">${s.officialName}</div><div class="role-text">${s.role}</div></div></div>`;
        row.insertCell(3).innerHTML = `<div style="display:flex;align-items:center;gap:6px"><span>📍</span> ${s.location}</div>`;
        row.insertCell(4).innerHTML = `<span class="status-badge ${getStatusBadgeClass(s.status)}">${s.status}</span>`;
        
        const onDutyActiveClass = s.status === "On Duty" ? "active-on-duty" : "";
        const absentActiveClass = s.status === "Absent" ? "active-absent" : "";
        const markTd = row.insertCell(5);
        markTd.innerHTML = `<div class="mark-action-group">
            <button class="mark-sm-btn ${onDutyActiveClass}" data-id="${s.id}" data-action="onDuty">On Duty</button>
            <button class="mark-sm-btn ${absentActiveClass}" data-id="${s.id}" data-action="absent">Absent</button>
        </div>`;
        row.insertCell(6).innerHTML = `<div class="action-icons"><div class="icon-btn edit-schedule" data-id="${s.id}">✏️</div><div class="icon-btn delete-schedule" data-id="${s.id}">🗑️</div></div>`;
    });
    
    document.getElementById("paginationInfo").innerText = `Showing ${start+1} to ${Math.min(start+rowsPerPage, totalFiltered)} of ${totalFiltered} schedules`;
    renderPagination(totalPages);
    attachRowEvents();
    computeStats();
}

function renderPagination(totalPages) {
    const container = document.getElementById("paginationControls");
    container.innerHTML = "";
    const prev = document.createElement("div");
    prev.className = "page-item page-inactive";
    prev.innerHTML = "‹";
    prev.onclick = () => { if(currentPage > 1) { currentPage--; renderTable(); } };
    container.appendChild(prev);
    
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage + 1 < maxVisible && startPage > 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }
    
    for(let i = startPage; i <= endPage; i++) {
        const pageDiv = document.createElement("div");
        pageDiv.className = `page-item ${currentPage === i ? "page-active" : "page-inactive"}`;
        pageDiv.innerText = i;
        pageDiv.onclick = () => { currentPage = i; renderTable(); };
        container.appendChild(pageDiv);
    }
    
    const next = document.createElement("div");
    next.className = "page-item page-inactive";
    next.innerHTML = "›";
    next.onclick = () => { if(currentPage < totalPages) { currentPage++; renderTable(); } };
    container.appendChild(next);
}

function attachRowEvents() {
    document.querySelectorAll(".mark-sm-btn").forEach(btn => {
        btn.removeEventListener("click", handleMarkClick);
        btn.addEventListener("click", handleMarkClick);
    });
    document.querySelectorAll(".edit-schedule").forEach(btn => {
        btn.removeEventListener("click", handleEdit);
        btn.addEventListener("click", handleEdit);
    });
    document.querySelectorAll(".delete-schedule").forEach(btn => {
        btn.removeEventListener("click", handleDelete);
        btn.addEventListener("click", handleDelete);
    });
}

function handleMarkClick(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const id = parseInt(btn.getAttribute("data-id"));
    const action = btn.getAttribute("data-action");
    const schedule = schedules.find(s => s.id === id);
    
    if(schedule) {
        if(action === "onDuty") {
            schedule.status = "On Duty";
        } else if(action === "absent") {
            schedule.status = "Absent";
        }
        renderTable();
    }
}

function handleEdit(e) {
    const id = parseInt(e.currentTarget.getAttribute("data-id"));
    alert(`Edit schedule for ID ${id} (implement full modal in production)`);
}

function handleDelete(e) {
    const id = parseInt(e.currentTarget.getAttribute("data-id"));
    if(confirm("Delete this schedule?")) {
        schedules = schedules.filter(s => s.id !== id);
        if(currentPage > 1 && schedules.length <= (currentPage-1)*rowsPerPage) currentPage--;
        renderTable();
    }
}

function setupBulkActions() {
    document.querySelectorAll(".mark-preset").forEach(el => {
        el.removeEventListener("click", handleBulkMark);
        el.addEventListener("click", handleBulkMark);
    });
}

function handleBulkMark(e) {
    const bulkType = e.currentTarget.getAttribute("data-bulk");
    let filtered = schedules.filter(s => {
        let matchSearch = s.officialName.toLowerCase().includes(searchTerm.toLowerCase());
        let matchRole = roleFilter === "All Roles" || s.role.toLowerCase().includes(roleFilter.toLowerCase());
        let matchAttendance = attendanceStatusFilter === "All" || s.status === attendanceStatusFilter;
        return matchSearch && matchRole && matchAttendance;
    });
    
    filtered.forEach(s => {
        if(bulkType === "on-duty") {
            s.status = "On Duty";
        } else if(bulkType === "absent") {
            s.status = "Absent";
        }
    });
    renderTable();
}

function setupFilters() {
    document.getElementById("searchInput")?.addEventListener("input", (e) => { 
        searchTerm = e.target.value; 
        currentPage = 1; 
        renderTable(); 
    });
    
    document.getElementById("roleFilterBtn")?.addEventListener("click", () => {
        let newRole = prompt("Enter role filter (e.g., Tanod, Kagawad) or 'All Roles':", roleFilter);
        if(newRole !== null) {
            roleFilter = newRole === "All Roles" ? "All Roles" : newRole;
            currentPage = 1;
            renderTable();
        }
    });
    
    document.getElementById("attendanceFilterBtn")?.addEventListener("click", () => {
        let newStatus = prompt("Filter by status: On Duty, Upcoming, Completed, Absent, All", attendanceStatusFilter);
        if(newStatus !== null) {
            attendanceStatusFilter = (newStatus === "All" ? "All" : newStatus);
            currentPage = 1;
            renderTable();
        }
    });
}

function setupTabs() {
    document.querySelectorAll(".tab").forEach(tab => {
        tab.addEventListener("click", (e) => {
            document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            const view = tab.getAttribute("data-view");
            if(view === "calendar") {
                alert("Calendar View - enhanced UI would be displayed here (full calendar integration).");
            } else {
                renderTable();
            }
        });
    });
}

// ----- Add Schedule Modal Functions -----
function populateOfficialsDropdown() {
    const select = document.getElementById("assignToSelect");
    if (!select) return;
    select.innerHTML = '<option value="">Select Official or Staff</option>';
    mockOfficials.forEach(official => {
        const option = document.createElement("option");
        option.value = JSON.stringify({ name: official.name, role: official.role, initials: official.initials });
        option.textContent = `${official.name} (${official.role})`;
        select.appendChild(option);
    });
}

function openModal() {
    const modal = document.getElementById("addScheduleModal");
    if (modal) {
        // Reset form
        document.getElementById("assignToSelect").value = "";
        document.getElementById("scheduleDate").value = "";
        document.getElementById("shiftTypeSelect").value = "morning";
        document.getElementById("startTime").value = "08:00";
        document.getElementById("endTime").value = "16:00";
        document.getElementById("assignedAreaSelect").value = "Barangay Hall Desk";
        document.getElementById("scheduleNotes").value = "";
        modal.style.display = "flex";
    }
}

function closeModal() {
    const modal = document.getElementById("addScheduleModal");
    if (modal) {
        modal.style.display = "none";
    }
}

function saveNewSchedule() {
    // Get form values
    const assignToValue = document.getElementById("assignToSelect").value;
    const scheduleDate = document.getElementById("scheduleDate").value;
    const shiftType = document.getElementById("shiftTypeSelect").value;
    const customStartTime = document.getElementById("startTime").value;
    const customEndTime = document.getElementById("endTime").value;
    const assignedArea = document.getElementById("assignedAreaSelect").value;
    const notes = document.getElementById("scheduleNotes").value;
    
    // Validation
    if (!assignToValue) {
        alert("Please select an official or staff member.");
        return;
    }
    if (!scheduleDate) {
        alert("Please select a date.");
        return;
    }
    
    const selectedOfficial = JSON.parse(assignToValue);
    const dateObj = new Date(scheduleDate);
    const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).replace(/,/g, ',');
    const dayName = getDayName(scheduleDate);
    
    // Get shift times
    let shiftStart, shiftEnd;
    if (shiftType === "custom") {
        shiftStart = formatTimeForDisplay(customStartTime);
        shiftEnd = formatTimeForDisplay(customEndTime);
    } else {
        shiftStart = shiftTypeMap[shiftType].start;
        shiftEnd = shiftTypeMap[shiftType].end;
    }
    
    // Create new schedule
    const newId = Math.max(...schedules.map(s => s.id), 0) + 1;
    const newSchedule = {
        id: newId,
        date: formattedDate,
        day: dayName,
        shiftStart: shiftStart,
        shiftEnd: shiftEnd,
        officialName: selectedOfficial.name,
        role: selectedOfficial.role,
        location: assignedArea,
        status: "Upcoming",
        assignment: assignedArea,
        avatarInitials: selectedOfficial.initials,
        notes: notes
    };
    
    schedules.push(newSchedule);
    closeModal();
    renderTable();
    
    // Show success message
    alert(`Schedule added successfully for ${selectedOfficial.name} on ${formattedDate}`);
}

function formatTimeForDisplay(time24) {
    if (!time24) return "";
    const [hours, minutes] = time24.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12.toString().padStart(2, "0")}:${minutes} ${ampm}`;
}

function setupShiftTypeListener() {
    const shiftTypeSelect = document.getElementById("shiftTypeSelect");
    const startTimeInput = document.getElementById("startTime");
    const endTimeInput = document.getElementById("endTime");
    const timeRangeGroup = document.querySelector(".time-range-group");
    
    if (shiftTypeSelect) {
        shiftTypeSelect.addEventListener("change", (e) => {
            const selected = e.target.value;
            if (selected !== "custom") {
                // Show custom time inputs but disable them or keep them updated
                const shift = shiftTypeMap[selected];
                if (shift) {
                    // Convert AM/PM to 24-hour format for input values
                    startTimeInput.value = convertTo24Hour(shift.start);
                    endTimeInput.value = convertTo24Hour(shift.end);
                }
            }
        });
    }
}

function convertTo24Hour(time12) {
    if (!time12) return "00:00";
    const match = time12.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (match) {
        let hours = parseInt(match[1]);
        const minutes = match[2];
        const period = match[3].toUpperCase();
        if (period === "PM" && hours !== 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;
        return `${hours.toString().padStart(2, "0")}:${minutes}`;
    }
    return "00:00";
}

// Initialize modal events
function initModal() {
    const addBtn = document.getElementById("addScheduleBtn");
    const closeBtn = document.getElementById("closeModalBtn");
    const cancelBtn = document.getElementById("cancelModalBtn");
    const saveBtn = document.getElementById("saveScheduleBtn");
    
    if (addBtn) addBtn.addEventListener("click", openModal);
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
    if (saveBtn) saveBtn.addEventListener("click", saveNewSchedule);
    
    // Close modal when clicking outside
    const modalOverlay = document.getElementById("addScheduleModal");
    if (modalOverlay) {
        modalOverlay.addEventListener("click", (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }
    
    populateOfficialsDropdown();
    setupShiftTypeListener();
}

document.getElementById("printBtn")?.addEventListener("click", () => { 
    window.print(); 
});

// Initialize everything
function init() {
    renderTable();
    setupBulkActions();
    setupFilters();
    setupTabs();
    initModal();
}

init();