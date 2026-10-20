// mapping.js - Fixed for dynamic loading with working compass

// Zone Data
const zonesData = {
    'Crescini Ext.': {
        name: 'Crescini Ext.',
        description: 'Southern edge of Barangay 49 Akasya',
        badge: 'High Population Area',
        stats: {
            purok: 'Crescini Ext.',
            residents: 1248,
            households: 296,
            seniors: 154,
            minors: 342,
            voters: 812,
            blotter: 5
        }
    },
    'M. Gregorio': {
        name: 'M. Gregorio',
        description: 'Northern residential area of Barangay 49 Akasya',
        badge: 'Medium Population Area',
        stats: {
            purok: 'M. Gregorio',
            residents: 892,
            households: 218,
            seniors: 98,
            minors: 245,
            voters: 578,
            blotter: 3
        }
    },
    'Mariano': {
        name: 'Mariano',
        description: 'Eastern section with mixed residential and commercial',
        badge: 'Medium Population Area',
        stats: {
            purok: 'Mariano',
            residents: 756,
            households: 189,
            seniors: 87,
            minors: 198,
            voters: 489,
            blotter: 4
        }
    },
    'F. Javier': {
        name: 'F. Javier',
        description: 'Western boundary area near the health center',
        badge: 'Low Population Area',
        stats: {
            purok: 'F. Javier',
            residents: 423,
            households: 112,
            seniors: 45,
            minors: 112,
            voters: 267,
            blotter: 2
        }
    },
    'G. Santos': {
        name: 'G. Santos',
        description: 'Central district with community facilities',
        badge: 'Medium Population Area',
        stats: {
            purok: 'G. Santos',
            residents: 678,
            households: 167,
            seniors: 76,
            minors: 189,
            voters: 434,
            blotter: 3
        }
    }
};

// Main initialization function - called by sidebar.js
function initMapping() {
    console.log('Initializing Mapping Module...');
    
    // Load the map
    loadMap();
    
    // Setup event listeners
    setupMappingEventListeners();
    
    // Default select Crescini Ext.
    selectZone('Crescini Ext.');
}

function setupMappingEventListeners() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        newSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            highlightSearchResult(searchTerm);
        });
    }
}

