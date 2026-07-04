# 采集服务骨架

这个目录承载自动采集层。主链路是 `AccountProfile -> 账号独立登录态 -> CollectionJob -> RawEvidence -> 校准/快照/诊断`，截图/OCR 只作为字段缺失、页面权限、结构漂移时的兜底方式。

## 直播大屏后台闭环

当前优先跑通的是账号级直播大屏后台：

1. 在账号档案里创建账号，并填写该账号对应的 `loginEntryUrl`。
2. 点击“打开登录页”，系统会为这个账号打开独立 Playwright 浏览器目录。
3. 你手动完成登录、验证码和必要跳转，进入直播大屏后台。
4. 点击“确认已进入大屏”，系统保存该账号的 `storage_state`，并加密写入 `SessionVault(label=live_dashboard)`。
5. 到采集页创建 `CollectionJob(type=live_dashboard, schedule=15s)`，并先选择本场直播主体分类。
6. 运行 `npm run collect:worker` 后，worker 会按账号独立登录态采集直播大屏，把结果写入 `RawEvidence`。

登录态按账号隔离：每个账号有自己的 `collector/.cache/accounts/<accountId>/browser-profile` 和 `storage_state.json`，不会复用到其他账号。

日常工作不需要每场重复登录：

- 同一台电脑上，worker 会优先复用账号已有 `storage_state.json`；文件不存在时才从 `SessionVault` 解密恢复。
- 只有采集器判断停留在登录页、验证码页或登录态失效时，账号状态才会标记为 `needs_login`。
- 直播场次不是登录态。第一场播完、当天第二场开始时，采集器继续使用同一个账号登录态。
- 每次采集会写入 `parsedFields.liveRuntime`，包含 `liveDate`、`liveStatus`、`sessionFingerprint`、`observedAt`；同时会把采集任务里的主体分类写入 `parsedFields.subjectType`，诊断不会从直播间名称猜主体。
- 任务 cursor 会维护当天场次序号：同一天同一 `sessionFingerprint` 继续归为同一场；检测到新的在播 fingerprint 时自动递增为今天第 2 场、第 3 场。

直播画面也会随同采集：

- 每次 `live_dashboard` 任务会保存整页截图，并尝试截取 `video/canvas/player/live/preview` 区域作为直播画面帧。
- 主帧路径会写入 `RawEvidence.screenshotPath`，完整帧列表写入 `rawPayload.visualArtifacts`。
- 如果配置了 `COLLECTOR_OCR_ENDPOINT` 或 `LOCAL_OCR_ENDPOINT`，采集器会把画面帧送去 OCR，结果写入 `parsedFields.liveVisualRecognition.ocrText`。
- 未配置 OCR 时不会丢帧，会标记为 `captured_pending_ocr`，进入待识别/待校准链路。
- 识别到“全网最低、保证、免费送、投诉、退款、差评”等风险词时，会把 `hostScriptRisk` 置为 `true`，供后续诊断使用。

当前 `collector.py` 已提供一个可执行的 Scrapling JSONL 采集器，也可以由主应用自动任务调用：

```bash
python collector/collector.py "https://example.com/activity" \
  --selector "title=title::text" \
  --selector "!body=body *::text" \
  --checkpoint-key activity-feed \
  --resume
```

输出可直接 POST 到 `/api/evidence`，也可以由 `/api/collection/jobs/:id/run` 自动入库。失败时输出 `status=failed`，主应用会进入待校准队列。

自动任务入口：

```bash
npm run collect:worker
```

采集页创建 `Scrapling 公开页` 任务后，worker 会按 `15s / 30s / 1m / 5m` 这类频率运行到期任务。手动测试时也可以在采集页点击立即采集。

第一阶段落地顺序：

1. 公开页面自动采集：活动公告、规则页、城市消费券公告。
2. 高频关键页自动轮询：用 `CollectionJob.schedule` 控制采集频率，结果先入 `RawEvidence`。
3. 登录后台采集：使用已保存登录态恢复浏览器会话，只读取用户可见数据。
4. 失败降级：写入 `status=failed` 的证据，让主应用进入待校准队列。
5. 字段选择器：为每个页面维护 `FIELD=CSS`，关键字段用 `!FIELD=CSS` 标记必填。
6. 缓存/断点：使用 `.cache/collector` 保存页面缓存与 checkpoint，结构漂移时优先进入校准，不覆盖正式字段。

采集层开源参考栈见 `REFERENCE_STACK.md`。当前建议组合是 Playwright Python 管登录态和已登录页面，Scrapling 做公开页/结构容错，PaddleOCR 或 RapidOCR 做中文截图 OCR，Crawlee Python 做后续任务队列与重试。

禁止项：

- 不绕过验证码或风控。
- 不自动报名活动。
- 不自动改预算、出价或计划状态。
- 不把未核验活动计入 ROI。
