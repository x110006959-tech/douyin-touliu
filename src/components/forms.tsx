"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  CheckCircle2,
  LogIn,
  NotebookPen,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  UploadCloud,
  WandSparkles
} from "lucide-react";
import { accountIdentityOptions, controlLevelOptions, cooperationTypeOptions, operatorTypeOptions, subjectTypes } from "@/lib/constants";

type Account = {
  id: string;
  accountName: string;
  platform: string;
  loginEntryUrl?: string | null;
  sessionStatus?: string;
};

type Activity = {
  id: string;
  name: string;
  verifiedStatus: string;
};

type CollectionJob = {
  id: string;
  type: string;
  targetName: string;
  targetUrl: string | null;
  schedule: string | null;
  status: string;
  lastRunAt: string | null;
  lastError: string | null;
  cursor: string | null;
  account?: Account | null;
};

function parseJobCursor(cursor: string | null) {
  if (!cursor) return { selectors: [], nextRunAt: null, liveRuntime: null };
  try {
    const parsed = JSON.parse(cursor) as {
      selectors?: unknown[];
      nextRunAt?: string | null;
      subjectConfig?: {
        subjectType?: string;
      } | null;
      liveRuntime?: {
        liveDate?: string;
        currentSequence?: number;
        lastLiveStatus?: string;
      } | null;
    };
    return {
      selectors: Array.isArray(parsed.selectors) ? parsed.selectors : [],
      nextRunAt: parsed.nextRunAt || null,
      subjectConfig: parsed.subjectConfig || null,
      liveRuntime: parsed.liveRuntime || null
    };
  } catch {
    return { selectors: [], nextRunAt: null, subjectConfig: null, liveRuntime: null };
  }
}

function timeText(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formToObject(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries());
}

async function postJson(url: string, payload: unknown, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "请求失败");
  }
  return response.json();
}

function parseJsonRecord(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function mergeSubjectCalibration(jsonText: string, form: HTMLFormElement) {
  const next = { ...parseJsonRecord(jsonText) };
  const data = new FormData(form);
  const textFields = [
    "subjectType",
    "accountIdentity",
    "operatorType",
    "cooperationType",
    "controlLevel",
    "serviceProviderName",
    "serviceMode",
    "serviceScheduleStatus",
    "serviceScriptStatus",
    "materialAssetStatus",
    "fanAssetStatus"
  ];
  for (const field of textFields) {
    const value = String(data.get(field) || "").trim();
    if (value) next[field] = value;
  }

  for (const field of ["subjectConfidence", "serviceFee"]) {
    const raw = String(data.get(field) || "").trim();
    if (raw) {
      const value = Number(raw);
      if (Number.isFinite(value)) next[field] = value;
    }
  }

  next.serviceFieldControlIssue = data.get("serviceFieldControlIssue") === "on";
  next.servicePricePromiseRisk = data.get("servicePricePromiseRisk") === "on";
  next.sourceQuality = "manual_verified";
  next.subjectSource = "manual_verified";
  return JSON.stringify(next, null, 2);
}

export function AccountForm() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await postJson("/api/accounts", formToObject(event.currentTarget));
      event.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <div className="field">
          <label>平台</label>
          <select name="platform" defaultValue="抖音来客">
            <option>抖音来客</option>
            <option>抖音林客</option>
            <option>巨量本地推</option>
            <option>直播大屏</option>
          </select>
        </div>
        <div className="field">
          <label>账号名</label>
          <input name="accountName" required />
        </div>
        <div className="field">
          <label>商家</label>
          <input name="merchantName" />
        </div>
        <div className="field">
          <label>门店</label>
          <input name="storeName" />
        </div>
        <div className="field">
          <label>登录入口</label>
          <input name="loginEntryUrl" placeholder="https://..." />
        </div>
        <div className="field">
          <label>绑定手机尾号</label>
          <input name="phoneHint" />
        </div>
        <div className="field">
          <label>用途</label>
          <input name="usage" placeholder="直播大屏 / 本地推 / 活动核验" />
        </div>
      </div>
      <div className="field">
        <label>账号备忘</label>
        <textarea name="memo" />
      </div>
      {error ? <div className="badge danger">{error}</div> : null}
      <button className="button" type="submit">
        <Save size={16} aria-hidden />
        保存账号
      </button>
    </form>
  );
}

