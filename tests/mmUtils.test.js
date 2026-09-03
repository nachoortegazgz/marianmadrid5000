import { describe, expect, it } from "vitest";
import {
  _cleanText,
  _extractRelationalId,
  _looksLikeGuid,
  _normalizeIdPart,
  _readDate,
  _readNonNegativeAmount,
  _readPositiveAmount,
  _roundMoney,
  _stableSerialize,
  withTimeout,
} from "../src/public/mmUtils.js";

describe("mmUtils", () => {
  it("normaliza helpers de texto, ids y dinero", () => {
    expect(_cleanText("  hola  ")).toBe("hola");
    expect(_normalizeIdPart("a b/c", 10)).toBe("ab c".replace(" ", ""));
    expect(_extractRelationalId({ _id: "resource-1" })).toBe("resource-1");
    expect(_roundMoney(12.345)).toBe(12.35);
  });

  it("valida GUIDs y serializa objetos con orden estable", () => {
    expect(_looksLikeGuid("11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(_looksLikeGuid("invalid")).toBe(false);
    expect(_stableSerialize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("lee importes positivos y fechas YYYY-MM-DD seguras", () => {
    expect(_readPositiveAmount("25.50")).toBe(25.5);
    expect(_readPositiveAmount("-5")).toBeNull();
    expect(_readPositiveAmount("abc")).toBeNull();
    expect(_readNonNegativeAmount("0.999")).toBe(1);
    expect(_readNonNegativeAmount("-0.01")).toBeNull();
    expect(_readDate("2026-09-03")).toBe("2026-09-03");
    expect(_readDate("2026-02-30")).toBeNull();
    expect(_readDate("nope")).toBeNull();
  });

  it("usa timeout predeterminado cuando no se proporciona uno", async () => {
    await expect(withTimeout(Promise.resolve("ok"))).resolves.toBe("ok");
  });
});