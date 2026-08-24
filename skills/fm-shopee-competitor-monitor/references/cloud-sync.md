# Per-user Cloud Sync

The extension supports a user-owned webhook rather than a shared FM credential. Each user configures an endpoint and optional Bearer token in the popup. The local CSV download happens first; upload failure is shown but does not delete or block the local file.

## Request

```http
POST https://user-owned.example/upload
Authorization: Bearer <user-token>
Content-Type: application/json
X-FM-Sync-Version: 1
```

```json
{
  "schema_version": 1,
  "event": "competitor_report.completed",
  "run_id": "unique-run-id",
  "file_name": "FM竞品监控-2026-08-24.csv",
  "generated_at": "2026-08-24T08:00:00.000Z",
  "report_rows": [],
  "failed": [],
  "csv": "UTF-8 CSV text"
}
```

`report_rows` is the preferred input for BigQuery and Google Sheets because each SKU is already a separate object. `csv` is convenient for Google Drive archival.

## Response and retry

Return HTTP `200` or `201` with JSON such as `{ "ok": true, "id": "upload-id" }`. Return a clear `4xx` error for invalid tokens or payloads and a `5xx` error for temporary server failures. Add idempotency using `run_id`, capture date, product ID, and SKU ID before writing to BigQuery or Sheets.

## Provider patterns

- Google Apps Script Web App: validate the token, write `report_rows` to a Sheet, and create the CSV in Drive.
- Cloud Run or Cloud Functions: validate the token and write `report_rows` to BigQuery; optionally archive `csv` in Drive.
- Company API: map `report_rows` to the internal warehouse contract and keep the original `run_id`.

The extension does not need Google service-account credentials. Keep Drive, Sheets, BigQuery, or OAuth secrets on the server. Public endpoints must use HTTPS; local HTTP is allowed only for `localhost` or `127.0.0.1`.

## Business changes

When adding fields, update the snapshot object, SKU row builder, CSV headers, cloud request schema, server-side table schema, and validation tests together. Keep the schema version and document a migration when a field changes meaning.
