# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected secret-disclosure, authentication, cryptography, XSS, CSRF, or backup vulnerability. Use GitHub's private **Security → Report a vulnerability** flow for this repository.

Include the affected version, deployment mode, reproduction steps, and impact. Never include real OTP seeds, backup files, session cookies, or passwords.

## Security model

Visual 2FA encrypts each authenticator record in the browser with AES-256-GCM. A random vault key is wrapped by a key derived from the master password with PBKDF2-SHA-256 (600,000 iterations). The server stores the wrapped key and encrypted records; it does not receive decrypted OTP seeds during normal use.

This protects vault contents from a database-only compromise, subject to the strength of the master password. It does **not** protect against:

- a compromised browser, device, or malicious browser extension;
- XSS or a malicious replacement of the application JavaScript;
- an attacker who knows or can guess the master password;
- traffic interception when the service is deployed without HTTPS;
- loss of both the master password and all encrypted backups.

Use HTTPS, keep dependencies updated, restrict server access, and keep tested offline backups.

## Sensitive implementation rules

- Never log OTP seeds, generated codes, passwords, QR payloads, vault keys, or decrypted notes.
- Do not add analytics, tag managers, remote scripts, or remote fonts.
- Treat an XSS vulnerability as vault compromise.
- Preserve the strict CSP nonce middleware and same-origin mutation checks.
- All permanent deletion and secret-reveal paths must require recent reauthentication.
