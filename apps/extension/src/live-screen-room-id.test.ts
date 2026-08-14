import { describe, expect, it } from "vitest";
import { resolveLiveScreenRoomId } from "./live-screen-room-id";

describe("live screen room ID resolution", () => {
  it("accepts matching URL and DOM evidence", () => {
    expect(resolveLiveScreenRoomId({ urlRoomIds: ["123"], domRoomIds: ["123", "123"] })).toEqual({
      value: "123",
      source: "URL_AND_DOM",
      evidence: { urlRoomIds: ["123"], domRoomIds: ["123"] }
    });
  });

  it("fails closed when DOM exposes more than one room ID", () => {
    expect(resolveLiveScreenRoomId({ urlRoomIds: [], domRoomIds: ["123", "456"] })).toEqual({
      value: null,
      source: "MISMATCH",
      evidence: { urlRoomIds: [], domRoomIds: ["123", "456"] }
    });
  });

  it("fails closed when URL and DOM room IDs disagree", () => {
    expect(resolveLiveScreenRoomId({ urlRoomIds: ["123"], domRoomIds: ["456"] })).toEqual({
      value: null,
      source: "MISMATCH",
      evidence: { urlRoomIds: ["123"], domRoomIds: ["456"] }
    });
  });

  it("fails closed when the URL contains distinct room IDs", () => {
    expect(resolveLiveScreenRoomId({ urlRoomIds: ["123", "456"], domRoomIds: [] })).toMatchObject({
      value: null,
      source: "MISMATCH"
    });
  });
});
