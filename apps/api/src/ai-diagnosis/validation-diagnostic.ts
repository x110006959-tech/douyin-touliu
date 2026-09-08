import { sanitizeAndValidatePersistedInput, sanitizeVisibleText } from "@douyin-local-life/shared";
import type { changedExperimentVariables } from "./experiment-variables.js";

type DetectedChange = ReturnType<typeof changedExperimentVariables>[number];

const sensitiveDiagnosticStepPattern = new RegExp([
  String.raw`(?:[a-z][a-z0-9+.-]*:\/\/|www\.)`,
  String.raw`(?:api[_ -]?key|access[_ -]?key|secret[_ -]?key|client[_ -]?secret|private[_ -]?key|github[_ -]?pat|\bpat\b|oauth|bearer|token|cookie|password|passwd|authorization|secret|credential|session|密钥|令牌|密码|私钥|访问密钥|凭证)`,
  String.raw`(?:gh[pousr]_|github_pat_|glpat-|xox[baprs]-|AKIA|ASIA|AIza|ya29\.|sk_(?:live|test)_|pk_live_)[A-Za-z0-9_-]+`,
  String.raw`(?:^|[^A-Za-z0-9])[A-Za-z0-9_-]{24,}(?:$|[^A-Za-z0-9])`,
  String.raw`(?:^|\D)\d{8,}(?:$|\D)`,
  String.raw`(?:联系人|联系方式|联系[\u4e00-\u9fff]{2,4}|姓名|身份证|手机号|手机号码|电话号码|邮箱|住址|地址|账号|广告主(?:ID|id|编号)?|user[_ -]?id|room[_ -]?id|task[_ -]?id)`,
  String.raw`(?:\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|cn|net|org|io|ai|co|cc|xyz|top)(?:[\/:?#]|$)`
].join("|"), "i");

export type ObservationValidationDiagnostic = {
  version: 1;
  rule: "OBSERVATION_STEP_CHANGE";
  path: string;
  stepText: string;
  textRedacted: boolean;
  detectedVariables: string[];
  unresolvedAdjustment: boolean;
};

// Called only with the schema-validated business step, never the model response,
// prompt, hidden reasoning, or evidence input. Preserve business wording when
// safe; suspicious credential/URL text is withheld as a whole, not partially cut.
export function observationValidationDiagnostic(
  experimentIndex: number,
  step: string,
  change: DetectedChange
): ObservationValidationDiagnostic {
  const sanitized = sanitizeAndValidatePersistedInput(step);
  const sensitive = sanitized.hasSensitiveData
    || /sk-[A-Za-z0-9_-]+/i.test(step)
    || sensitiveDiagnosticStepPattern.test(step);
  const stepText = sensitive || typeof sanitized.value !== "string"
    ? "[REDACTED_SENSITIVE_STEP]"
    : sanitizeVisibleText(sanitized.value, 500);
  return {
    version: 1,
    rule: "OBSERVATION_STEP_CHANGE",
    path: `experiments.${experimentIndex}.steps.${change.stepIndex}`,
    stepText,
    textRedacted: stepText !== step,
    detectedVariables: [...change.variables],
    unresolvedAdjustment: change.unresolvedAdjustment === true
  };
}
