<?php
require_once __DIR__ . '/config/functions.php';
require_once __DIR__ . '/config/app_session.php';

// Every request to the dashboard requires an authenticated session.
requireLoginOrRedirect();
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">
    <title>Barangay 49 Akasya - BMIS</title>
    <link rel="stylesheet" href="<?php echo auto_version('sidebar.css'); ?>">
</head>
<body data-user-role="<?php echo htmlspecialchars($_SESSION['role'] ?? ''); ?>">
    <div class="dashboard-container">
        <!-- Sidebar -->
        <aside class="sidebar">
            <div class="sidebar-header">
                <div class="logo-container">
                    <div class="logo-placeholder">
                        <img src="Images/Brgy.png" alt="Logo" class="logo-img">
                    </div>
                    <h2 class="barangay-name">BARANGGAY 49<br/>AKASYA</h2>
                </div>
            </div>
            
            <nav class="sidebar-nav">
                <!-- Main Menu Section -->
                <div class="nav-section">
                    <div class="nav-section-title">Main Menu</div>
                    <a href="#" class="nav-item" data-module="dashboard">
                        <span class="nav-icon">
                            <img src="Images/Dashboard_Icon.svg" alt="Dashboard Icon">
                        </span>
                        <span class="nav-text">Dashboard</span>
                    </a>
                    <a href="#" class="nav-item" data-module="mapping">
                        <span class="nav-icon">
                            <img src="Images/Mapping_Icon.svg" alt="Mapping Icon">
                        </span>
                        <span class="nav-text">Mapping</span>
                    </a>
                </div>

                <!-- Records Section -->
                <div class="nav-section">
                    <div class="nav-section-title">Records</div>
                    <a href="#" class="nav-item" data-module="residents">
                        <span class="nav-icon">
                            <img src="Images/Residents_Icon.svg" alt="Residents Icon">
                        </span>
                        <span class="nav-text">Residents</span>
                    </a>
                    <a href="#" class="nav-item" data-module="blotter">
                        <span class="nav-icon">
                            <img src="Images/Blotter_Icon.svg" alt="Blotter Icon">
                        </span>
                        <span class="nav-text">Blotter Cases</span>
                    </a>
                    <a href="#" class="nav-item" data-module="certificates">
                        <span class="nav-icon">
                            <img src="Images/Certificates_Icon.svg" alt="Certificates Icon">
                        </span>
                        <span class="nav-text">Certificates</span>
                    </a>
                    <a href="#" class="nav-item" data-module="inventory">
                        <span class="nav-icon">
                            <img src="Images/Inventory_Icon.svg" alt="Inventory Icon">
                        </span>
                        <span class="nav-text">Inventory</span>
                    </a>
                </div>

                <!-- Administrator Section -->
                <div class="nav-section">
                    <div class="nav-section-title">Administrator</div>
                    <a href="#" class="nav-item" data-module="officials">
                        <span class="nav-icon">
                            <img src="Images/Offcials_Icon.svg" alt="Officials Icon">
                        </span>
                        <span class="nav-text">Officials</span>
                    </a>
                    
                    <a href="#" class="nav-item" data-module="reports">
                        <span class="nav-icon">
                            <img src="Images/Reports_Icon.svg" alt="Reports Icon">
                        </span>
                        <span class="nav-text">Reports</span>
                    </a>
                    <a href="#" class="nav-item" data-module="user-management">
                        <span class="nav-icon">
                            <img src="Images/UserManagement_Icon.svg" alt="User Management Icon">
                        </span>
                        <span class="nav-text">User Management</span>
                    </a>
                    <a href="#" class="nav-item" data-module="archives">
                        <span class="nav-icon">
                            <img src="Images/Archive_Icon.svg" alt="Archives Icon">
                        </span>
                        <span class="nav-text">Archives</span>
                    </a>
                </div>
            </nav>
        </aside>

        <!-- Main Content -->
        <main class="main-content">
            <!-- Header -->
            <header class="dashboard-header">
                <div class="header-info">
                    <div class="breadcrumb" id="breadcrumb">Barangay Information System</div>
                    <h1 class="page-title" id="pageTitle">Dashboard</h1>
                </div>
                <div class="user-info" id="userInfo" title="Sign out">
                    <div class="user-details">
                        <div class="user-name" id="headerUserName">&mdash;</div>
                        <div class="user-role" id="headerUserRole">&mdash;</div>
                    </div>
                    <div class="user-avatar">
                        <img src="Images/UserAvatar.jpg" alt="User Avatar">
                    </div>
                    <button type="button" class="signout-button" id="signOutButton" title="Sign out">
                        <img src="Images/DeleteWhite_Icon.svg" alt="">
                        <span>Sign out</span>
                    </button>
                </div>
            </header>

            <!-- Dynamic Content Area -->
            <div class="content-area" id="dynamicContent">
                <!-- Content will be loaded here -->
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <p>Loading...</p>
                </div>
            </div>
        </main>
    </div>

    <script src="<?php echo auto_version('js/session.js'); ?>"></script>
    <script src="<?php echo auto_version('sidebar.js'); ?>"></script>
</body>
</html>