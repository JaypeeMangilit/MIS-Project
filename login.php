<?php
require_once __DIR__ . '/config/functions.php';
require_once __DIR__ . '/config/app_session.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">
    <title>Barangay 49 Akasya - Sign In</title>
    <link rel="stylesheet" href="<?php echo auto_version('modules/login.css'); ?>">
</head>
<body>
    <div class="login-page">
        <div class="login-content">

            <!-- Branding -->
            <div class="login-branding">
                <img src="<?php echo auto_version('Images/Brgy.png'); ?>" alt="Barangay 49 Akasya seal" class="login-logo">
                <h1 class="login-title">BARANGAY 49 AKASYA</h1>
                <p class="login-subtitle">Barangay Management Information System</p>
            </div>

            <!-- Login Card -->
            <div class="login-card">
                <form id="loginForm" class="form-container" novalidate>
                    <div class="alert" id="loginAlert" role="alert" hidden></div>

                    <!-- Username Field -->
                    <div class="input-group">
                        <label for="username" class="input-label">Username or Email</label>
                        <div class="input-wrapper">
                            <img src="<?php echo auto_version('Images/Username_Icon.svg'); ?>" alt="" class="input-icon">
                            <input type="text" id="username" name="username" class="input-field"
                                   placeholder="Enter your username or email" autocomplete="username" required>
                        </div>
                    </div>

                    <!-- Password Field -->
                    <div class="input-group">
                        <label for="password" class="input-label">Password</label>
                        <div class="input-wrapper">
                            <img src="<?php echo auto_version('Images/Password_Icon.svg'); ?>" alt="" class="input-icon">
                            <input type="password" id="password" name="password" class="input-field"
                                   placeholder="Enter your password" autocomplete="current-password" required>
                            <button type="button" class="toggle-password" id="togglePassword" aria-label="Hide password">
                                <!-- Closed eye (default when password is hidden) -->
                                <svg class="icon-eye-closed" width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M2.5 9C2.5 9 5 4.5 9 4.5C13 4.5 15.5 9 15.5 9C15.5 9 13 13.5 9 13.5C5 13.5 2.5 9 2.5 9Z" stroke="currentColor" stroke-width="1.5"/>
                                    <path d="M3 15L15 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                </svg>
                                <!-- Open eye (shown when password is revealed) -->
                                <svg class="icon-eye-open" width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" hidden>
                                    <path d="M9 4.5C5.25 4.5 2.25 7.5 1.5 9C2.25 10.5 5.25 13.5 9 13.5C12.75 13.5 15.75 10.5 16.5 9C15.75 7.5 12.75 4.5 9 4.5Z" stroke="currentColor" stroke-width="1.5"/>
                                    <circle cx="9" cy="9" r="2.25" stroke="currentColor" stroke-width="1.5"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- Remember Me -->
                    <div class="options-row">
                        <label class="checkbox-label">
                            <input type="checkbox" id="rememberMe" class="checkbox-input">
                            <span class="checkbox-custom"></span>
                            <span class="checkbox-text">Remember me</span>
                        </label>
                    </div>

                    <!-- Sign In Button -->
                    <button type="submit" class="signin-button" id="signInButton">
                        <span class="signin-label">Sign In</span>
                        <img src="<?php echo auto_version('Images/SignIn_Icon.svg'); ?>" alt="" class="arrow-icon">
                    </button>
                </form>
            </div>

            <!-- Footer -->
            <div class="login-footer">
                <p class="copyright">&copy; 2025 Barangay 49 Akasya, San Antonio, Cavite City.</p>
                <p class="authorized">Authorized personnel only.</p>
            </div>

        </div>
    </div>

    <script src="<?php echo auto_version('js/api.js'); ?>"></script>
    <script src="<?php echo auto_version('modules/login.js'); ?>"></script>
</body>
</html>