function loadMap() {
    const mapWrapper = document.getElementById('spotMap');
    if (!mapWrapper) return;
    
    mapWrapper.innerHTML = `
        <div class="map-svg-container">
            <div class="map-title">
                <h4>SPOT MAP OF BARANGAY 49 AKASYA</h4>
                <p>Cavite City</p>
            </div>
            <div style="position: relative; width: 100%; min-height: 500px;">
                <div class="map-grid" style="width: 100%; height: 330px; position: relative; background: #F5F1E6; border: 3px solid #0F6CBD;">
                    <!-- Roads -->
                    <div class="road-vertical" style="position: absolute; width: 14px; height: 305px; left: 101px; top: 86px; transform: rotate(-28deg); background: #37A7EA; border-radius: 10px; border: 2px white solid;"></div>
                    <div class="road-horizontal" style="position: absolute; width: 323px; height: 15px; left: 231px; top: 352px; transform: rotate(-12deg); background: #37A7EA; border-radius: 10px; border: 2px white solid;"></div>
                    <div class="road-vertical" style="position: absolute; width: 14px; height: 204px; left: 624px; top: 162px; transform: rotate(28deg); background: #37A7EA; border-radius: 10px; border: 2px white solid;"></div>
                    <div class="road-vertical" style="position: absolute; width: 14px; height: 213px; left: 350px; top: 129px; background: #37A7EA; border-radius: 10px; border: 2px white solid;"></div>
                    <div class="road-vertical" style="position: absolute; width: 14px; height: 228px; left: 488px; top: 106px; background: #37A7EA; border-radius: 10px; border: 2px white solid;"></div>
                    
                    <!-- Zone A -->
                    <div class="zone-clickable" data-zone="M. Gregorio" style="position: absolute; width: 36px; height: 32px; left: 221px; top: 135px; cursor: pointer;">
                        <div style="width: 20px; height: 9px; left: 8px; top: 0px; position: absolute; background: #DF6F55;"></div>
                        <div style="width: 10px; height: 10px; left: 6px; top: 10px; position: absolute; background: #F0D56B;"></div>
                        <div style="width: 10px; height: 10px; left: 18px; top: 10px; position: absolute; background: #84B6F4;"></div>
                        <div style="width: 10px; height: 10px; left: 6px; top: 22px; position: absolute; background: #87C98A;"></div>
                        <div style="width: 10px; height: 10px; left: 18px; top: 22px; position: absolute; background: #E8A26B;"></div>
                    </div>
                    
                    <!-- Zone B -->
                    <div class="zone-clickable" data-zone="F. Javier" style="position: absolute; width: 36px; height: 32px; left: 391px; top: 173px; cursor: pointer;">
                        <div style="width: 20px; height: 9px; left: 8px; top: 0px; position: absolute; background: #DF6F55;"></div>
                        <div style="width: 10px; height: 10px; left: 6px; top: 10px; position: absolute; background: #F0D56B;"></div>
                        <div style="width: 10px; height: 10px; left: 18px; top: 10px; position: absolute; background: #84B6F4;"></div>
                        <div style="width: 10px; height: 10px; left: 6px; top: 22px; position: absolute; background: #87C98A;"></div>
                        <div style="width: 10px; height: 10px; left: 18px; top: 22px; position: absolute; background: #E8A26B;"></div>
                    </div>
                    
                    <!-- Zone C -->
                    <div class="zone-clickable" data-zone="G. Santos" style="position: absolute; width: 36px; height: 32px; left: 443px; top: 299px; cursor: pointer;">
                        <div style="width: 20px; height: 9px; left: 8px; top: 0px; position: absolute; background: #DF6F55;"></div>
                        <div style="width: 10px; height: 10px; left: 6px; top: 10px; position: absolute; background: #F0D56B;"></div>
                        <div style="width: 10px; height: 10px; left: 18px; top: 10px; position: absolute; background: #84B6F4;"></div>
                        <div style="width: 10px; height: 10px; left: 6px; top: 22px; position: absolute; background: #87C98A;"></div>
                        <div style="width: 10px; height: 10px; left: 18px; top: 22px; position: absolute; background: #E8A26B;"></div>
                    </div>
                    
                    <!-- Zone Crescini -->
                    <div class="zone-clickable" data-zone="Crescini Ext." style="position: absolute; width: 36px; height: 32px; left: 600px; top: 247px; cursor: pointer;">
                        <div style="width: 20px; height: 9px; left: 8px; top: 0px; position: absolute; background: #DF6F55;"></div>
                        <div style="width: 10px; height: 10px; left: 6px; top: 10px; position: absolute; background: #F0D56B;"></div>
                        <div style="width: 10px; height: 10px; left: 18px; top: 10px; position: absolute; background: #84B6F4;"></div>
                        <div style="width: 10px; height: 10px; left: 6px; top: 22px; position: absolute; background: #87C98A;"></div>
                        <div style="width: 10px; height: 10px; left: 18px; top: 22px; position: absolute; background: #E8A26B;"></div>
                    </div>
                    
                    <!-- Street Labels -->
                    <div class="street-label" style="left: 149px; top: 365px; transform: rotate(64deg);">Crescini</div>
                    <div class="street-label" style="left: 337px; top: 412px; transform: rotate(-13deg);">M. Gregorio</div>
                    <div class="street-label" style="left: 627px; top: 199px; transform: rotate(62deg);">Mariano</div>
                    <div class="street-label" style="left: 383px; top: 208px; transform: rotate(87deg);">F. Javier</div>
                    <div class="street-label" style="left: 528px; top: 223px; transform: rotate(87deg);">G. Santos</div>
                    
                    
                    <!-- Compass Rose -->
                    <div class="compass-rose">
                        <div class="compass-n">N</div>
                        <div class="compass-e">E</div>
                        <div class="compass-s">S</div>
                        <div class="compass-w">W</div>
                        <div class="compass-circle"></div>
                        <div class="compass-line-v"></div>
                        <div class="compass-line-h"></div>
                    </div>
                </div>
                
                <!-- Legend -->
                <div class="map-legend">
                    <div class="legend-title">Legend</div>
                    <div class="legend-item"><div class="legend-color low"></div><span class="legend-text">Low population</span></div>
                    <div class="legend-item"><div class="legend-color medium"></div><span class="legend-text">Medium population</span></div>
                    <div class="legend-item"><div class="legend-color high"></div><span class="legend-text">High population</span></div>
                    <div class="legend-item"><div class="legend-icon residential"></div><span class="legend-text">Residential clusters</span></div>
                    <div class="legend-item"><div class="legend-icon facility"></div><span class="legend-text">Key facility</span></div>
                </div>
            </div>
        </div>
    `;
    
    // Add click listeners to zone elements
    const zoneElements = document.querySelectorAll('.zone-clickable');
    zoneElements.forEach(el => {
        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);
        newEl.addEventListener('click', () => {
            const zoneName = newEl.getAttribute('data-zone');
            if (zoneName) selectZone(zoneName);
        });
    });
    
    // Add click listeners to street labels
    const streetLabels = document.querySelectorAll('.street-label');
    streetLabels.forEach(label => {
        const newLabel = label.cloneNode(true);
        label.parentNode.replaceChild(newLabel, label);
        newLabel.addEventListener('click', () => {
            const zoneName = getZoneFromStreet(newLabel.textContent);
            if (zoneName) selectZone(zoneName);
        });
    });
    
    // Add click listeners to facility markers
    const facilities = document.querySelectorAll('.facility-marker');
    facilities.forEach(facility => {
        const newFacility = facility.cloneNode(true);
        facility.parentNode.replaceChild(newFacility, facility);
        newFacility.addEventListener('click', () => {
            const zoneName = getZoneFromFacility(newFacility);
            if (zoneName) selectZone(zoneName);
        });
    });
}

