# FM 云端同步接口

扩展默认只下载本地 CSV。启用“下载后云端同步”后，任务完成并发起 CSV 下载时，扩展会向每位使用者自己配置的接口发送一次 `POST` 请求。同步失败不会影响本地文件保存。

## 扩展配置

在扩展弹窗中填写：

- `下载后云端同步`：选择“同步到我的接口”。
- `个人同步接口地址`：填写自己的 Google Apps Script Web App、Cloud Run 或其他 HTTPS 接口。
- `接口 Key / Token`：可选，扩展以 `Authorization: Bearer <token>` 发送。
- 点击“授权此接口”，Chrome 只会为填写的接口域名申请访问权限。

Token 仅保存在当前 Chrome 的扩展本地存储中，不会上传到 FM 服务端。

## 请求格式

请求头包含 `Content-Type: application/json` 和 `X-FM-Sync-Version: 1`。请求体结构如下：

```json
{
  "schema_version": 1,
  "event": "competitor_report.completed",
  "run_id": "采集任务唯一 ID",
  "file_name": "FM竞品监控-2026-08-24.csv",
  "generated_at": "2026-08-24T08:00:00.000Z",
  "report_rows": [],
  "failed": [],
  "csv": "UTF-8 CSV 文本"
}
```

`report_rows` 是按 SKU 拆分后的结构化数据，适合写入 BigQuery 或 Google Sheets；`csv` 适合直接保存到 Google Drive。接口成功时建议返回 HTTP `200` 或 `201`，响应体可选：

```json
{
  "ok": true,
  "id": "server-side-upload-id"
}
```

## BigQuery 建议

服务端使用 `report_rows` 写入明细表，不建议在 BigQuery 内解析 CSV。建议使用 `capture_date` 做日期分区，使用 `market`、`shop_id`、`item_id`、`SKU ID` 做聚簇或查询条件。以 `run_id`、`商品ID`、`SKU ID` 和 `采集日期` 做幂等去重，避免用户重复点击下载造成重复数据。

## Google Drive / Sheets 建议

- Google Drive：使用 `csv` 创建每日文件，文件名使用 `file_name`。
- Google Sheets：使用 `report_rows` 追加行，不要把 CSV 当作字符串写进单元格。
- Google Apps Script、Cloud Run 服务账号或 OAuth 凭据应保存在服务端，不要放入扩展包。

## 安全边界

- 公网接口必须使用 HTTPS；HTTP 仅允许 `localhost` 或 `127.0.0.1`。
- 服务端应验证 Bearer Token、`schema_version` 和 `event`。
- 生产环境建议每位用户使用独立 Token，并在服务端记录用户、`run_id` 和上传时间。
- 对重复 `run_id` 实现幂等处理，对网络失败返回明确的 4xx/5xx 错误，扩展会在弹窗中显示同步失败原因。
