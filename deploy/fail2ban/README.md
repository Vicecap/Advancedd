# ZimSolve Fail2Ban security log integration

The API writes parseable security events to `SECURITY_LOG_PATH` (default `/var/log/zimsolve/security.log`).

Install:

```bash
sudo cp deploy/fail2ban/filter.d/zimsolve-security.conf /etc/fail2ban/filter.d/
sudo cp deploy/fail2ban/jail.d/zimsolve-security.local /etc/fail2ban/jail.d/
sudo systemctl reload fail2ban
```

Each event line starts with `SECURITY_EVENT` and includes `ip=...`, `severity=...`, `type=...`, `blocked=...`, and `requestId=...` fields. Secrets, passwords, auth headers, provider keys, and uploaded payloads are intentionally excluded.
