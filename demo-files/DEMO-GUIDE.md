# ReleaseGuard live demo kit

All files in this folder are brand new (none is registered by the seed script), so each can be registered once per demo run.
A file's fingerprint depends on its **content**, not its name, so copies and renamed files count as the same file ("hash already registered").

## What to type in the Register tab

| Type | Name | Version | Source commit | Artifact file |
|---|---|---|---|---|
| Binary | `webshop` | `1.1.0` | `8ece091bab2a6f0518760ef1592279db306085b4` | `webshop-1.1.0.zip` |
| Binary | `webshop` | `1.2.0` | `16c851d1540c8d77bc9f39b2e3cec533f623d5d9` | `webshop-1.2.0.zip` |
| Binary | `chat-app` | `2.0.0` | `84861edd668e225dca17235f93281e4cf3a2236f` | `chat-app-2.0.0.zip` |
| Library | `payments-lib` | `3.1.0` | `ee8408ae5109f2a72fe07aa25e916d12d91e7401` | `payments-lib-3.1.0.zip` |
| Library | `auth-lib` | `0.9.0` | `71e4056a35df8fedb18a81d451419d664fbfbc39` | `auth-lib-0.9.0.zip` |
| NodeSnapshot | `geth-snapshot` | `19100000` | leave empty | `geth-snapshot-19100000.tar.gz` |
| NodeSnapshot | `geth-snapshot` | `19200000` | leave empty | `geth-snapshot-19200000.tar.gz` |

For the provenance JSON field choose `<file>.provenance.json` (zip releases only).

## Files that are meant to fail

| File | Use it to show |
|---|---|
| `webshop-1.1.0-TAMPERED.zip` | Verify tab with the webshop 1.1.0 ID: **TAMPERED** (a backdoor line was added) |
| `payments-lib-3.1.0-TAMPERED.zip` | Same, for the library |
| `geth-snapshot-19100000-CORRUPTED.tar.gz` | `node scripts/verify-snapshot.js demo-files/geth-snapshot-19100000-CORRUPTED.tar.gz`: **BLOCKED** |
| `geth-snapshot-19200000.tar.gz` (never registered) | Snapshot script: **BLOCKED**, unknown hash |
| `reports/*.txt` | Bounty finding files: critical, medium, low |

## Suggested live demo (about 8 minutes)

1. **Publisher**: register `webshop 1.1.0` (Binary, with its provenance JSON), `geth-snapshot 19100000` (NodeSnapshot) and `payments-lib 3.1.0` (Library). Open the Releases tab and click a row to show the commit and attestation hash.
2. Register `webshop-1.1.0.zip` a second time: the toast explains it is already registered.
3. **Attester**: Attest tab, mark the three releases Verified (use the IDs shown in the Releases tab; they start at 3 if you launched with demo data).
4. **Anyone**: Verify tab. `webshop-1.1.0.zip` with its ID gives **VERIFIED**; `webshop-1.1.0-TAMPERED.zip` gives **TAMPERED**.
5. **Terminal**: `node scripts/verify-snapshot.js demo-files/geth-snapshot-19100000.tar.gz` gives RESTORE ALLOWED; the CORRUPTED copy and the unregistered 19200000 snapshot are BLOCKED.
6. **Funder**: Bounty tab, fund the webshop release with 1 ETH.
7. **Researcher**: submit a **Critical** finding on webshop with `reports/critical-finding.txt`, and a **Low** one with `reports/low-finding.txt`.
8. **Attester**: approve the critical finding with reward 0.5 (the release becomes **Compromised**) and reject the low one.
9. **Researcher**: Withdraw the 0.5 ETH.
10. Show the stat cards and `npm test` (23 tests) in the launcher window.

## A second round without restarting

Use `webshop-1.2.0.zip`, `chat-app-2.0.0.zip`, `auth-lib-0.9.0.zip` and `geth-snapshot-19200000.tar.gz`. Restarting the launcher also gives a completely fresh chain.
