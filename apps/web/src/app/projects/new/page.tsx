"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  controlLevelLabels,
  controlLevels,
  cooperationTypeLabels,
  cooperationTypes,
  operatorTypeLabels,
  operatorTypes,
  subjectTypeLabels,
  subjectTypes
} from "@douyin-local-life/shared";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

type Workspace = {
  id: string;
  name: string;
};

export default function NewProjectPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch<Workspace[]>("/workspaces", token).then(setWorkspaces).catch(() => setError("读取工作区失败"));
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError("");
    const form = new FormData(event.currentTarget);
    const serviceFeeRaw = String(form.get("serviceFee") || "").trim();
    try {
      const project = await apiFetch<{ id: string }>("/projects", token, {
        method: "POST",
        body: JSON.stringify({
          workspaceId: form.get("workspaceId"),
          name: form.get("name"),
          businessType: "DOUYIN_LOCAL_LIFE",
          subjectType: form.get("subjectType"),
          operatorType: form.get("operatorType"),
          cooperationType: form.get("cooperationType"),
          controlLevel: form.get("controlLevel"),
          subjectConfidence: form.get("subjectConfidence"),
          serviceProviderName: form.get("serviceProviderName") || undefined,
          serviceMode: form.get("serviceMode") || undefined,
          serviceFee: serviceFeeRaw ? Number(serviceFeeRaw) : undefined
        })
      });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建项目失败");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <Card>
        <CardTitle>创建主体诊断项目</CardTitle>
        <form className="grid gap-4" onSubmit={submit}>
          <label className="grid gap-1 text-sm">
            项目名称
            <Input name="name" required placeholder="例如：广东区域号 7 月服务商代播诊断" />
          </label>
          <label className="grid gap-1 text-sm">
            工作区
            <Select name="workspaceId" required>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </Select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              直播主体
              <Select name="subjectType" defaultValue="SERVICE_PROVIDER">
                {subjectTypes.map((type) => (
                  <option key={type} value={type}>
                    {subjectTypeLabels[type]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              实际操盘
              <Select name="operatorType" defaultValue="SERVICE_PROVIDER_LIVE">
                {operatorTypes.map((type) => (
                  <option key={type} value={type}>
                    {operatorTypeLabels[type]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              合作关系
              <Select name="cooperationType" defaultValue="SERVICE_PROVIDER_CONTRACT">
                {cooperationTypes.map((type) => (
                  <option key={type} value={type}>
                    {cooperationTypeLabels[type]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              可控程度
              <Select name="controlLevel" defaultValue="MEDIUM">
                {controlLevels.map((level) => (
                  <option key={level} value={level}>
                    {controlLevelLabels[level]}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              主体置信度
              <Input name="subjectConfidence" type="number" min="0" max="1" step="0.01" defaultValue="0.9" required />
            </label>
            <label className="grid gap-1 text-sm">
              服务商名称
              <Input name="serviceProviderName" placeholder="服务商代播/代运营时填写" />
            </label>
            <label className="grid gap-1 text-sm">
              服务类型
              <Input name="serviceMode" placeholder="代播、代运营、投放托管等" />
            </label>
            <label className="grid gap-1 text-sm">
              服务费
              <Input name="serviceFee" type="number" min="0" step="0.01" placeholder="参与服务商后毛利 ROI" />
            </label>
          </div>

          {error ? <div className="rounded-md border border-danger px-3 py-2 text-sm text-danger">{error}</div> : null}
          <Button type="submit" disabled={!token || workspaces.length === 0}>
            创建诊断项目
          </Button>
        </form>
      </Card>
    </main>
  );
}
