# 采集层开源参考栈

更新时间：2026-07-04

本项目采集层的目标不是做通用爬虫，而是稳定读取用户已授权可见的数据，把失败、低置信、字段漂移统一降级为待校准证据。采集结果必须进入 `RawEvidence`，经过自动校验或人工校准后才能参与诊断。

## 推荐组合

### 1. Playwright Python：登录态与后台可见页面采集

参考：

- https://github.com/microsoft/playwright-python
- https://playwright.dev/docs/auth

适合本项目：

- 用于抖音来客、林客、直播大屏、本地推后台的已登录页面读取。
- 支持 Chromium/Firefox/WebKit 自动化，能截图、读 DOM、操作页面。
- 官方认证状态方案支持保存 cookies/localStorage 等浏览器状态，适合映射到 `SessionVault`。

落地方式：

- 一个 `AccountProfile` 对应一个加密 `storageState` 或 `userDataDir`。
- 登录态过期时标记 `needs_login`，不把采集失败误判成数据为 0。
- 后台页面只读采集，不自动报名活动、不自动改预算、不自动提交表单。

### 2. Scrapling：公开页和结构漂移容错

参考：

- https://github.com/D4Vinci/Scrapling

适合本项目：

- 用于平台规则中心、公开活动页、城市消费券公告、服务商公开通知。
- 借鉴 Fetcher、Spider、缓存、选择器容错思路。
- 页面结构变化时，采集结果进入待校准，而不是直接覆盖诊断字段。

落地方式：

- 保留当前 `collector.py` 的 `RawEvidencePayload` 输出契约。
- 为每个来源维护页面指纹、字段选择器、最近成功时间。
- 公开搜索到的活动默认 `pending_verification`，不得计入 ROI。

### 3. PaddleOCR / RapidOCR：中文截图 OCR

参考：

- https://github.com/PaddlePaddle/PaddleOCR
- https://github.com/RapidAI/RapidOCR

适合本项目：

- 用于直播大屏、后台卡片、截图中的预算、ROI、核销、搜索、POI 等字段识别。
- PaddleOCR 能处理中文、英文、多语种和复杂版面；RapidOCR 更轻，适合本地快速部署。

落地方式：

- 第一阶段优先 RapidOCR 或轻量 PaddleOCR 模型。
- OCR 输出必须附带置信度和截图区域。
- 低于阈值的关键字段进入待校准队列，不参与加预算判断。

### 4. Crawlee Python：任务队列、重试和存储

参考：

- https://github.com/apify/crawlee-python

适合本项目：

- 当公开情报源变多时，用于统一任务队列、限流、重试、存储和断点续跑。
- 支持 BeautifulSoup、Playwright、raw HTTP 等多种采集方式。

落地方式：

- `CollectionJob` 可映射 Crawlee 的请求队列和运行状态。
- 采集成功写入 `RawEvidence(status=pending_verification)`。
- 采集失败写入 `RawEvidence(status=failed, needsCalibration=true)`。

## 暂不作为核心依赖

### Scrapy + scrapy-playwright

参考：

- https://github.com/scrapy/scrapy
- https://github.com/scrapy-plugins/scrapy-playwright

适合大规模公开页面采集，但当前 MVP 更需要后台登录态、截图 OCR、人工校准闭环。等活动情报源扩大后再考虑引入。

### Firecrawl / Crawl4AI

参考：

- https://github.com/firecrawl/firecrawl
- https://github.com/unclecode/crawl4ai

适合 LLM-ready 页面抽取、Markdown/JSON 化和网页搜索增强。Firecrawl 主项目是 AGPL-3.0，且云服务会涉及数据外发；本项目第一阶段只可借鉴结构化抽取思想，不直接嵌入核心采集链路。

### browser-use

参考：

- https://github.com/browser-use/browser-use

适合研究 AI 浏览器代理的任务规划和页面操作抽象，但对本项目来说太“自动执行”。本项目要保持后台只读采集和人工确认，不让代理自动改投放动作。

## 采集层边界

- 保存登录态可以，但必须本机加密，不能明文落盘。
- 允许用户手动输入验证码，系统复用有效登录态。
- 不绕过验证码、风控、权限或后台限制。
- 不自动提交报名、改预算、改出价、暂停计划。
- 采集失败时显示数据缺失，进入待校准。
- 手动校准字段优先级高于自动采集字段。
