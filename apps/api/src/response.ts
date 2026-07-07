import type { Response } from "express";
import { failure, success } from "@douyin-local-life/shared";

export function sendSuccess<T>(res: Response, data: T, status = 200) {
  return res.status(status).json(success(data));
}

export function sendError(res: Response, status: number, code: string, message: string, options: { requestId?: string } = {}) {
  return res.status(status).json(failure(code, message, options));
}