export function SessionForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const values = formToObject(form);
    const accountId = String(values.accountId || "");
    try {
      await postJson(`/api/accounts/${accountId}/session`, {
        label: values.label,
        containsPassword: values.containsPassword === "on",
        payload: {
          cookies: values.cookies,
          localStorage: values.localStorage,
          sessionStorage: values.sessionStorage,
          memo: values.memo
        }
      });
      form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <div className="field">
          <label>账号</label>
          <select name="accountId" required>
            <option value="">选择账号</option>
            {accounts.map((account) => (
              <option value={account.id} key={account.id}>
                {account.platform} / {account.accountName}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>标签</label>
          <input name="label" defaultValue="default" />
        </div>
      </div>
      <div className="field">
        <label>Cookie 快照</label>
        <textarea name="cookies" />
      </div>
      <div className="form-grid">
        <div className="field">
          <label>localStorage 快照</label>
          <textarea name="localStorage" />
        </div>
        <div className="field">
          <label>sessionStorage 快照</label>
          <textarea name="sessionStorage" />
        </div>
      </div>
      <label className="badge">
        <input name="containsPassword" type="checkbox" />
        包含密码字段
      </label>
      <p className="muted">
        只保存本机加密后的登录态快照；验证码仍由你输入，系统只复用有效登录态，不绕过平台风控。
      </p>
      <div className="field">
        <label>登录态备注</label>
        <textarea name="memo" />
      </div>
      {error ? <div className="badge danger">{error}</div> : null}
      <button className="button" type="submit">
        <ShieldCheck size={16} aria-hidden />
        加密保存登录态
      </button>
    </form>
  );
}

export function AccountLoginFlowForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const selected = accounts.find((account) => account.id === accountId);

  async function startLogin() {
    if (!accountId) return;
    setError("");
    setMessage("");
    setBusy("start");
    try {
      await postJson(`/api/accounts/${accountId}/login/start`, {});
      setMessage("已打开浏览器，请登录并进入直播大屏后点击确认。");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "打开登录页失败");
    } finally {
      setBusy("");
    }
  }

  async function confirmLogin() {
    if (!accountId) return;
    setError("");
    setMessage("");
    setBusy("confirm");
    try {
      const result = await postJson(`/api/accounts/${accountId}/login/confirm`, {});
      setMessage(result.status === "active" ? "登录态已保存；运行直播大屏采集前请先选择直播主体分类。" : "已发送确认，浏览器还在保存登录态。");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "确认登录态失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="form">
      <div className="field">
        <label>账号</label>
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          <option value="">选择账号</option>
          {accounts.map((account) => (
            <option value={account.id} key={account.id}>
              {account.platform} / {account.accountName}
            </option>
          ))}
        </select>
      </div>
      <p className="muted">入口：{selected?.loginEntryUrl || "该账号还没有配置登录入口"}</p>
      {selected?.sessionStatus ? <span className="badge">{selected.sessionStatus}</span> : null}
      {message ? <div className="badge success">{message}</div> : null}
      {error ? <div className="badge danger">{error}</div> : null}
      <div className="toolbar">
        <button className="button" type="button" onClick={startLogin} disabled={!accountId || busy === "start"}>
          <LogIn size={16} aria-hidden />
          打开登录页
        </button>
        <button className="button secondary" type="button" onClick={confirmLogin} disabled={!accountId || busy === "confirm"}>
          <CheckCircle2 size={16} aria-hidden />
          确认已进入大屏
        </button>
      </div>
    </div>
  );
}

export function AccountMemoForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const values = formToObject(form);
    const accountId = String(values.accountId || "");
    try {
      await postJson(`/api/accounts/${accountId}/memos`, {
        title: values.title || "账号备忘",
        body: values.body
      });
      form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <div className="field">
          <label>账号</label>
          <select name="accountId" required>
            <option value="">选择账号</option>
            {accounts.map((account) => (
              <option value={account.id} key={account.id}>
                {account.platform} / {account.accountName}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>标题</label>
          <input name="title" defaultValue="账号备忘" />
        </div>
      </div>
      <div className="field">
        <label>备忘内容</label>
        <textarea name="body" required placeholder="登录入口、绑定手机尾号、账号用途、注意事项" />
      </div>
      {error ? <div className="badge danger">{error}</div> : null}
      <button className="button secondary" type="submit">
        <NotebookPen size={16} aria-hidden />
        保存备忘
      </button>
    </form>
  );
}

export function EvidenceForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await postJson("/api/evidence", formToObject(event.currentTarget));
      event.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <div className="field">
          <label>账号</label>
          <select name="accountId">
            <option value="">无</option>
            {accounts.map((account) => (
              <option value={account.id} key={account.id}>
                {account.platform} / {account.accountName}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>来源</label>
          <select name="source" defaultValue="manual">
            <option value="manual">手工</option>
            <option value="csv">CSV</option>
            <option value="ocr">OCR</option>
            <option value="browser">浏览器采集</option>
            <option value="scrapling">Scrapling</option>
            <option value="public_page">公开页面</option>
          </select>
        </div>
        <div className="field">
          <label>页面/任务</label>
          <input name="pageName" />
        </div>
        <div className="field">
          <label>URL</label>
          <input name="targetUrl" />
        </div>
        <div className="field">
          <label>状态</label>
          <select name="status" defaultValue="pending_verification">
            <option value="pending_verification">待校准</option>
            <option value="verified">已校准</option>
            <option value="failed">采集失败</option>
            <option value="rejected">已拒绝</option>
          </select>
        </div>
        <div className="field">
          <label>置信度</label>
          <input name="confidence" type="number" step="0.01" min="0" max="1" />
        </div>
      </div>
      <div className="field">
        <label>解析字段 JSON</label>
        <textarea name="parsedFields" defaultValue='{"verifyRoi":null}' />
      </div>
      <p className="muted">
        采集失败、OCR 低置信或待校准证据会进入待校准队列；校准为已验证后会自动生成正式快照并重新诊断。
      </p>
      <div className="field">
        <label>原始文本</label>
        <textarea name="rawText" />
      </div>
      <div className="field">
        <label>失败原因</label>
        <input name="failureReason" />
      </div>
      {error ? <div className="badge danger">{error}</div> : null}
      <button className="button" type="submit">
        <UploadCloud size={16} aria-hidden />
        写入证据
      </button>
    </form>
  );
}

export function CollectionJobForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [jobType, setJobType] = useState("live_dashboard");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await postJson("/api/collection/jobs", formToObject(event.currentTarget));
      event.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <div className="field">
          <label>账号</label>
          <select name="accountId" required={jobType === "live_dashboard"}>
            <option value="">无</option>
            {accounts.map((account) => (
              <option value={account.id} key={account.id}>
                {account.platform} / {account.accountName}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>采集类型</label>
          <select name="type" value={jobType} onChange={(event) => setJobType(event.target.value)}>
            <option value="live_dashboard">直播大屏后台</option>
            <option value="scrapling_public">Scrapling 公开页</option>
            <option value="public_page">公开页面</option>
          </select>
        </div>
        <div className="field">
          <label>直播主体分类</label>
          <select name="subjectType" required={jobType === "live_dashboard"} defaultValue="">
            <option value="">选择主体类型</option>
            {subjectTypes
              .filter((subjectType) => subjectType !== "主体待校准")
              .map((subjectType) => (
                <option key={subjectType}>{subjectType}</option>
              ))}
          </select>
        </div>
        <div className="field">
          <label>账号身份</label>
          <select name="accountIdentity" defaultValue="">
            <option value="">待校准</option>
            {accountIdentityOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>任务名</label>
          <input name="targetName" required defaultValue="直播大屏后台" placeholder="直播大屏后台 / 活动公告 / 规则页" />
        </div>
        <div className="field">
          <label>频率</label>
          <input name="schedule" defaultValue="15s" placeholder="15s / 1m / 5m" />
        </div>
      </div>
      <div className="field">
        <label>URL</label>
        <input
          name="targetUrl"
          required={jobType !== "live_dashboard"}
          placeholder={jobType === "live_dashboard" ? "留空时使用账号登录入口" : "https://..."}
        />
      </div>
      <div className="field">
        <label>字段选择器</label>
        <textarea
          name="selectorText"
          placeholder="直播大屏可先留空；需要定点字段时填 字段名=CSS，必填字段用 !字段名=CSS"
        />
      </div>
      <input name="subjectConfidence" type="hidden" value="0.95" />
      {error ? <div className="badge danger">{error}</div> : null}
      <button className="button" type="submit">
        <UploadCloud size={16} aria-hidden />
        创建自动采集
      </button>
    </form>
  );
}

export function CollectionJobList({ jobs }: { jobs: CollectionJob[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [running, setRunning] = useState("");

  async function runJob(jobId: string) {
    setError("");
    setRunning(jobId);
    try {
      await postJson(`/api/collection/jobs/${jobId}/run`, {});
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "采集失败");
    } finally {
      setRunning("");
    }
  }

  async function runDue() {
    setError("");
    setRunning("due");
    try {
      await postJson("/api/collection/jobs/run-due", { limit: 5 });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "运行失败");
    } finally {
      setRunning("");
    }
  }

  return (
    <div className="grid">
      <div className="panel-title compact">
        <h3>任务队列</h3>
        <button className="button secondary" type="button" onClick={runDue} disabled={running === "due"}>
          <RefreshCw size={16} aria-hidden />
          运行到期任务
        </button>
      </div>
      {error ? <div className="badge danger">{error}</div> : null}
      {jobs.length === 0 ? (
        <div className="empty">暂无自动采集任务</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>任务</th>
              <th>频率</th>
              <th>下次</th>
              <th>状态</th>
              <th>最近</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const cursor = parseJobCursor(job.cursor);
              return (
                <tr key={job.id}>
                  <td>
                    <strong>{job.targetName}</strong>
                    <div className="muted">{job.account?.accountName || job.type}</div>
                    <div className="muted">{cursor.subjectConfig?.subjectType || "主体未配置"}</div>
                    <div className="muted">{cursor.selectors.length} 个字段</div>
                    {cursor.liveRuntime ? (
                      <div className="muted">
                        {cursor.liveRuntime.liveDate || "今日"} 第{cursor.liveRuntime.currentSequence || 1}场 /{" "}
                        {cursor.liveRuntime.lastLiveStatus || "unknown"}
                      </div>
                    ) : null}
                  </td>
                  <td>{job.schedule || "-"}</td>
                  <td>{timeText(cursor.nextRunAt)}</td>
                  <td>
                    <span className={job.status === "failed" ? "badge danger" : "badge"}>{job.status}</span>
                  </td>
                  <td>
                    <div>{timeText(job.lastRunAt)}</div>
                    {job.lastError ? <div className="muted">{job.lastError}</div> : null}
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      type="button"
                      title="立即采集"
                      onClick={() => runJob(job.id)}
                      disabled={Boolean(running)}
                    >
                      <Play size={16} aria-hidden />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function CsvImportForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await postJson("/api/import/csv", formToObject(event.currentTarget));
      event.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <div className="field">
          <label>账号</label>
          <select name="accountId">
            <option value="">无</option>
            {accounts.map((account) => (
              <option value={account.id} key={account.id}>
                {account.platform} / {account.accountName}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>页面/任务</label>
          <input name="pageName" defaultValue="CSV 导入" />
        </div>
      </div>
      <div className="field">
        <label>CSV 内容</label>
        <textarea name="rawCsv" required placeholder="字段1,字段2&#10;值1,值2" />
      </div>
      <p className="muted">CSV 会先作为 RawEvidence 入库，仍需校准后参与正式诊断。</p>
      {error ? <div className="badge danger">{error}</div> : null}
      <button className="button secondary" type="submit">
        <UploadCloud size={16} aria-hidden />
        导入 CSV
      </button>
    </form>
  );
}

export function OcrEvidenceForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await postJson("/api/ocr", formToObject(event.currentTarget));
      event.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR 写入失败");
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <div className="field">
          <label>账号</label>
          <select name="accountId">
            <option value="">无</option>
            {accounts.map((account) => (
              <option value={account.id} key={account.id}>
                {account.platform} / {account.accountName}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>页面/任务</label>
          <input name="pageName" defaultValue="截图 OCR" />
        </div>
      </div>
      <div className="field">
        <label>截图路径</label>
        <input name="screenshotPath" required placeholder="C:/path/to/screenshot.png" />
      </div>
      <div className="field">
        <label>本地 OCR 接口（可选）</label>
        <input name="ocrEndpoint" placeholder="默认读取 LOCAL_OCR_ENDPOINT" />
      </div>
      <p className="muted">未配置 OCR 接口时会记录为采集失败，并进入待校准队列，不编造识别结果。</p>
      {error ? <div className="badge danger">{error}</div> : null}
      <button className="button secondary" type="submit">
        <UploadCloud size={16} aria-hidden />
        写入 OCR 证据
      </button>
    </form>
  );
}

export function SnapshotForm({ accounts, activities }: { accounts: Account[]; activities: Activity[] }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const snapshot = await postJson("/api/snapshots", formToObject(event.currentTarget));
      await postJson("/api/diagnose", { snapshotId: snapshot.id });
      event.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <div className="field">
          <label>账号</label>
          <select name="accountId">
            <option value="">无</option>
            {accounts.map((account) => (
              <option value={account.id} key={account.id}>
                {account.platform} / {account.accountName}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>活动</label>
          <select name="activityId">
            <option value="">无</option>
            {activities.map((activity) => (
              <option value={activity.id} key={activity.id}>
                {activity.name} / {activity.verifiedStatus}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>直播间</label>
          <input name="liveRoomName" required />
        </div>
        <div className="field">
          <label>主体类型</label>
          <select name="subjectType" defaultValue="" required>
            <option value="">选择主体类型</option>
            {subjectTypes.map((subjectType) => (
              <option key={subjectType}>{subjectType}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>账号身份</label>
          <select name="accountIdentity" defaultValue="商家官方号">
            {accountIdentityOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>实际操盘</label>
          <select name="operatorType" defaultValue="商家自播">
            {operatorTypeOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>合作关系</label>
          <select name="cooperationType" defaultValue="无">
            {cooperationTypeOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>可控程度</label>
          <select name="controlLevel" defaultValue="高">
            {controlLevelOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>主体置信度</label>
          <input name="subjectConfidence" type="number" step="0.01" min="0" max="1" defaultValue="0.9" />
        </div>
        <div className="field">
          <label>服务商名称</label>
          <input name="serviceProviderName" placeholder="服务商代播/代运营时填写" />
        </div>
        <div className="field">
          <label>服务类型</label>
          <select name="serviceMode" defaultValue="">
            <option value="">待校准</option>
            <option>代播</option>
            <option>代运营</option>
            <option>代播+代运营</option>
            <option>投流托管</option>
          </select>
        </div>
        <div className="field">
          <label>服务费</label>
          <input name="serviceFee" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>排班状态</label>
          <select name="serviceScheduleStatus" defaultValue="">
            <option value="">待校准</option>
            <option>正常</option>
            <option>缺班</option>
            <option>异常</option>
            <option>待调整</option>
          </select>
        </div>
        <div className="field">
          <label>脚本/SOP 状态</label>
          <select name="serviceScriptStatus" defaultValue="">
            <option value="">待校准</option>
            <option>正常</option>
            <option>待调整</option>
            <option>讲解弱</option>
            <option>场控弱</option>
            <option>错价</option>
            <option>虚假承诺</option>
          </select>
        </div>
        <div className="field">
          <label>素材沉淀</label>
          <select name="materialAssetStatus" defaultValue="">
            <option value="">待校准</option>
            <option>未沉淀</option>
            <option>已沉淀</option>
            <option>可复投</option>
          </select>
        </div>
        <div className="field">
          <label>粉丝沉淀</label>
          <select name="fanAssetStatus" defaultValue="">
            <option value="">待校准</option>
            <option>未沉淀</option>
            <option>增长</option>
            <option>良好</option>
          </select>
        </div>
        <div className="field">
          <label>日预算</label>
          <input name="dailyBudget" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>剩余预算</label>
          <input name="remainingBudget" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>今日消耗</label>
          <input name="todaySpend" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>近30分钟消耗</label>
          <input name="spendLast30m" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>当前出价</label>
          <input name="currentBid" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>目标 ROI</label>
          <input name="targetRoi" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>目标 CPA</label>
          <input name="targetCpa" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>支付 ROI</label>
          <input name="payRoi" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>核销 ROI</label>
          <input name="verifyRoi" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>毛利 ROI</label>
          <input name="grossProfitRoi" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>核销 GMV</label>
          <input name="attributedVerifyGmv" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>直播 GMV</label>
          <input name="liveGmv" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>核销毛利</label>
          <input name="grossProfit" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>货架 GMV</label>
          <input name="shelfGmv" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>搜索 GMV</label>
          <input name="searchGmv" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>门店搜索量</label>
          <input name="storeSearches" type="number" />
        </div>
        <div className="field">
          <label>POI 访问</label>
          <input name="poiVisits" type="number" />
        </div>
        <div className="field">
          <label>退款率</label>
          <input name="refundRate" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>投诉率</label>
          <input name="complaintRate" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>差评率</label>
          <input name="badReviewRate" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>库存状态</label>
          <select name="inventoryStatus" defaultValue="待校准">
            <option>充足</option>
            <option>待校准</option>
            <option>不足</option>
          </select>
        </div>
        <div className="field">
          <label>预约状态</label>
          <select name="reservationStatus" defaultValue="待校准">
            <option>充足</option>
            <option>待校准</option>
            <option>不足</option>
          </select>
        </div>
        <div className="field">
          <label>平台补贴</label>
          <input name="platformSubsidyAmount" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>投放券</label>
          <input name="adCouponAmount" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>消返券</label>
          <input name="rebateCouponAmount" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>商家补贴</label>
          <input name="merchantSubsidyAmount" type="number" step="0.01" />
        </div>
      </div>
      <label className="badge">
        <input name="scoreDrop" type="checkbox" />
        评分下滑
      </label>
      <label className="badge">
        <input name="fulfillmentAbnormal" type="checkbox" />
        履约异常
      </label>
      <label className="badge">
        <input name="hostScriptRisk" type="checkbox" />
        话术风险
      </label>
      <label className="badge">
        <input name="serviceFieldControlIssue" type="checkbox" />
        服务商场控问题
      </label>
      <label className="badge">
        <input name="servicePricePromiseRisk" type="checkbox" />
        服务商错价/承诺风险
      </label>
      {error ? <div className="badge danger">{error}</div> : null}
      <button className="button" type="submit">
        <WandSparkles size={16} aria-hidden />
        保存并诊断
      </button>
    </form>
  );
}

export function ActivityForm() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await postJson("/api/activities", formToObject(event.currentTarget));
      event.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <div className="field">
          <label>活动名</label>
          <input name="name" required />
        </div>
        <div className="field">
          <label>类型</label>
          <select name="type" defaultValue="平台补贴">
            <option>平台补贴</option>
            <option>消返券</option>
            <option>投放券</option>
            <option>政府消费券</option>
            <option>节点营销</option>
            <option>扫码激励</option>
            <option>职人扶持</option>
            <option>流量扶持</option>
            <option>官方会场资源</option>
          </select>
        </div>
        <div className="field">
          <label>城市</label>
          <input name="city" />
        </div>
        <div className="field">
          <label>类目</label>
          <input name="category" />
        </div>
        <div className="field">
          <label>账号层级</label>
          <input name="accountTier" />
        </div>
        <div className="field">
          <label>开始时间</label>
          <input name="startsAt" type="datetime-local" />
        </div>
        <div className="field">
          <label>结束时间</label>
          <input name="endsAt" type="datetime-local" />
        </div>
        <div className="field">
          <label>核验状态</label>
          <select name="verifiedStatus" defaultValue="unverified">
            <option value="unverified">未核验</option>
            <option value="verified">已核验</option>
            <option value="expired">已过期</option>
            <option value="ineligible">不适用</option>
          </select>
        </div>
        <div className="field">
          <label>补贴归属</label>
          <select name="subsidyOwner" defaultValue="platform">
            <option value="platform">平台</option>
            <option value="merchant">商家</option>
            <option value="government">政府</option>
            <option value="mixed">混合</option>
          </select>
        </div>
        <div className="field">
          <label>平台补贴</label>
          <input name="platformSubsidyAmount" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>投放券</label>
          <input name="adCouponAmount" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>消返券</label>
          <input name="rebateCouponAmount" type="number" step="0.01" />
        </div>
        <div className="field">
          <label>商家补贴</label>
          <input name="merchantSubsidyAmount" type="number" step="0.01" />
        </div>
      </div>
      <label className="badge">
        <input name="canCountInRoi" type="checkbox" />
        已核验且可计入 ROI
      </label>
      <div className="field">
        <label>备注</label>
        <textarea name="notes" />
      </div>
      {error ? <div className="badge danger">{error}</div> : null}
      <button className="button" type="submit">
        <Save size={16} aria-hidden />
        保存活动
      </button>
    </form>
  );
}

export function CalibrationForm({ evidenceId, parsedFields }: { evidenceId: string; parsedFields: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [jsonText, setJsonText] = useState(parsedFields);
  const parsed = parseJsonRecord(jsonText);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await postJson(
        `/api/evidence/${evidenceId}/verify`,
        {
          parsedFields: jsonText,
          status: "verified"
        },
        "PATCH"
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="grid">
        <div className="panel-title compact">
          <h3>主体识别校准</h3>
          <span className="badge">优先级高于自动采集</span>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>主体类型</label>
            <select name="subjectType" defaultValue={textValue(parsed.subjectType) || "主体待校准"}>
              {subjectTypes.map((subjectType) => (
                <option key={subjectType}>{subjectType}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>账号身份</label>
            <select name="accountIdentity" defaultValue={textValue(parsed.accountIdentity)}>
              <option value="">待校准</option>
              {accountIdentityOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>实际操盘</label>
            <select name="operatorType" defaultValue={textValue(parsed.operatorType)}>
              <option value="">待校准</option>
              {operatorTypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>合作关系</label>
            <select name="cooperationType" defaultValue={textValue(parsed.cooperationType)}>
              <option value="">待校准</option>
              {cooperationTypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>可控程度</label>
            <select name="controlLevel" defaultValue={textValue(parsed.controlLevel)}>
              <option value="">待校准</option>
              {controlLevelOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>主体置信度</label>
            <input name="subjectConfidence" type="number" min="0" max="1" step="0.01" defaultValue={numberValue(parsed.subjectConfidence) || "0.9"} />
          </div>
          <div className="field">
            <label>服务商名称</label>
            <input name="serviceProviderName" defaultValue={textValue(parsed.serviceProviderName)} />
          </div>
          <div className="field">
            <label>服务类型</label>
            <select name="serviceMode" defaultValue={textValue(parsed.serviceMode)}>
              <option value="">待校准</option>
              <option>代播</option>
              <option>代运营</option>
              <option>代播+代运营</option>
              <option>投流托管</option>
            </select>
          </div>
          <div className="field">
            <label>服务费</label>
            <input name="serviceFee" type="number" step="0.01" defaultValue={numberValue(parsed.serviceFee)} />
          </div>
          <div className="field">
            <label>排班状态</label>
            <select name="serviceScheduleStatus" defaultValue={textValue(parsed.serviceScheduleStatus)}>
              <option value="">待校准</option>
              <option>正常</option>
              <option>缺班</option>
              <option>异常</option>
              <option>待调整</option>
            </select>
          </div>
          <div className="field">
            <label>脚本/SOP 状态</label>
            <select name="serviceScriptStatus" defaultValue={textValue(parsed.serviceScriptStatus)}>
              <option value="">待校准</option>
              <option>正常</option>
              <option>待调整</option>
              <option>讲解弱</option>
              <option>场控弱</option>
              <option>错价</option>
              <option>虚假承诺</option>
            </select>
          </div>
          <div className="field">
            <label>素材沉淀</label>
            <select name="materialAssetStatus" defaultValue={textValue(parsed.materialAssetStatus)}>
              <option value="">待校准</option>
              <option>未沉淀</option>
              <option>已沉淀</option>
              <option>可复投</option>
            </select>
          </div>
          <div className="field">
            <label>粉丝沉淀</label>
            <select name="fanAssetStatus" defaultValue={textValue(parsed.fanAssetStatus)}>
              <option value="">待校准</option>
              <option>未沉淀</option>
              <option>增长</option>
              <option>良好</option>
            </select>
          </div>
        </div>
        <label className="badge">
          <input name="serviceFieldControlIssue" type="checkbox" defaultChecked={parsed.serviceFieldControlIssue === true} />
          服务商场控问题
        </label>
        <label className="badge">
          <input name="servicePricePromiseRisk" type="checkbox" defaultChecked={parsed.servicePricePromiseRisk === true} />
          服务商错价/承诺风险
        </label>
        <button
          className="button secondary"
          type="button"
          onClick={(event) => {
            const form = event.currentTarget.form;
            if (form) setJsonText(mergeSubjectCalibration(jsonText, form));
          }}
        >
          <Save size={16} aria-hidden />
          写入主体字段
        </button>
      </div>
      <div className="field">
        <label>校准后的字段 JSON</label>
        <textarea name="parsedFields" value={jsonText} onChange={(event) => setJsonText(event.target.value)} />
      </div>
      <p className="muted">标记已校准后，系统会把可识别字段写入正式直播快照，并生成一条新的诊断结果。</p>
      {error ? <div className="badge danger">{error}</div> : null}
      <button className="button secondary" type="submit">
        <Save size={16} aria-hidden />
        标记已校准
      </button>
    </form>
  );
}