function getZoneFromStreet(streetName) {
    const streetMap = {
        'Crescini': 'Crescini Ext.',
        'M. Gregorio': 'M. Gregorio',
        'Mariano': 'Mariano',
        'F. Javier': 'F. Javier',
        'G. Santos': 'G. Santos'
    };
    return streetMap[streetName] || null;
}

function getZoneFromFacility(facilityElement) {
    const facilityLeft = parseInt(facilityElement.style.left);
    const facilityTop = parseInt(facilityElement.style.top);
    
    if (facilityLeft > 500 && facilityTop > 200) return 'Crescini Ext.';
    if (facilityLeft > 300 && facilityLeft < 400 && facilityTop < 150) return 'F. Javier';
    if (facilityLeft > 400 && facilityTop > 250) return 'G. Santos';
    if (facilityLeft > 200 && facilityLeft < 300 && facilityTop < 200) return 'M. Gregorio';
    if (facilityLeft > 500 && facilityTop < 200) return 'Mariano';
    
    return 'Crescini Ext.';
}

function selectZone(zoneName) {
    const zone = zonesData[zoneName];
    if (!zone) return;
    
    // Update zone header
    const zoneHeader = document.getElementById('zoneHeader');
    if (zoneHeader) {
        zoneHeader.innerHTML = `
            <div class="zone-label">Selected Zone</div>
            <div class="zone-name">${zone.name}</div>
            <div class="zone-description">${zone.description}</div>
            <div class="zone-badge">${zone.badge}</div>
        `;
    }
    
    // Update zone stats
    const zoneStats = document.getElementById('zoneStats');
    if (zoneStats) {
        zoneStats.innerHTML = `
            <div class="stat-row">
                <div class="stat-info">
                    <div class="stat-icon">
                        <img src="Images/PurokStreet_Icon.svg" alt="Mapping Icon">
                    </div>
                    <span class="stat-label">Purok / Street</span>
                </div>
                <span class="stat-value">${zone.stats.purok}</span>
            </div>
            <div class="stat-row">
                <div class="stat-info">
                    <div class="stat-icon">
                         <img src="Images/TotalResidentsM_Icon.svg" alt="Mapping Icon">
                    </div>
                    <span class="stat-label">Total Residents</span>
                </div>
                <span class="stat-value">${zone.stats.residents.toLocaleString()}</span>
            </div>
            <div class="stat-row">
                <div class="stat-info">
                    <div class="stat-icon">
                         <img src="Images/TotalHouseholdsM_Icon.svg" alt="Mapping Icon">
                    </div>     
                    <span class="stat-label">Total Households</span>
                </div>
                <span class="stat-value">${zone.stats.households.toLocaleString()}</span>
            </div>
            <div class="stat-row">
                <div class="stat-info">
                    <div class="stat-icon">
                         <img src="Images/SeniorCitizenM_Icon.svg" alt="Mapping Icon">
                    </div>
                    <span class="stat-label">Senior Citizens</span>
                </div>
                <span class="stat-value">${zone.stats.seniors.toLocaleString()}</span>
            </div>
            <div class="stat-row">
                <div class="stat-info">
                    <div class="stat-icon">
                         <img src="Images/MinorM_Icon.svg" alt="Mapping Icon">
                    </div>
                    <span class="stat-label">Minors</span>
                </div>
                <span class="stat-value">${zone.stats.minors.toLocaleString()}</span>
            </div>
            <div class="stat-row">
                <div class="stat-info">
                    <div class="stat-icon">
                         <img src="Images/RegisterVotersM_Icon.svg" alt="Mapping Icon">
                    </div>
                    <span class="stat-label">Registered Voters</span>
                </div>
                <span class="stat-value">${zone.stats.voters.toLocaleString()}</span>
            </div>
            <div class="stat-row">
                <div class="stat-info">
                    <div class="stat-icon">
                         <img src="Images/BlotterCasesM_Icon.svg" alt="Mapping Icon">
                    </div>
                    <span class="stat-label">Blotter Cases</span>
                </div>
                <span class="stat-value highlight">${zone.stats.blotter} cases</span>
            </div>
        `;
    }
    
    // Highlight selected zone on map
    highlightMapZone(zoneName);
    
    // Store current selection
    localStorage.setItem('selectedZone', zoneName);
}

function highlightMapZone(zoneName) {
    const zoneElements = document.querySelectorAll('.zone-clickable');
    zoneElements.forEach(el => {
        el.style.opacity = '1';
        el.style.transform = '';
    });
    
    zoneElements.forEach(el => {
        if (el.getAttribute('data-zone') === zoneName) {
            el.style.opacity = '0.8';
            el.style.transform = 'scale(1.05)';
            setTimeout(() => {
                if (el.style.opacity === '0.8') {
                    el.style.opacity = '1';
                    el.style.transform = '';
                }
            }, 500);
        }
    });
}

function highlightSearchResult(searchTerm) {
    if (!searchTerm) return;
    
    const matchingZone = Object.keys(zonesData).find(zone => 
        zone.toLowerCase().includes(searchTerm) ||
        zonesData[zone].description.toLowerCase().includes(searchTerm)
    );
    
    if (matchingZone) {
        selectZone(matchingZone);
    }
}

function showNotification(message, type) {
    alert(message);
}