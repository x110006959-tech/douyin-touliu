import type { Response } from "express";
import type { ZodError } from "zod";
import { failure, success } from "@douyin-local-life/shared";

export function sendSuccess<T>(res: Response, data: T, status = 200) {
  return res.status(status).json(success(data));
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  options: { requestId?: string; fieldErrors?: Record<string, string> } = {}
) {
  return res.status(status).json(failure(code, message, options));
}

export function validationErrorOptions(error: ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.length ? issue.path.join(".") : "form";
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return { fieldErrors };
}
