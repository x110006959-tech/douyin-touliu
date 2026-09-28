import { z } from "zod";

const optionalEmailSchema = z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? undefined : value,
  z.string().trim().toLowerCase().email("请输入有效邮箱").max(128, "邮箱不能超过 128 个字符").optional()
);

const optionalPhoneSchema = z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? undefined : value,
  z.string().trim().max(32, "手机号不能超过 32 个字符").transform((value, context) => {
    const normalized = normalizePhoneNumber(value);
    if (normalized) return normalized;
    context.addIssue({ code: z.ZodIssueCode.custom, message: "请输入有效手机号" });
    return z.NEVER;
  }).optional()
);

export const authLoginSchema = z.object({
  identifier: z.string().trim().min(1, "请输入邮箱或手机号").max(128, "登录标识不能超过 128 个字符").optional(),
  // 旧客户端此前直接提交 email 字段；保留为兼容别名，identifier 优先。
  email: z.string().trim().max(128).optional(),
  password: z.string().min(6, "密码至少 6 位").max(128, "密码不能超过 128 位")
}).superRefine((value, context) => {
  if (value.identifier || value.email) return;
  context.addIssue({ code: z.ZodIssueCode.custom, path: ["identifier"], message: "请输入邮箱或手机号" });
}).transform((value) => ({ identifier: (value.identifier || value.email || "").trim(), password: value.password }));

export const authRegisterSchema = z.object({
  email: optionalEmailSchema,
  phone: optionalPhoneSchema,
  password: z.string().min(8, "密码至少 8 位").max(128, "密码不能超过 128 位"),
  name: z.string().trim().min(1, "请输入姓名").max(100, "姓名不能超过 100 个字").optional()
}).superRefine((value, context) => {
  if (value.email || value.phone) return;
  context.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "邮箱和手机号至少填写一个" });
});

export function normalizePhoneNumber(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, "");
  const normalized = /^1[3-9]\d{9}$/.test(compact)
    ? `+86${compact}`
    : compact.startsWith("0086")
      ? `+${compact.slice(2)}`
      : compact;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}
