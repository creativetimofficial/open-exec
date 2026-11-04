# Security policy

## Reporting

Please report vulnerabilities privately through **GitHub Security Advisories** ("Report a vulnerability" on this repository's Security tab). Do not open a public issue.

## Supported versions

Only the latest minor release receives fixes.

## Scope notes

- The app has **no login by default**. It is meant for one person on their own machine; the compose file binds it to `127.0.0.1`. Set `APP_PASSWORD` (where the app supports it) or put it behind your own authentication before exposing it.
- `page_read` blocks private, link-local and metadata addresses and re-checks redirects, but does not defend against DNS rebinding.
- Every tool call is policy-checked and audited by the tool layer before it runs; approvals are decided on the server.
- Keys are read from the environment and never sent to the browser.
