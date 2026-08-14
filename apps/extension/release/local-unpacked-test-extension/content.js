"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // ../../packages/shared/dist/collection-routes.js
  var collectionRouteKeys = [
    "LOCAL_PROMOTION_DASHBOARD",
    "LIVE_DATA_SCREEN",
    "LIVE_PRODUCT_TAB",
    "LIVE_TRAFFIC_TAB",
    "TASK_TABLE",
    "MATERIAL_LIBRARY",
    "HOURLY_TREND",
    "UNKNOWN"
  ];
  var collectionRouteTemplates = [
    {
      routeKey: "LIVE_DATA_SCREEN",
      label: "\u76F4\u64AD\u6570\u636E\u5927\u5C4F\u6982\u89C8",
      website: "\u6296\u97F3\u751F\u6D3B\u670D\u52A1\u76F4\u64AD\u6570\u636E\u5927\u5C4F",
      purpose: "\u91C7\u96C6\u6210\u4EA4\u3001\u89C2\u770B\u3001\u66DD\u5149\u548C\u76F4\u64AD\u95F4\u627F\u63A5\u6307\u6807",
      required: true,
      urlHint: "\u8BF7\u5728\u5DF2\u767B\u5F55\u7684\u76F4\u64AD\u6570\u636E\u5927\u5C4F\u6253\u5F00\u6982\u89C8\u9875\u9762"
    },
    {
      routeKey: "LIVE_PRODUCT_TAB",
      label: "\u76F4\u64AD\u5927\u5C4F\u5546\u54C1\u9875",
      website: "\u6296\u97F3\u751F\u6D3B\u670D\u52A1\u76F4\u64AD\u6570\u636E\u5927\u5C4F",
      purpose: "\u91C7\u96C6\u5546\u54C1\u652F\u4ED8\u3001\u8BA2\u5355\u3001\u66DD\u5149\u548C\u5546\u54C1\u8F6C\u5316\u6570\u636E",
      required: false,
      urlHint: "\u8BF7\u5728\u5DF2\u767B\u5F55\u7684\u76F4\u64AD\u6570\u636E\u5927\u5C4F\u5207\u6362\u5230\u201C\u5546\u54C1\u201D"
    },
    {
      routeKey: "LIVE_TRAFFIC_TAB",
      label: "\u76F4\u64AD\u5927\u5C4F\u6D41\u91CF\u9875",
      website: "\u6296\u97F3\u751F\u6D3B\u670D\u52A1\u76F4\u64AD\u6570\u636E\u5927\u5C4F",
      purpose: "\u91C7\u96C6\u81EA\u7136\u6D41\u91CF\u3001\u5546\u4E1A\u6D41\u91CF\u548C\u6D41\u91CF\u8D8B\u52BF",
      required: false,
      urlHint: "\u8BF7\u5728\u5DF2\u767B\u5F55\u7684\u76F4\u64AD\u6570\u636E\u5927\u5C4F\u5207\u6362\u5230\u201C\u6D41\u91CF\u201D"
    },
    {
      routeKey: "LOCAL_PROMOTION_DASHBOARD",
      label: "\u5DE8\u91CF\u672C\u5730\u63A8\u6570\u636E\u603B\u89C8",
      website: "\u5DE8\u91CF\u672C\u5730\u63A8",
      purpose: "\u91C7\u96C6\u6D88\u8017\u3001\u9884\u7B97\u3001ROI\u3001\u8BA2\u5355\u548C\u6210\u672C\u6307\u6807",
      required: true,
      urlHint: "\u8BF7\u5728\u5DF2\u767B\u5F55\u7684\u5DE8\u91CF\u672C\u5730\u63A8\u540E\u53F0\u6253\u5F00\u6570\u636E\u603B\u89C8"
    },
    {
      routeKey: "TASK_TABLE",
      label: "\u5DE8\u91CF\u672C\u5730\u63A8\u4EFB\u52A1\u5217\u8868",
      website: "\u5DE8\u91CF\u672C\u5730\u63A8",
      purpose: "\u91C7\u96C6\u8BA1\u5212\u72B6\u6001\u3001\u9884\u7B97\u3001\u51FA\u4EF7\u548C\u4EFB\u52A1\u5C42\u7EA7\u6570\u636E",
      required: true,
      urlHint: "\u8BF7\u5728\u5DF2\u767B\u5F55\u7684\u5DE8\u91CF\u672C\u5730\u63A8\u540E\u53F0\u6253\u5F00\u4EFB\u52A1\u6216\u8BA1\u5212\u5217\u8868"
    }
  ];
  var collectionRouteLabels = Object.fromEntries(collectionRouteTemplates.map((route) => [route.routeKey, route.label]));
  var collectionFreshnessPolicy = {
    agingAfterMs: 5 * 60 * 1e3,
    staleAfterMs: 10 * 60 * 1e3,
    patrolIntervalMs: 60 * 1e3,
    heartbeatUploadMs: 5 * 60 * 1e3,
    routeFailureThreshold: 3
  };
  var primaryCollectionRouteKeys = [
    "LOCAL_PROMOTION_DASHBOARD",
    "LIVE_DATA_SCREEN"
  ];
  var defaultRequiredCollectionRoutes = [...primaryCollectionRouteKeys];
  var defaultCollectionRouteTemplates = collectionRouteTemplates.filter((route) => defaultRequiredCollectionRoutes.includes(route.routeKey));
  function normalizeCollectionRouteKey(value) {
    return collectionRouteKeys.includes(value) ? value : "UNKNOWN";
  }
  function detectActiveCollectionRoute(input) {
    if (input.manualOverride && input.manualOverride !== "UNKNOWN") {
      return {
        routeKey: input.manualOverride,
        source: "MANUAL",
        confidence: 1,
        manuallyConfirmed: true,
        evidence: [`\u4EBA\u5DE5\u9009\u62E9\uFF1A${collectionRouteLabels[input.manualOverride] || input.manualOverride}`]
      };
    }
    const urlRoute = routeFromUrl(input.sourceUrl);
    const selectedRoutes = [...new Set((input.selectedTabLabels || []).map(routeFromSelectedLabel).filter((route) => Boolean(route)))];
    if (selectedRoutes.length > 1) {
      return {
        routeKey: "UNKNOWN",
        source: "UNKNOWN",
        confidence: 0,
        manuallyConfirmed: false,
        evidence: [`\u68C0\u6D4B\u5230\u51B2\u7A81\u7684\u9009\u4E2D\u5206\u680F\uFF1A${selectedRoutes.join(" / ")}`]
      };
    }
    const headingRoutes = [...new Set([input.pageTitle || "", ...input.visibleHeadings || []].map(routeFromSpecificHeading).filter((route) => Boolean(route)))];
    if (headingRoutes.length > 1) {
      return {
        routeKey: "UNKNOWN",
        source: "UNKNOWN",
        confidence: 0,
        manuallyConfirmed: false,
        evidence: [`\u68C0\u6D4B\u5230\u51B2\u7A81\u7684\u4E13\u5C5E\u6807\u9898\uFF1A${headingRoutes.join(" / ")}`]
      };
    }
    const content = `${input.pageTitle || ""}
${(input.visibleHeadings || []).join("\n")}
${input.visibleText || ""}`;
    const scores = [
      scoreRoute("LIVE_PRODUCT_TAB", content, ["\u5546\u54C1\u5217\u8868", "\u5173\u6CE8\u5546\u54C1", "\u63A8\u8350\u8FD4\u573A", "\u5546\u54C1\u753B\u50CF", "\u5546\u54C1\u66DD\u5149\u6B21\u6570", "\u5546\u54C1\u70B9\u51FB\u4EBA\u6570", "\u652F\u4ED8\u6210\u529F\u7528\u6237\u6570"]),
      scoreRoute("LIVE_TRAFFIC_TAB", content, ["\u76F4\u64AD\u6D41\u91CF", "\u6D41\u91CF\u5206\u6790", "\u5C0F\u65F6\u770B\u64AD\u6B21\u6570", "\u5C0F\u65F6\u81EA\u7136\u770B\u64AD\u6B21\u6570", "\u5C0F\u65F6\u5546\u4E1A\u770B\u64AD\u6B21\u6570", "\u6D41\u91CF\u6E20\u9053", "\u5F15\u6D41\u77ED\u89C6\u9891"]),
      scoreRoute("LIVE_DATA_SCREEN", content, ["\u76F4\u64AD\u95F4\u6210\u4EA4\u91D1\u989D", "\u8D8B\u52BF\u5206\u6790", "\u7528\u6237\u753B\u50CF", "\u8F6C\u5316\u5206\u6790", "\u7D2F\u8BA1\u66DD\u5149\u6B21\u6570", "\u5546\u54C1\u8F6C\u5316\u7387"])
    ].filter((item) => item.score >= 2);
    scores.sort((left, right) => right.score - left.score);
    const contentWinner = scores.length && (scores.length === 1 || scores[0].score > scores[1].score) ? scores[0] : null;
    const candidates = [
      urlRoute ? { routeKey: urlRoute, source: "URL", confidence: 0.98, evidence: `URL\uFF1A${urlRoute}` } : null,
      selectedRoutes[0] ? { routeKey: selectedRoutes[0], source: "ACTIVE_TAB", confidence: 0.92, evidence: `\u9009\u4E2D\u5206\u680F\uFF1A${(input.selectedTabLabels || []).join(" / ")}` } : null,
      headingRoutes[0] ? { routeKey: headingRoutes[0], source: "VISIBLE_CONTENT", confidence: 0.9, evidence: `\u4E13\u5C5E\u6807\u9898\uFF1A${collectionRouteLabels[headingRoutes[0]] || headingRoutes[0]}` } : null,
      contentWinner ? { routeKey: contentWinner.routeKey, source: "VISIBLE_CONTENT", confidence: Math.min(0.9, 0.68 + contentWinner.score * 0.05), evidence: contentWinner.markers.map((marker) => `\u53EF\u89C1\u5185\u5BB9\uFF1A${marker}`).join("\uFF1B") } : null
    ].filter((candidate2) => Boolean(candidate2));
    const distinctRoutes = [...new Set(candidates.map((candidate2) => candidate2.routeKey))];
    if (distinctRoutes.length > 1) {
      return {
        routeKey: "UNKNOWN",
        source: "UNKNOWN",
        confidence: 0,
        manuallyConfirmed: false,
        evidence: candidates.map((candidate2) => candidate2.evidence)
      };
    }
    const candidate = candidates[0];
    if (candidate) {
      return {
        routeKey: candidate.routeKey,
        source: candidate.source,
        confidence: candidate.confidence,
        manuallyConfirmed: false,
        evidence: candidates.map((item) => item.evidence)
      };
    }
    const pageType = normalizeCollectionRouteKey(input.pageType);
    if (pageType !== "UNKNOWN" && pageType !== "LIVE_DATA_SCREEN") {
      return { routeKey: pageType, source: "PAGE_TYPE", confidence: 0.7, manuallyConfirmed: false, evidence: [`\u9875\u9762\u7C7B\u578B\uFF1A${pageType}`] };
    }
    return { routeKey: "UNKNOWN", source: "UNKNOWN", confidence: 0, manuallyConfirmed: false, evidence: ["\u5F53\u524D\u53EF\u89C1\u533A\u57DF\u4E0D\u8DB3\u4EE5\u786E\u5B9A\u5206\u680F"] };
  }
  function routeFromUrl(value) {
    if (!value)
      return null;
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();
      const mode = ["mode", "tab", "view", "section"].map((key) => url.searchParams.get(key)?.toLowerCase() || "").join(" ");
      if (host === "localads.chengzijianzhan.cn" && /\/lamp\/pc\/liveboard2(?:\/|$)/.test(path))
        return "LOCAL_PROMOTION_DASHBOARD";
      if (host === "localads.chengzijianzhan.cn" && /\/lamp\/pc\/promotion\/roi2(?:\/|$)/.test(path))
        return "TASK_TABLE";
      if (/\b(product|products|goods|commodity)\b/.test(mode) || /\/(product|goods)(?:\/|$)/.test(path))
        return "LIVE_PRODUCT_TAB";
      if (/\b(traffic|flow|channel)\b/.test(mode) || /\/(traffic|flow)(?:\/|$)/.test(path))
        return "LIVE_TRAFFIC_TAB";
      if (/\b(main|overview|summary)\b/.test(mode) && /live|room|screen|liveboard/.test(path))
        return "LIVE_DATA_SCREEN";
      if (/material|creative/.test(path))
        return "MATERIAL_LIBRARY";
      if (/task|campaign/.test(path))
        return "TASK_TABLE";
    } catch {
      return null;
    }
    return null;
  }
  function routeFromSelectedLabel(value) {
    const label = value.replace(/[\s\u00a0]+/g, "").replace(/[（(].*?[）)]/g, "");
    if (["\u6982\u89C8", "\u76F4\u64AD\u6982\u89C8", "\u6570\u636E\u6982\u89C8"].includes(label))
      return "LIVE_DATA_SCREEN";
    if (["\u5546\u54C1", "\u5546\u54C1\u5206\u6790", "\u5546\u54C1\u5217\u8868"].includes(label))
      return "LIVE_PRODUCT_TAB";
    if (["\u6D41\u91CF", "\u6D41\u91CF\u5206\u6790", "\u76F4\u64AD\u6D41\u91CF"].includes(label))
      return "LIVE_TRAFFIC_TAB";
    return null;
  }
  function routeFromSpecificHeading(value) {
    const heading = value.replace(/[\s\u00a0]+/g, "");
    if (/商品列表|关注商品|推荐返场|商品画像/.test(heading))
      return "LIVE_PRODUCT_TAB";
    if (/直播流量|流量分析|流量趋势/.test(heading))
      return "LIVE_TRAFFIC_TAB";
    if (/直播间成交金额|直播数据大屏概览/.test(heading))
      return "LIVE_DATA_SCREEN";
    return null;
  }
  function scoreRoute(routeKey, content, markers) {
    const matched = markers.filter((marker) => content.includes(marker));
    return { routeKey, score: matched.length, markers: matched };
  }

  // src/messages.ts
  var MESSAGE = {
    START_COLLECTION: "AI_DIAGNOSIS_START_COLLECTION",
    GET_PAGE_CONTEXT: "AI_DIAGNOSIS_GET_PAGE_CONTEXT",
    PAGE_ACTIVITY: "AI_DIAGNOSIS_PAGE_ACTIVITY",
    CAPTURE_AND_UPLOAD: "AI_DIAGNOSIS_CAPTURE_AND_UPLOAD",
    BEGIN_LIVE_PULSE_LOOP: "AI_DIAGNOSIS_BEGIN_LIVE_PULSE_LOOP",
    SUBMIT_LIVE_PULSE: "AI_DIAGNOSIS_SUBMIT_LIVE_PULSE",
    START_LIVE_PULSE: "AI_DIAGNOSIS_START_LIVE_PULSE",
    STOP_LIVE_PULSE: "AI_DIAGNOSIS_STOP_LIVE_PULSE",
    GET_STATE: "AI_DIAGNOSIS_GET_STATE",
    VERIFY_BOUND_CONTEXT: "AI_DIAGNOSIS_VERIFY_BOUND_CONTEXT",
    GET_BRIDGE_STATUS: "AI_DIAGNOSIS_GET_BRIDGE_STATUS",
    REQUEST_PAIRING_CONFIRMATION: "AI_DIAGNOSIS_REQUEST_PAIRING_CONFIRMATION",
    CONFIRM_PAIRING: "AI_DIAGNOSIS_CONFIRM_PAIRING",
    CANCEL_PAIRING: "AI_DIAGNOSIS_CANCEL_PAIRING",
    SELECT_TASK: "AI_DIAGNOSIS_SELECT_TASK",
    CLEAR_PAIRING: "AI_DIAGNOSIS_CLEAR_PAIRING",
    CLEAR_SNAPSHOT: "AI_DIAGNOSIS_CLEAR_SNAPSHOT",
    OPEN_SIDE_PANEL: "AI_DIAGNOSIS_OPEN_SIDE_PANEL"
  };

  // ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/external.js
  var external_exports = {};
  __export(external_exports, {
    BRAND: () => BRAND,
    DIRTY: () => DIRTY,
    EMPTY_PATH: () => EMPTY_PATH,
    INVALID: () => INVALID,
    NEVER: () => NEVER,
    OK: () => OK,
    ParseStatus: () => ParseStatus,
    Schema: () => ZodType,
    ZodAny: () => ZodAny,
    ZodArray: () => ZodArray,
    ZodBigInt: () => ZodBigInt,
    ZodBoolean: () => ZodBoolean,
    ZodBranded: () => ZodBranded,
    ZodCatch: () => ZodCatch,
    ZodDate: () => ZodDate,
    ZodDefault: () => ZodDefault,
    ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
    ZodEffects: () => ZodEffects,
    ZodEnum: () => ZodEnum,
    ZodError: () => ZodError,
    ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
    ZodFunction: () => ZodFunction,
    ZodIntersection: () => ZodIntersection,
    ZodIssueCode: () => ZodIssueCode,
    ZodLazy: () => ZodLazy,
    ZodLiteral: () => ZodLiteral,
    ZodMap: () => ZodMap,
    ZodNaN: () => ZodNaN,
    ZodNativeEnum: () => ZodNativeEnum,
    ZodNever: () => ZodNever,
    ZodNull: () => ZodNull,
    ZodNullable: () => ZodNullable,
    ZodNumber: () => ZodNumber,
    ZodObject: () => ZodObject,
    ZodOptional: () => ZodOptional,
    ZodParsedType: () => ZodParsedType,
    ZodPipeline: () => ZodPipeline,
    ZodPromise: () => ZodPromise,
    ZodReadonly: () => ZodReadonly,
    ZodRecord: () => ZodRecord,
    ZodSchema: () => ZodType,
    ZodSet: () => ZodSet,
    ZodString: () => ZodString,
    ZodSymbol: () => ZodSymbol,
    ZodTransformer: () => ZodEffects,
    ZodTuple: () => ZodTuple,
    ZodType: () => ZodType,
    ZodUndefined: () => ZodUndefined,
    ZodUnion: () => ZodUnion,
    ZodUnknown: () => ZodUnknown,
    ZodVoid: () => ZodVoid,
    addIssueToContext: () => addIssueToContext,
    any: () => anyType,
    array: () => arrayType,
    bigint: () => bigIntType,
    boolean: () => booleanType,
    coerce: () => coerce,
    custom: () => custom,
    date: () => dateType,
    datetimeRegex: () => datetimeRegex,
    defaultErrorMap: () => en_default,
    discriminatedUnion: () => discriminatedUnionType,
    effect: () => effectsType,
    enum: () => enumType,
    function: () => functionType,
    getErrorMap: () => getErrorMap,
    getParsedType: () => getParsedType,
    instanceof: () => instanceOfType,
    intersection: () => intersectionType,
    isAborted: () => isAborted,
    isAsync: () => isAsync,
    isDirty: () => isDirty,
    isValid: () => isValid,
    late: () => late,
    lazy: () => lazyType,
    literal: () => literalType,
    makeIssue: () => makeIssue,
    map: () => mapType,
    nan: () => nanType,
    nativeEnum: () => nativeEnumType,
    never: () => neverType,
    null: () => nullType,
    nullable: () => nullableType,
    number: () => numberType,
    object: () => objectType,
    objectUtil: () => objectUtil,
    oboolean: () => oboolean,
    onumber: () => onumber,
    optional: () => optionalType,
    ostring: () => ostring,
    pipeline: () => pipelineType,
    preprocess: () => preprocessType,
    promise: () => promiseType,
    quotelessJson: () => quotelessJson,
    record: () => recordType,
    set: () => setType,
    setErrorMap: () => setErrorMap,
    strictObject: () => strictObjectType,
    string: () => stringType,
    symbol: () => symbolType,
    transformer: () => effectsType,
    tuple: () => tupleType,
    undefined: () => undefinedType,
    union: () => unionType,
    unknown: () => unknownType,
    util: () => util,
    void: () => voidType
  });

  // ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/util.js
  var util;
  (function(util2) {
    util2.assertEqual = (_) => {
    };
    function assertIs(_arg) {
    }
    util2.assertIs = assertIs;
    function assertNever(_x) {
      throw new Error();
    }
    util2.assertNever = assertNever;
    util2.arrayToEnum = (items) => {
      const obj = {};
      for (const item of items) {
        obj[item] = item;
      }
      return obj;
    };
    util2.getValidEnumValues = (obj) => {
      const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
      const filtered = {};
      for (const k of validKeys) {
        filtered[k] = obj[k];
      }
      return util2.objectValues(filtered);
    };
    util2.objectValues = (obj) => {
      return util2.objectKeys(obj).map(function(e) {
        return obj[e];
      });
    };
    util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
      const keys = [];
      for (const key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          keys.push(key);
        }
      }
      return keys;
    };
    util2.find = (arr, checker) => {
      for (const item of arr) {
        if (checker(item))
          return item;
      }
      return void 0;
    };
    util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
    function joinValues(array, separator = " | ") {
      return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
    }
    util2.joinValues = joinValues;
    util2.jsonStringifyReplacer = (_, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    };
  })(util || (util = {}));
  var objectUtil;
  (function(objectUtil2) {
    objectUtil2.mergeShapes = (first, second) => {
      return {
        ...first,
        ...second
        // second overwrites first
      };
    };
  })(objectUtil || (objectUtil = {}));
  var ZodParsedType = util.arrayToEnum([
    "string",
    "nan",
    "number",
    "integer",
    "float",
    "boolean",
    "date",
    "bigint",
    "symbol",
    "function",
    "undefined",
    "null",
    "array",
    "object",
    "unknown",
    "promise",
    "void",
    "never",
    "map",
    "set"
  ]);
  var getParsedType = (data) => {
    const t = typeof data;
    switch (t) {
      case "undefined":
        return ZodParsedType.undefined;
      case "string":
        return ZodParsedType.string;
      case "number":
        return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
      case "boolean":
        return ZodParsedType.boolean;
      case "function":
        return ZodParsedType.function;
      case "bigint":
        return ZodParsedType.bigint;
      case "symbol":
        return ZodParsedType.symbol;
      case "object":
        if (Array.isArray(data)) {
          return ZodParsedType.array;
        }
        if (data === null) {
          return ZodParsedType.null;
        }
        if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
          return ZodParsedType.promise;
        }
        if (typeof Map !== "undefined" && data instanceof Map) {
          return ZodParsedType.map;
        }
        if (typeof Set !== "undefined" && data instanceof Set) {
          return ZodParsedType.set;
        }
        if (typeof Date !== "undefined" && data instanceof Date) {
          return ZodParsedType.date;
        }
        return ZodParsedType.object;
      default:
        return ZodParsedType.unknown;
    }
  };

  // ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/ZodError.js
  var ZodIssueCode = util.arrayToEnum([
    "invalid_type",
    "invalid_literal",
    "custom",
    "invalid_union",
    "invalid_union_discriminator",
    "invalid_enum_value",
    "unrecognized_keys",
    "invalid_arguments",
    "invalid_return_type",
    "invalid_date",
    "invalid_string",
    "too_small",
    "too_big",
    "invalid_intersection_types",
    "not_multiple_of",
    "not_finite"
  ]);
  var quotelessJson = (obj) => {
    const json = JSON.stringify(obj, null, 2);
    return json.replace(/"([^"]+)":/g, "$1:");
  };
  var ZodError = class _ZodError extends Error {
    get errors() {
      return this.issues;
    }
    constructor(issues) {
      super();
      this.issues = [];
      this.addIssue = (sub) => {
        this.issues = [...this.issues, sub];
      };
      this.addIssues = (subs = []) => {
        this.issues = [...this.issues, ...subs];
      };
      const actualProto = new.target.prototype;
      if (Object.setPrototypeOf) {
        Object.setPrototypeOf(this, actualProto);
      } else {
        this.__proto__ = actualProto;
      }
      this.name = "ZodError";
      this.issues = issues;
    }
    format(_mapper) {
      const mapper = _mapper || function(issue) {
        return issue.message;
      };
      const fieldErrors = { _errors: [] };
      const processError = (error) => {
        for (const issue of error.issues) {
          if (issue.code === "invalid_union") {
            issue.unionErrors.map(processError);
          } else if (issue.code === "invalid_return_type") {
            processError(issue.returnTypeError);
          } else if (issue.code === "invalid_arguments") {
            processError(issue.argumentsError);
          } else if (issue.path.length === 0) {
            fieldErrors._errors.push(mapper(issue));
          } else {
            let curr = fieldErrors;
            let i = 0;
            while (i < issue.path.length) {
              const el = issue.path[i];
              const terminal = i === issue.path.length - 1;
              if (!terminal) {
                curr[el] = curr[el] || { _errors: [] };
              } else {
                curr[el] = curr[el] || { _errors: [] };
                curr[el]._errors.push(mapper(issue));
              }
              curr = curr[el];
              i++;
            }
          }
        }
      };
      processError(this);
      return fieldErrors;
    }
    static assert(value) {
      if (!(value instanceof _ZodError)) {
        throw new Error(`Not a ZodError: ${value}`);
      }
    }
    toString() {
      return this.message;
    }
    get message() {
      return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
    }
    get isEmpty() {
      return this.issues.length === 0;
    }
    flatten(mapper = (issue) => issue.message) {
      const fieldErrors = {};
      const formErrors = [];
      for (const sub of this.issues) {
        if (sub.path.length > 0) {
          const firstEl = sub.path[0];
          fieldErrors[firstEl] = fieldErrors[firstEl] || [];
          fieldErrors[firstEl].push(mapper(sub));
        } else {
          formErrors.push(mapper(sub));
        }
      }
      return { formErrors, fieldErrors };
    }
    get formErrors() {
      return this.flatten();
    }
  };
  ZodError.create = (issues) => {
    const error = new ZodError(issues);
    return error;
  };

  // ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/locales/en.js
  var errorMap = (issue, _ctx) => {
    let message;
    switch (issue.code) {
      case ZodIssueCode.invalid_type:
        if (issue.received === ZodParsedType.undefined) {
          message = "Required";
        } else {
          message = `Expected ${issue.expected}, received ${issue.received}`;
        }
        break;
      case ZodIssueCode.invalid_literal:
        message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
        break;
      case ZodIssueCode.unrecognized_keys:
        message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
        break;
      case ZodIssueCode.invalid_union:
        message = `Invalid input`;
        break;
      case ZodIssueCode.invalid_union_discriminator:
        message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
        break;
      case ZodIssueCode.invalid_enum_value:
        message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
        break;
      case ZodIssueCode.invalid_arguments:
        message = `Invalid function arguments`;
        break;
      case ZodIssueCode.invalid_return_type:
        message = `Invalid function return type`;
        break;
      case ZodIssueCode.invalid_date:
        message = `Invalid date`;
        break;
      case ZodIssueCode.invalid_string:
        if (typeof issue.validation === "object") {
          if ("includes" in issue.validation) {
            message = `Invalid input: must include "${issue.validation.includes}"`;
            if (typeof issue.validation.position === "number") {
              message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
            }
          } else if ("startsWith" in issue.validation) {
            message = `Invalid input: must start with "${issue.validation.startsWith}"`;
          } else if ("endsWith" in issue.validation) {
            message = `Invalid input: must end with "${issue.validation.endsWith}"`;
          } else {
            util.assertNever(issue.validation);
          }
        } else if (issue.validation !== "regex") {
          message = `Invalid ${issue.validation}`;
        } else {
          message = "Invalid";
        }
        break;
      case ZodIssueCode.too_small:
        if (issue.type === "array")
          message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
        else if (issue.type === "string")
          message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
        else if (issue.type === "number")
          message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
        else if (issue.type === "bigint")
          message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
        else if (issue.type === "date")
          message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
        else
          message = "Invalid input";
        break;
      case ZodIssueCode.too_big:
        if (issue.type === "array")
          message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
        else if (issue.type === "string")
          message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
        else if (issue.type === "number")
          message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
        else if (issue.type === "bigint")
          message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
        else if (issue.type === "date")
          message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
        else
          message = "Invalid input";
        break;
      case ZodIssueCode.custom:
        message = `Invalid input`;
        break;
      case ZodIssueCode.invalid_intersection_types:
        message = `Intersection results could not be merged`;
        break;
      case ZodIssueCode.not_multiple_of:
        message = `Number must be a multiple of ${issue.multipleOf}`;
        break;
      case ZodIssueCode.not_finite:
        message = "Number must be finite";
        break;
      default:
        message = _ctx.defaultError;
        util.assertNever(issue);
    }
    return { message };
  };
  var en_default = errorMap;

  // ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/errors.js
  var overrideErrorMap = en_default;
  function setErrorMap(map) {
    overrideErrorMap = map;
  }
  function getErrorMap() {
    return overrideErrorMap;
  }

  // ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/parseUtil.js
  var makeIssue = (params) => {
    const { data, path, errorMaps, issueData } = params;
    const fullPath = [...path, ...issueData.path || []];
    const fullIssue = {
      ...issueData,
      path: fullPath
    };
    if (issueData.message !== void 0) {
      return {
        ...issueData,
        path: fullPath,
        message: issueData.message
      };
    }
    let errorMessage = "";
    const maps = errorMaps.filter((m) => !!m).slice().reverse();
    for (const map of maps) {
      errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
    }
    return {
      ...issueData,
      path: fullPath,
      message: errorMessage
    };
  };
  var EMPTY_PATH = [];
  function addIssueToContext(ctx, issueData) {
    const overrideMap = getErrorMap();
    const issue = makeIssue({
      issueData,
      data: ctx.data,
      path: ctx.path,
      errorMaps: [
        ctx.common.contextualErrorMap,
        // contextual error map is first priority
        ctx.schemaErrorMap,
        // then schema-bound map if available
        overrideMap,
        // then global override map
        overrideMap === en_default ? void 0 : en_default
        // then global default map
      ].filter((x) => !!x)
    });
    ctx.common.issues.push(issue);
  }
  var ParseStatus = class _ParseStatus {
    constructor() {
      this.value = "valid";
    }
    dirty() {
      if (this.value === "valid")
        this.value = "dirty";
    }
    abort() {
      if (this.value !== "aborted")
        this.value = "aborted";
    }
    static mergeArray(status, results) {
      const arrayValue = [];
      for (const s of results) {
        if (s.status === "aborted")
          return INVALID;
        if (s.status === "dirty")
          status.dirty();
        arrayValue.push(s.value);
      }
      return { status: status.value, value: arrayValue };
    }
    static async mergeObjectAsync(status, pairs) {
      const syncPairs = [];
      for (const pair of pairs) {
        const key = await pair.key;
        const value = await pair.value;
        syncPairs.push({
          key,
          value
        });
      }
      return _ParseStatus.mergeObjectSync(status, syncPairs);
    }
    static mergeObjectSync(status, pairs) {
      const finalObject = {};
      for (const pair of pairs) {
        const { key, value } = pair;
        if (key.status === "aborted")
          return INVALID;
        if (value.status === "aborted")
          return INVALID;
        if (key.status === "dirty")
          status.dirty();
        if (value.status === "dirty")
          status.dirty();
        if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
          finalObject[key.value] = value.value;
        }
      }
      return { status: status.value, value: finalObject };
    }
  };
  var INVALID = Object.freeze({
    status: "aborted"
  });
  var DIRTY = (value) => ({ status: "dirty", value });
  var OK = (value) => ({ status: "valid", value });
  var isAborted = (x) => x.status === "aborted";
  var isDirty = (x) => x.status === "dirty";
  var isValid = (x) => x.status === "valid";
  var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

  // ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/errorUtil.js
  var errorUtil;
  (function(errorUtil2) {
    errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
    errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
  })(errorUtil || (errorUtil = {}));

  // ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.js
  var ParseInputLazyPath = class {
    constructor(parent, value, path, key) {
      this._cachedPath = [];
      this.parent = parent;
      this.data = value;
      this._path = path;
      this._key = key;
    }
    get path() {
      if (!this._cachedPath.length) {
        if (Array.isArray(this._key)) {
          this._cachedPath.push(...this._path, ...this._key);
        } else {
          this._cachedPath.push(...this._path, this._key);
        }
      }
      return this._cachedPath;
    }
  };
  var handleResult = (ctx, result) => {
    if (isValid(result)) {
      return { success: true, data: result.value };
    } else {
      if (!ctx.common.issues.length) {
        throw new Error("Validation failed but no issues detected.");
      }
      return {
        success: false,
        get error() {
          if (this._error)
            return this._error;
          const error = new ZodError(ctx.common.issues);
          this._error = error;
          return this._error;
        }
      };
    }
  };
  function processCreateParams(params) {
    if (!params)
      return {};
    const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
    if (errorMap2 && (invalid_type_error || required_error)) {
      throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
    }
    if (errorMap2)
      return { errorMap: errorMap2, description };
    const customMap = (iss, ctx) => {
      const { message } = params;
      if (iss.code === "invalid_enum_value") {
        return { message: message ?? ctx.defaultError };
      }
      if (typeof ctx.data === "undefined") {
        return { message: message ?? required_error ?? ctx.defaultError };
      }
      if (iss.code !== "invalid_type")
        return { message: ctx.defaultError };
      return { message: message ?? invalid_type_error ?? ctx.defaultError };
    };
    return { errorMap: customMap, description };
  }
  var ZodType = class {
    get description() {
      return this._def.description;
    }
    _getType(input) {
      return getParsedType(input.data);
    }
    _getOrReturnCtx(input, ctx) {
      return ctx || {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      };
    }
    _processInputParams(input) {
      return {
        status: new ParseStatus(),
        ctx: {
          common: input.parent.common,
          data: input.data,
          parsedType: getParsedType(input.data),
          schemaErrorMap: this._def.errorMap,
          path: input.path,
          parent: input.parent
        }
      };
    }
    _parseSync(input) {
      const result = this._parse(input);
      if (isAsync(result)) {
        throw new Error("Synchronous parse encountered promise.");
      }
      return result;
    }
    _parseAsync(input) {
      const result = this._parse(input);
      return Promise.resolve(result);
    }
    parse(data, params) {
      const result = this.safeParse(data, params);
      if (result.success)
        return result.data;
      throw result.error;
    }
    safeParse(data, params) {
      const ctx = {
        common: {
          issues: [],
          async: params?.async ?? false,
          contextualErrorMap: params?.errorMap
        },
        path: params?.path || [],
        schemaErrorMap: this._def.errorMap,
        parent: null,
        data,
        parsedType: getParsedType(data)
      };
      const result = this._parseSync({ data, path: ctx.path, parent: ctx });
      return handleResult(ctx, result);
    }
    "~validate"(data) {
      const ctx = {
        common: {
          issues: [],
          async: !!this["~standard"].async
        },
        path: [],
        schemaErrorMap: this._def.errorMap,
        parent: null,
        data,
        parsedType: getParsedType(data)
      };
      if (!this["~standard"].async) {
        try {
          const result = this._parseSync({ data, path: [], parent: ctx });
          return isValid(result) ? {
            value: result.value
          } : {
            issues: ctx.common.issues
          };
        } catch (err) {
          if (err?.message?.toLowerCase()?.includes("encountered")) {
            this["~standard"].async = true;
          }
          ctx.common = {
            issues: [],
            async: true
          };
        }
      }
      return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
        value: result.value
      } : {
        issues: ctx.common.issues
      });
    }
    async parseAsync(data, params) {
      const result = await this.safeParseAsync(data, params);
      if (result.success)
        return result.data;
      throw result.error;
    }
    async safeParseAsync(data, params) {
      const ctx = {
        common: {
          issues: [],
          contextualErrorMap: params?.errorMap,
          async: true
        },
        path: params?.path || [],
        schemaErrorMap: this._def.errorMap,
        parent: null,
        data,
        parsedType: getParsedType(data)
      };
      const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
      const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
      return handleResult(ctx, result);
    }
    refine(check, message) {
      const getIssueProperties = (val) => {
        if (typeof message === "string" || typeof message === "undefined") {
          return { message };
        } else if (typeof message === "function") {
          return message(val);
        } else {
          return message;
        }
      };
      return this._refinement((val, ctx) => {
        const result = check(val);
        const setError = () => ctx.addIssue({
          code: ZodIssueCode.custom,
          ...getIssueProperties(val)
        });
        if (typeof Promise !== "undefined" && result instanceof Promise) {
          return result.then((data) => {
            if (!data) {
              setError();
              return false;
            } else {
              return true;
            }
          });
        }
        if (!result) {
          setError();
          return false;
        } else {
          return true;
        }
      });
    }
    refinement(check, refinementData) {
      return this._refinement((val, ctx) => {
        if (!check(val)) {
          ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
          return false;
        } else {
          return true;
        }
      });
    }
    _refinement(refinement) {
      return new ZodEffects({
        schema: this,
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        effect: { type: "refinement", refinement }
      });
    }
    superRefine(refinement) {
      return this._refinement(refinement);
    }
    constructor(def) {
      this.spa = this.safeParseAsync;
      this._def = def;
      this.parse = this.parse.bind(this);
      this.safeParse = this.safeParse.bind(this);
      this.parseAsync = this.parseAsync.bind(this);
      this.safeParseAsync = this.safeParseAsync.bind(this);
      this.spa = this.spa.bind(this);
      this.refine = this.refine.bind(this);
      this.refinement = this.refinement.bind(this);
      this.superRefine = this.superRefine.bind(this);
      this.optional = this.optional.bind(this);
      this.nullable = this.nullable.bind(this);
      this.nullish = this.nullish.bind(this);
      this.array = this.array.bind(this);
      this.promise = this.promise.bind(this);
      this.or = this.or.bind(this);
      this.and = this.and.bind(this);
      this.transform = this.transform.bind(this);
      this.brand = this.brand.bind(this);
      this.default = this.default.bind(this);
      this.catch = this.catch.bind(this);
      this.describe = this.describe.bind(this);
      this.pipe = this.pipe.bind(this);
      this.readonly = this.readonly.bind(this);
      this.isNullable = this.isNullable.bind(this);
      this.isOptional = this.isOptional.bind(this);
      this["~standard"] = {
        version: 1,
        vendor: "zod",
        validate: (data) => this["~validate"](data)
      };
    }
    optional() {
      return ZodOptional.create(this, this._def);
    }
    nullable() {
      return ZodNullable.create(this, this._def);
    }
    nullish() {
      return this.nullable().optional();
    }
    array() {
      return ZodArray.create(this);
    }
    promise() {
      return ZodPromise.create(this, this._def);
    }
    or(option) {
      return ZodUnion.create([this, option], this._def);
    }
    and(incoming) {
      return ZodIntersection.create(this, incoming, this._def);
    }
    transform(transform) {
      return new ZodEffects({
        ...processCreateParams(this._def),
        schema: this,
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        effect: { type: "transform", transform }
      });
    }
    default(def) {
      const defaultValueFunc = typeof def === "function" ? def : () => def;
      return new ZodDefault({
        ...processCreateParams(this._def),
        innerType: this,
        defaultValue: defaultValueFunc,
        typeName: ZodFirstPartyTypeKind.ZodDefault
      });
    }
    brand() {
      return new ZodBranded({
        typeName: ZodFirstPartyTypeKind.ZodBranded,
        type: this,
        ...processCreateParams(this._def)
      });
    }
    catch(def) {
      const catchValueFunc = typeof def === "function" ? def : () => def;
      return new ZodCatch({
        ...processCreateParams(this._def),
        innerType: this,
        catchValue: catchValueFunc,
        typeName: ZodFirstPartyTypeKind.ZodCatch
      });
    }
    describe(description) {
      const This = this.constructor;
      return new This({
        ...this._def,
        description
      });
    }
    pipe(target) {
      return ZodPipeline.create(this, target);
    }
    readonly() {
      return ZodReadonly.create(this);
    }
    isOptional() {
      return this.safeParse(void 0).success;
    }
    isNullable() {
      return this.safeParse(null).success;
    }
  };
  var cuidRegex = /^c[^\s-]{8,}$/i;
  var cuid2Regex = /^[0-9a-z]+$/;
  var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
  var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
  var nanoidRegex = /^[a-z0-9_-]{21}$/i;
  var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
  var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
  var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
  var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
  var emojiRegex;
  var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
  var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
  var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
  var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
  var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
  var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
  var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
  var dateRegex = new RegExp(`^${dateRegexSource}$`);
  function timeRegexSource(args) {
    let secondsRegexSource = `[0-5]\\d`;
    if (args.precision) {
      secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
    } else if (args.precision == null) {
      secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
    }
    const secondsQuantifier = args.precision ? "+" : "?";
    return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
  }
  function timeRegex(args) {
    return new RegExp(`^${timeRegexSource(args)}$`);
  }
  function datetimeRegex(args) {
    let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
    const opts = [];
    opts.push(args.local ? `Z?` : `Z`);
    if (args.offset)
      opts.push(`([+-]\\d{2}:?\\d{2})`);
    regex = `${regex}(${opts.join("|")})`;
    return new RegExp(`^${regex}$`);
  }
  function isValidIP(ip, version) {
    if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
      return true;
    }
    if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
      return true;
    }
    return false;
  }
  function isValidJWT(jwt, alg) {
    if (!jwtRegex.test(jwt))
      return false;
    try {
      const [header] = jwt.split(".");
      if (!header)
        return false;
      const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
      const decoded = JSON.parse(atob(base64));
      if (typeof decoded !== "object" || decoded === null)
        return false;
      if ("typ" in decoded && decoded?.typ !== "JWT")
        return false;
      if (!decoded.alg)
        return false;
      if (alg && decoded.alg !== alg)
        return false;
      return true;
    } catch {
      return false;
    }
  }
  function isValidCidr(ip, version) {
    if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
      return true;
    }
    if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
      return true;
    }
    return false;
  }
  var ZodString = class _ZodString extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = String(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.string) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.string,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      const status = new ParseStatus();
      let ctx = void 0;
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          if (input.data.length < check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          if (input.data.length > check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "length") {
          const tooBig = input.data.length > check.value;
          const tooSmall = input.data.length < check.value;
          if (tooBig || tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            if (tooBig) {
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                maximum: check.value,
                type: "string",
                inclusive: true,
                exact: true,
                message: check.message
              });
            } else if (tooSmall) {
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                minimum: check.value,
                type: "string",
                inclusive: true,
                exact: true,
                message: check.message
              });
            }
            status.dirty();
          }
        } else if (check.kind === "email") {
          if (!emailRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "email",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "emoji") {
          if (!emojiRegex) {
            emojiRegex = new RegExp(_emojiRegex, "u");
          }
          if (!emojiRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "emoji",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "uuid") {
          if (!uuidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "uuid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "nanoid") {
          if (!nanoidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "nanoid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cuid") {
          if (!cuidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cuid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cuid2") {
          if (!cuid2Regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cuid2",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "ulid") {
          if (!ulidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "ulid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "url") {
          try {
            new URL(input.data);
          } catch {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "url",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "regex") {
          check.regex.lastIndex = 0;
          const testResult = check.regex.test(input.data);
          if (!testResult) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "regex",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "trim") {
          input.data = input.data.trim();
        } else if (check.kind === "includes") {
          if (!input.data.includes(check.value, check.position)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { includes: check.value, position: check.position },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "toLowerCase") {
          input.data = input.data.toLowerCase();
        } else if (check.kind === "toUpperCase") {
          input.data = input.data.toUpperCase();
        } else if (check.kind === "startsWith") {
          if (!input.data.startsWith(check.value)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { startsWith: check.value },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "endsWith") {
          if (!input.data.endsWith(check.value)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { endsWith: check.value },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "datetime") {
          const regex = datetimeRegex(check);
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "datetime",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "date") {
          const regex = dateRegex;
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "date",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "time") {
          const regex = timeRegex(check);
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "time",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "duration") {
          if (!durationRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "duration",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "ip") {
          if (!isValidIP(input.data, check.version)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "ip",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "jwt") {
          if (!isValidJWT(input.data, check.alg)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "jwt",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cidr") {
          if (!isValidCidr(input.data, check.version)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cidr",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "base64") {
          if (!base64Regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "base64",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "base64url") {
          if (!base64urlRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "base64url",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    _regex(regex, validation, message) {
      return this.refinement((data) => regex.test(data), {
        validation,
        code: ZodIssueCode.invalid_string,
        ...errorUtil.errToObj(message)
      });
    }
    _addCheck(check) {
      return new _ZodString({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    email(message) {
      return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
    }
    url(message) {
      return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
    }
    emoji(message) {
      return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
    }
    uuid(message) {
      return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
    }
    nanoid(message) {
      return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
    }
    cuid(message) {
      return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
    }
    cuid2(message) {
      return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
    }
    ulid(message) {
      return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
    }
    base64(message) {
      return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
    }
    base64url(message) {
      return this._addCheck({
        kind: "base64url",
        ...errorUtil.errToObj(message)
      });
    }
    jwt(options) {
      return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
    }
    ip(options) {
      return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
    }
    cidr(options) {
      return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
    }
    datetime(options) {
      if (typeof options === "string") {
        return this._addCheck({
          kind: "datetime",
          precision: null,
          offset: false,
          local: false,
          message: options
        });
      }
      return this._addCheck({
        kind: "datetime",
        precision: typeof options?.precision === "undefined" ? null : options?.precision,
        offset: options?.offset ?? false,
        local: options?.local ?? false,
        ...errorUtil.errToObj(options?.message)
      });
    }
    date(message) {
      return this._addCheck({ kind: "date", message });
    }
    time(options) {
      if (typeof options === "string") {
        return this._addCheck({
          kind: "time",
          precision: null,
          message: options
        });
      }
      return this._addCheck({
        kind: "time",
        precision: typeof options?.precision === "undefined" ? null : options?.precision,
        ...errorUtil.errToObj(options?.message)
      });
    }
    duration(message) {
      return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
    }
    regex(regex, message) {
      return this._addCheck({
        kind: "regex",
        regex,
        ...errorUtil.errToObj(message)
      });
    }
    includes(value, options) {
      return this._addCheck({
        kind: "includes",
        value,
        position: options?.position,
        ...errorUtil.errToObj(options?.message)
      });
    }
    startsWith(value, message) {
      return this._addCheck({
        kind: "startsWith",
        value,
        ...errorUtil.errToObj(message)
      });
    }
    endsWith(value, message) {
      return this._addCheck({
        kind: "endsWith",
        value,
        ...errorUtil.errToObj(message)
      });
    }
    min(minLength, message) {
      return this._addCheck({
        kind: "min",
        value: minLength,
        ...errorUtil.errToObj(message)
      });
    }
    max(maxLength, message) {
      return this._addCheck({
        kind: "max",
        value: maxLength,
        ...errorUtil.errToObj(message)
      });
    }
    length(len, message) {
      return this._addCheck({
        kind: "length",
        value: len,
        ...errorUtil.errToObj(message)
      });
    }
    /**
     * Equivalent to `.min(1)`
     */
    nonempty(message) {
      return this.min(1, errorUtil.errToObj(message));
    }
    trim() {
      return new _ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "trim" }]
      });
    }
    toLowerCase() {
      return new _ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "toLowerCase" }]
      });
    }
    toUpperCase() {
      return new _ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "toUpperCase" }]
      });
    }
    get isDatetime() {
      return !!this._def.checks.find((ch) => ch.kind === "datetime");
    }
    get isDate() {
      return !!this._def.checks.find((ch) => ch.kind === "date");
    }
    get isTime() {
      return !!this._def.checks.find((ch) => ch.kind === "time");
    }
    get isDuration() {
      return !!this._def.checks.find((ch) => ch.kind === "duration");
    }
    get isEmail() {
      return !!this._def.checks.find((ch) => ch.kind === "email");
    }
    get isURL() {
      return !!this._def.checks.find((ch) => ch.kind === "url");
    }
    get isEmoji() {
      return !!this._def.checks.find((ch) => ch.kind === "emoji");
    }
    get isUUID() {
      return !!this._def.checks.find((ch) => ch.kind === "uuid");
    }
    get isNANOID() {
      return !!this._def.checks.find((ch) => ch.kind === "nanoid");
    }
    get isCUID() {
      return !!this._def.checks.find((ch) => ch.kind === "cuid");
    }
    get isCUID2() {
      return !!this._def.checks.find((ch) => ch.kind === "cuid2");
    }
    get isULID() {
      return !!this._def.checks.find((ch) => ch.kind === "ulid");
    }
    get isIP() {
      return !!this._def.checks.find((ch) => ch.kind === "ip");
    }
    get isCIDR() {
      return !!this._def.checks.find((ch) => ch.kind === "cidr");
    }
    get isBase64() {
      return !!this._def.checks.find((ch) => ch.kind === "base64");
    }
    get isBase64url() {
      return !!this._def.checks.find((ch) => ch.kind === "base64url");
    }
    get minLength() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxLength() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
  };
  ZodString.create = (params) => {
    return new ZodString({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodString,
      coerce: params?.coerce ?? false,
      ...processCreateParams(params)
    });
  };
  function floatSafeRemainder(val, step) {
    const valDecCount = (val.toString().split(".")[1] || "").length;
    const stepDecCount = (step.toString().split(".")[1] || "").length;
    const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
    const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
    const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
    return valInt % stepInt / 10 ** decCount;
  }
  var ZodNumber = class _ZodNumber extends ZodType {
    constructor() {
      super(...arguments);
      this.min = this.gte;
      this.max = this.lte;
      this.step = this.multipleOf;
    }
    _parse(input) {
      if (this._def.coerce) {
        input.data = Number(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.number) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.number,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      let ctx = void 0;
      const status = new ParseStatus();
      for (const check of this._def.checks) {
        if (check.kind === "int") {
          if (!util.isInteger(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_type,
              expected: "integer",
              received: "float",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "min") {
          const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
          if (tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "number",
              inclusive: check.inclusive,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
          if (tooBig) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "number",
              inclusive: check.inclusive,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "multipleOf") {
          if (floatSafeRemainder(input.data, check.value) !== 0) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_multiple_of,
              multipleOf: check.value,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "finite") {
          if (!Number.isFinite(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_finite,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    gte(value, message) {
      return this.setLimit("min", value, true, errorUtil.toString(message));
    }
    gt(value, message) {
      return this.setLimit("min", value, false, errorUtil.toString(message));
    }
    lte(value, message) {
      return this.setLimit("max", value, true, errorUtil.toString(message));
    }
    lt(value, message) {
      return this.setLimit("max", value, false, errorUtil.toString(message));
    }
    setLimit(kind, value, inclusive, message) {
      return new _ZodNumber({
        ...this._def,
        checks: [
          ...this._def.checks,
          {
            kind,
            value,
            inclusive,
            message: errorUtil.toString(message)
          }
        ]
      });
    }
    _addCheck(check) {
      return new _ZodNumber({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    int(message) {
      return this._addCheck({
        kind: "int",
        message: errorUtil.toString(message)
      });
    }
    positive(message) {
      return this._addCheck({
        kind: "min",
        value: 0,
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    negative(message) {
      return this._addCheck({
        kind: "max",
        value: 0,
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    nonpositive(message) {
      return this._addCheck({
        kind: "max",
        value: 0,
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    nonnegative(message) {
      return this._addCheck({
        kind: "min",
        value: 0,
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    multipleOf(value, message) {
      return this._addCheck({
        kind: "multipleOf",
        value,
        message: errorUtil.toString(message)
      });
    }
    finite(message) {
      return this._addCheck({
        kind: "finite",
        message: errorUtil.toString(message)
      });
    }
    safe(message) {
      return this._addCheck({
        kind: "min",
        inclusive: true,
        value: Number.MIN_SAFE_INTEGER,
        message: errorUtil.toString(message)
      })._addCheck({
        kind: "max",
        inclusive: true,
        value: Number.MAX_SAFE_INTEGER,
        message: errorUtil.toString(message)
      });
    }
    get minValue() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxValue() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
    get isInt() {
      return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
    }
    get isFinite() {
      let max = null;
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
          return true;
        } else if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        } else if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return Number.isFinite(min) && Number.isFinite(max);
    }
  };
  ZodNumber.create = (params) => {
    return new ZodNumber({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodNumber,
      coerce: params?.coerce || false,
      ...processCreateParams(params)
    });
  };
  var ZodBigInt = class _ZodBigInt extends ZodType {
    constructor() {
      super(...arguments);
      this.min = this.gte;
      this.max = this.lte;
    }
    _parse(input) {
      if (this._def.coerce) {
        try {
          input.data = BigInt(input.data);
        } catch {
          return this._getInvalidInput(input);
        }
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.bigint) {
        return this._getInvalidInput(input);
      }
      let ctx = void 0;
      const status = new ParseStatus();
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
          if (tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              type: "bigint",
              minimum: check.value,
              inclusive: check.inclusive,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
          if (tooBig) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              type: "bigint",
              maximum: check.value,
              inclusive: check.inclusive,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "multipleOf") {
          if (input.data % check.value !== BigInt(0)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_multiple_of,
              multipleOf: check.value,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    _getInvalidInput(input) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.bigint,
        received: ctx.parsedType
      });
      return INVALID;
    }
    gte(value, message) {
      return this.setLimit("min", value, true, errorUtil.toString(message));
    }
    gt(value, message) {
      return this.setLimit("min", value, false, errorUtil.toString(message));
    }
    lte(value, message) {
      return this.setLimit("max", value, true, errorUtil.toString(message));
    }
    lt(value, message) {
      return this.setLimit("max", value, false, errorUtil.toString(message));
    }
    setLimit(kind, value, inclusive, message) {
      return new _ZodBigInt({
        ...this._def,
        checks: [
          ...this._def.checks,
          {
            kind,
            value,
            inclusive,
            message: errorUtil.toString(message)
          }
        ]
      });
    }
    _addCheck(check) {
      return new _ZodBigInt({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    positive(message) {
      return this._addCheck({
        kind: "min",
        value: BigInt(0),
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    negative(message) {
      return this._addCheck({
        kind: "max",
        value: BigInt(0),
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    nonpositive(message) {
      return this._addCheck({
        kind: "max",
        value: BigInt(0),
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    nonnegative(message) {
      return this._addCheck({
        kind: "min",
        value: BigInt(0),
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    multipleOf(value, message) {
      return this._addCheck({
        kind: "multipleOf",
        value,
        message: errorUtil.toString(message)
      });
    }
    get minValue() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxValue() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
  };
  ZodBigInt.create = (params) => {
    return new ZodBigInt({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodBigInt,
      coerce: params?.coerce ?? false,
      ...processCreateParams(params)
    });
  };
  var ZodBoolean = class extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = Boolean(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.boolean) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.boolean,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodBoolean.create = (params) => {
    return new ZodBoolean({
      typeName: ZodFirstPartyTypeKind.ZodBoolean,
      coerce: params?.coerce || false,
      ...processCreateParams(params)
    });
  };
  var ZodDate = class _ZodDate extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = new Date(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.date) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.date,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      if (Number.isNaN(input.data.getTime())) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_date
        });
        return INVALID;
      }
      const status = new ParseStatus();
      let ctx = void 0;
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          if (input.data.getTime() < check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              message: check.message,
              inclusive: true,
              exact: false,
              minimum: check.value,
              type: "date"
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          if (input.data.getTime() > check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              message: check.message,
              inclusive: true,
              exact: false,
              maximum: check.value,
              type: "date"
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return {
        status: status.value,
        value: new Date(input.data.getTime())
      };
    }
    _addCheck(check) {
      return new _ZodDate({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    min(minDate, message) {
      return this._addCheck({
        kind: "min",
        value: minDate.getTime(),
        message: errorUtil.toString(message)
      });
    }
    max(maxDate, message) {
      return this._addCheck({
        kind: "max",
        value: maxDate.getTime(),
        message: errorUtil.toString(message)
      });
    }
    get minDate() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min != null ? new Date(min) : null;
    }
    get maxDate() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max != null ? new Date(max) : null;
    }
  };
  ZodDate.create = (params) => {
    return new ZodDate({
      checks: [],
      coerce: params?.coerce || false,
      typeName: ZodFirstPartyTypeKind.ZodDate,
      ...processCreateParams(params)
    });
  };
  var ZodSymbol = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.symbol) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.symbol,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodSymbol.create = (params) => {
    return new ZodSymbol({
      typeName: ZodFirstPartyTypeKind.ZodSymbol,
      ...processCreateParams(params)
    });
  };
  var ZodUndefined = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.undefined) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.undefined,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodUndefined.create = (params) => {
    return new ZodUndefined({
      typeName: ZodFirstPartyTypeKind.ZodUndefined,
      ...processCreateParams(params)
    });
  };
  var ZodNull = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.null) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.null,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodNull.create = (params) => {
    return new ZodNull({
      typeName: ZodFirstPartyTypeKind.ZodNull,
      ...processCreateParams(params)
    });
  };
  var ZodAny = class extends ZodType {
    constructor() {
      super(...arguments);
      this._any = true;
    }
    _parse(input) {
      return OK(input.data);
    }
  };
  ZodAny.create = (params) => {
    return new ZodAny({
      typeName: ZodFirstPartyTypeKind.ZodAny,
      ...processCreateParams(params)
    });
  };
  var ZodUnknown = class extends ZodType {
    constructor() {
      super(...arguments);
      this._unknown = true;
    }
    _parse(input) {
      return OK(input.data);
    }
  };
  ZodUnknown.create = (params) => {
    return new ZodUnknown({
      typeName: ZodFirstPartyTypeKind.ZodUnknown,
      ...processCreateParams(params)
    });
  };
  var ZodNever = class extends ZodType {
    _parse(input) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.never,
        received: ctx.parsedType
      });
      return INVALID;
    }
  };
  ZodNever.create = (params) => {
    return new ZodNever({
      typeName: ZodFirstPartyTypeKind.ZodNever,
      ...processCreateParams(params)
    });
  };
  var ZodVoid = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.undefined) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.void,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodVoid.create = (params) => {
    return new ZodVoid({
      typeName: ZodFirstPartyTypeKind.ZodVoid,
      ...processCreateParams(params)
    });
  };
  var ZodArray = class _ZodArray extends ZodType {
    _parse(input) {
      const { ctx, status } = this._processInputParams(input);
      const def = this._def;
      if (ctx.parsedType !== ZodParsedType.array) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.array,
          received: ctx.parsedType
        });
        return INVALID;
      }
      if (def.exactLength !== null) {
        const tooBig = ctx.data.length > def.exactLength.value;
        const tooSmall = ctx.data.length < def.exactLength.value;
        if (tooBig || tooSmall) {
          addIssueToContext(ctx, {
            code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
            minimum: tooSmall ? def.exactLength.value : void 0,
            maximum: tooBig ? def.exactLength.value : void 0,
            type: "array",
            inclusive: true,
            exact: true,
            message: def.exactLength.message
          });
          status.dirty();
        }
      }
      if (def.minLength !== null) {
        if (ctx.data.length < def.minLength.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: def.minLength.value,
            type: "array",
            inclusive: true,
            exact: false,
            message: def.minLength.message
          });
          status.dirty();
        }
      }
      if (def.maxLength !== null) {
        if (ctx.data.length > def.maxLength.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: def.maxLength.value,
            type: "array",
            inclusive: true,
            exact: false,
            message: def.maxLength.message
          });
          status.dirty();
        }
      }
      if (ctx.common.async) {
        return Promise.all([...ctx.data].map((item, i) => {
          return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
        })).then((result2) => {
          return ParseStatus.mergeArray(status, result2);
        });
      }
      const result = [...ctx.data].map((item, i) => {
        return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      });
      return ParseStatus.mergeArray(status, result);
    }
    get element() {
      return this._def.type;
    }
    min(minLength, message) {
      return new _ZodArray({
        ...this._def,
        minLength: { value: minLength, message: errorUtil.toString(message) }
      });
    }
    max(maxLength, message) {
      return new _ZodArray({
        ...this._def,
        maxLength: { value: maxLength, message: errorUtil.toString(message) }
      });
    }
    length(len, message) {
      return new _ZodArray({
        ...this._def,
        exactLength: { value: len, message: errorUtil.toString(message) }
      });
    }
    nonempty(message) {
      return this.min(1, message);
    }
  };
  ZodArray.create = (schema, params) => {
    return new ZodArray({
      type: schema,
      minLength: null,
      maxLength: null,
      exactLength: null,
      typeName: ZodFirstPartyTypeKind.ZodArray,
      ...processCreateParams(params)
    });
  };
  function deepPartialify(schema) {
    if (schema instanceof ZodObject) {
      const newShape = {};
      for (const key in schema.shape) {
        const fieldSchema = schema.shape[key];
        newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
      }
      return new ZodObject({
        ...schema._def,
        shape: () => newShape
      });
    } else if (schema instanceof ZodArray) {
      return new ZodArray({
        ...schema._def,
        type: deepPartialify(schema.element)
      });
    } else if (schema instanceof ZodOptional) {
      return ZodOptional.create(deepPartialify(schema.unwrap()));
    } else if (schema instanceof ZodNullable) {
      return ZodNullable.create(deepPartialify(schema.unwrap()));
    } else if (schema instanceof ZodTuple) {
      return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
    } else {
      return schema;
    }
  }
  var ZodObject = class _ZodObject extends ZodType {
    constructor() {
      super(...arguments);
      this._cached = null;
      this.nonstrict = this.passthrough;
      this.augment = this.extend;
    }
    _getCached() {
      if (this._cached !== null)
        return this._cached;
      const shape = this._def.shape();
      const keys = util.objectKeys(shape);
      this._cached = { shape, keys };
      return this._cached;
    }
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.object) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.object,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      const { status, ctx } = this._processInputParams(input);
      const { shape, keys: shapeKeys } = this._getCached();
      const extraKeys = [];
      if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
        for (const key in ctx.data) {
          if (!shapeKeys.includes(key)) {
            extraKeys.push(key);
          }
        }
      }
      const pairs = [];
      for (const key of shapeKeys) {
        const keyValidator = shape[key];
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
          alwaysSet: key in ctx.data
        });
      }
      if (this._def.catchall instanceof ZodNever) {
        const unknownKeys = this._def.unknownKeys;
        if (unknownKeys === "passthrough") {
          for (const key of extraKeys) {
            pairs.push({
              key: { status: "valid", value: key },
              value: { status: "valid", value: ctx.data[key] }
            });
          }
        } else if (unknownKeys === "strict") {
          if (extraKeys.length > 0) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.unrecognized_keys,
              keys: extraKeys
            });
            status.dirty();
          }
        } else if (unknownKeys === "strip") {
        } else {
          throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
        }
      } else {
        const catchall = this._def.catchall;
        for (const key of extraKeys) {
          const value = ctx.data[key];
          pairs.push({
            key: { status: "valid", value: key },
            value: catchall._parse(
              new ParseInputLazyPath(ctx, value, ctx.path, key)
              //, ctx.child(key), value, getParsedType(value)
            ),
            alwaysSet: key in ctx.data
          });
        }
      }
      if (ctx.common.async) {
        return Promise.resolve().then(async () => {
          const syncPairs = [];
          for (const pair of pairs) {
            const key = await pair.key;
            const value = await pair.value;
            syncPairs.push({
              key,
              value,
              alwaysSet: pair.alwaysSet
            });
          }
          return syncPairs;
        }).then((syncPairs) => {
          return ParseStatus.mergeObjectSync(status, syncPairs);
        });
      } else {
        return ParseStatus.mergeObjectSync(status, pairs);
      }
    }
    get shape() {
      return this._def.shape();
    }
    strict(message) {
      errorUtil.errToObj;
      return new _ZodObject({
        ...this._def,
        unknownKeys: "strict",
        ...message !== void 0 ? {
          errorMap: (issue, ctx) => {
            const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
            if (issue.code === "unrecognized_keys")
              return {
                message: errorUtil.errToObj(message).message ?? defaultError
              };
            return {
              message: defaultError
            };
          }
        } : {}
      });
    }
    strip() {
      return new _ZodObject({
        ...this._def,
        unknownKeys: "strip"
      });
    }
    passthrough() {
      return new _ZodObject({
        ...this._def,
        unknownKeys: "passthrough"
      });
    }
    // const AugmentFactory =
    //   <Def extends ZodObjectDef>(def: Def) =>
    //   <Augmentation extends ZodRawShape>(
    //     augmentation: Augmentation
    //   ): ZodObject<
    //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
    //     Def["unknownKeys"],
    //     Def["catchall"]
    //   > => {
    //     return new ZodObject({
    //       ...def,
    //       shape: () => ({
    //         ...def.shape(),
    //         ...augmentation,
    //       }),
    //     }) as any;
    //   };
    extend(augmentation) {
      return new _ZodObject({
        ...this._def,
        shape: () => ({
          ...this._def.shape(),
          ...augmentation
        })
      });
    }
    /**
     * Prior to zod@1.0.12 there was a bug in the
     * inferred type of merged objects. Please
     * upgrade if you are experiencing issues.
     */
    merge(merging) {
      const merged = new _ZodObject({
        unknownKeys: merging._def.unknownKeys,
        catchall: merging._def.catchall,
        shape: () => ({
          ...this._def.shape(),
          ...merging._def.shape()
        }),
        typeName: ZodFirstPartyTypeKind.ZodObject
      });
      return merged;
    }
    // merge<
    //   Incoming extends AnyZodObject,
    //   Augmentation extends Incoming["shape"],
    //   NewOutput extends {
    //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
    //       ? Augmentation[k]["_output"]
    //       : k extends keyof Output
    //       ? Output[k]
    //       : never;
    //   },
    //   NewInput extends {
    //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
    //       ? Augmentation[k]["_input"]
    //       : k extends keyof Input
    //       ? Input[k]
    //       : never;
    //   }
    // >(
    //   merging: Incoming
    // ): ZodObject<
    //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
    //   Incoming["_def"]["unknownKeys"],
    //   Incoming["_def"]["catchall"],
    //   NewOutput,
    //   NewInput
    // > {
    //   const merged: any = new ZodObject({
    //     unknownKeys: merging._def.unknownKeys,
    //     catchall: merging._def.catchall,
    //     shape: () =>
    //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
    //     typeName: ZodFirstPartyTypeKind.ZodObject,
    //   }) as any;
    //   return merged;
    // }
    setKey(key, schema) {
      return this.augment({ [key]: schema });
    }
    // merge<Incoming extends AnyZodObject>(
    //   merging: Incoming
    // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
    // ZodObject<
    //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
    //   Incoming["_def"]["unknownKeys"],
    //   Incoming["_def"]["catchall"]
    // > {
    //   // const mergedShape = objectUtil.mergeShapes(
    //   //   this._def.shape(),
    //   //   merging._def.shape()
    //   // );
    //   const merged: any = new ZodObject({
    //     unknownKeys: merging._def.unknownKeys,
    //     catchall: merging._def.catchall,
    //     shape: () =>
    //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
    //     typeName: ZodFirstPartyTypeKind.ZodObject,
    //   }) as any;
    //   return merged;
    // }
    catchall(index) {
      return new _ZodObject({
        ...this._def,
        catchall: index
      });
    }
    pick(mask) {
      const shape = {};
      for (const key of util.objectKeys(mask)) {
        if (mask[key] && this.shape[key]) {
          shape[key] = this.shape[key];
        }
      }
      return new _ZodObject({
        ...this._def,
        shape: () => shape
      });
    }
    omit(mask) {
      const shape = {};
      for (const key of util.objectKeys(this.shape)) {
        if (!mask[key]) {
          shape[key] = this.shape[key];
        }
      }
      return new _ZodObject({
        ...this._def,
        shape: () => shape
      });
    }
    /**
     * @deprecated
     */
    deepPartial() {
      return deepPartialify(this);
    }
    partial(mask) {
      const newShape = {};
      for (const key of util.objectKeys(this.shape)) {
        const fieldSchema = this.shape[key];
        if (mask && !mask[key]) {
          newShape[key] = fieldSchema;
        } else {
          newShape[key] = fieldSchema.optional();
        }
      }
      return new _ZodObject({
        ...this._def,
        shape: () => newShape
      });
    }
    required(mask) {
      const newShape = {};
      for (const key of util.objectKeys(this.shape)) {
        if (mask && !mask[key]) {
          newShape[key] = this.shape[key];
        } else {
          const fieldSchema = this.shape[key];
          let newField = fieldSchema;
          while (newField instanceof ZodOptional) {
            newField = newField._def.innerType;
          }
          newShape[key] = newField;
        }
      }
      return new _ZodObject({
        ...this._def,
        shape: () => newShape
      });
    }
    keyof() {
      return createZodEnum(util.objectKeys(this.shape));
    }
  };
  ZodObject.create = (shape, params) => {
    return new ZodObject({
      shape: () => shape,
      unknownKeys: "strip",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  ZodObject.strictCreate = (shape, params) => {
    return new ZodObject({
      shape: () => shape,
      unknownKeys: "strict",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  ZodObject.lazycreate = (shape, params) => {
    return new ZodObject({
      shape,
      unknownKeys: "strip",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  var ZodUnion = class extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const options = this._def.options;
      function handleResults(results) {
        for (const result of results) {
          if (result.result.status === "valid") {
            return result.result;
          }
        }
        for (const result of results) {
          if (result.result.status === "dirty") {
            ctx.common.issues.push(...result.ctx.common.issues);
            return result.result;
          }
        }
        const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union,
          unionErrors
        });
        return INVALID;
      }
      if (ctx.common.async) {
        return Promise.all(options.map(async (option) => {
          const childCtx = {
            ...ctx,
            common: {
              ...ctx.common,
              issues: []
            },
            parent: null
          };
          return {
            result: await option._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: childCtx
            }),
            ctx: childCtx
          };
        })).then(handleResults);
      } else {
        let dirty = void 0;
        const issues = [];
        for (const option of options) {
          const childCtx = {
            ...ctx,
            common: {
              ...ctx.common,
              issues: []
            },
            parent: null
          };
          const result = option._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          });
          if (result.status === "valid") {
            return result;
          } else if (result.status === "dirty" && !dirty) {
            dirty = { result, ctx: childCtx };
          }
          if (childCtx.common.issues.length) {
            issues.push(childCtx.common.issues);
          }
        }
        if (dirty) {
          ctx.common.issues.push(...dirty.ctx.common.issues);
          return dirty.result;
        }
        const unionErrors = issues.map((issues2) => new ZodError(issues2));
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union,
          unionErrors
        });
        return INVALID;
      }
    }
    get options() {
      return this._def.options;
    }
  };
  ZodUnion.create = (types, params) => {
    return new ZodUnion({
      options: types,
      typeName: ZodFirstPartyTypeKind.ZodUnion,
      ...processCreateParams(params)
    });
  };
  var getDiscriminator = (type) => {
    if (type instanceof ZodLazy) {
      return getDiscriminator(type.schema);
    } else if (type instanceof ZodEffects) {
      return getDiscriminator(type.innerType());
    } else if (type instanceof ZodLiteral) {
      return [type.value];
    } else if (type instanceof ZodEnum) {
      return type.options;
    } else if (type instanceof ZodNativeEnum) {
      return util.objectValues(type.enum);
    } else if (type instanceof ZodDefault) {
      return getDiscriminator(type._def.innerType);
    } else if (type instanceof ZodUndefined) {
      return [void 0];
    } else if (type instanceof ZodNull) {
      return [null];
    } else if (type instanceof ZodOptional) {
      return [void 0, ...getDiscriminator(type.unwrap())];
    } else if (type instanceof ZodNullable) {
      return [null, ...getDiscriminator(type.unwrap())];
    } else if (type instanceof ZodBranded) {
      return getDiscriminator(type.unwrap());
    } else if (type instanceof ZodReadonly) {
      return getDiscriminator(type.unwrap());
    } else if (type instanceof ZodCatch) {
      return getDiscriminator(type._def.innerType);
    } else {
      return [];
    }
  };
  var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.object) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.object,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const discriminator = this.discriminator;
      const discriminatorValue = ctx.data[discriminator];
      const option = this.optionsMap.get(discriminatorValue);
      if (!option) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union_discriminator,
          options: Array.from(this.optionsMap.keys()),
          path: [discriminator]
        });
        return INVALID;
      }
      if (ctx.common.async) {
        return option._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
      } else {
        return option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
      }
    }
    get discriminator() {
      return this._def.discriminator;
    }
    get options() {
      return this._def.options;
    }
    get optionsMap() {
      return this._def.optionsMap;
    }
    /**
     * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
     * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
     * have a different value for each object in the union.
     * @param discriminator the name of the discriminator property
     * @param types an array of object schemas
     * @param params
     */
    static create(discriminator, options, params) {
      const optionsMap = /* @__PURE__ */ new Map();
      for (const type of options) {
        const discriminatorValues = getDiscriminator(type.shape[discriminator]);
        if (!discriminatorValues.length) {
          throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
        }
        for (const value of discriminatorValues) {
          if (optionsMap.has(value)) {
            throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
          }
          optionsMap.set(value, type);
        }
      }
      return new _ZodDiscriminatedUnion({
        typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
        discriminator,
        options,
        optionsMap,
        ...processCreateParams(params)
      });
    }
  };
  function mergeValues(a, b) {
    const aType = getParsedType(a);
    const bType = getParsedType(b);
    if (a === b) {
      return { valid: true, data: a };
    } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
      const bKeys = util.objectKeys(b);
      const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
      const newObj = { ...a, ...b };
      for (const key of sharedKeys) {
        const sharedValue = mergeValues(a[key], b[key]);
        if (!sharedValue.valid) {
          return { valid: false };
        }
        newObj[key] = sharedValue.data;
      }
      return { valid: true, data: newObj };
    } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
      if (a.length !== b.length) {
        return { valid: false };
      }
      const newArray = [];
      for (let index = 0; index < a.length; index++) {
        const itemA = a[index];
        const itemB = b[index];
        const sharedValue = mergeValues(itemA, itemB);
        if (!sharedValue.valid) {
          return { valid: false };
        }
        newArray.push(sharedValue.data);
      }
      return { valid: true, data: newArray };
    } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
      return { valid: true, data: a };
    } else {
      return { valid: false };
    }
  }
  var ZodIntersection = class extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      const handleParsed = (parsedLeft, parsedRight) => {
        if (isAborted(parsedLeft) || isAborted(parsedRight)) {
          return INVALID;
        }
        const merged = mergeValues(parsedLeft.value, parsedRight.value);
        if (!merged.valid) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_intersection_types
          });
          return INVALID;
        }
        if (isDirty(parsedLeft) || isDirty(parsedRight)) {
          status.dirty();
        }
        return { status: status.value, value: merged.data };
      };
      if (ctx.common.async) {
        return Promise.all([
          this._def.left._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          }),
          this._def.right._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          })
        ]).then(([left, right]) => handleParsed(left, right));
      } else {
        return handleParsed(this._def.left._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }), this._def.right._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }));
      }
    }
  };
  ZodIntersection.create = (left, right, params) => {
    return new ZodIntersection({
      left,
      right,
      typeName: ZodFirstPartyTypeKind.ZodIntersection,
      ...processCreateParams(params)
    });
  };
  var ZodTuple = class _ZodTuple extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.array) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.array,
          received: ctx.parsedType
        });
        return INVALID;
      }
      if (ctx.data.length < this._def.items.length) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: this._def.items.length,
          inclusive: true,
          exact: false,
          type: "array"
        });
        return INVALID;
      }
      const rest = this._def.rest;
      if (!rest && ctx.data.length > this._def.items.length) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: this._def.items.length,
          inclusive: true,
          exact: false,
          type: "array"
        });
        status.dirty();
      }
      const items = [...ctx.data].map((item, itemIndex) => {
        const schema = this._def.items[itemIndex] || this._def.rest;
        if (!schema)
          return null;
        return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
      }).filter((x) => !!x);
      if (ctx.common.async) {
        return Promise.all(items).then((results) => {
          return ParseStatus.mergeArray(status, results);
        });
      } else {
        return ParseStatus.mergeArray(status, items);
      }
    }
    get items() {
      return this._def.items;
    }
    rest(rest) {
      return new _ZodTuple({
        ...this._def,
        rest
      });
    }
  };
  ZodTuple.create = (schemas, params) => {
    if (!Array.isArray(schemas)) {
      throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
    }
    return new ZodTuple({
      items: schemas,
      typeName: ZodFirstPartyTypeKind.ZodTuple,
      rest: null,
      ...processCreateParams(params)
    });
  };
  var ZodRecord = class _ZodRecord extends ZodType {
    get keySchema() {
      return this._def.keyType;
    }
    get valueSchema() {
      return this._def.valueType;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.object) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.object,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const pairs = [];
      const keyType = this._def.keyType;
      const valueType = this._def.valueType;
      for (const key in ctx.data) {
        pairs.push({
          key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
          value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
          alwaysSet: key in ctx.data
        });
      }
      if (ctx.common.async) {
        return ParseStatus.mergeObjectAsync(status, pairs);
      } else {
        return ParseStatus.mergeObjectSync(status, pairs);
      }
    }
    get element() {
      return this._def.valueType;
    }
    static create(first, second, third) {
      if (second instanceof ZodType) {
        return new _ZodRecord({
          keyType: first,
          valueType: second,
          typeName: ZodFirstPartyTypeKind.ZodRecord,
          ...processCreateParams(third)
        });
      }
      return new _ZodRecord({
        keyType: ZodString.create(),
        valueType: first,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(second)
      });
    }
  };
  var ZodMap = class extends ZodType {
    get keySchema() {
      return this._def.keyType;
    }
    get valueSchema() {
      return this._def.valueType;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.map) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.map,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const keyType = this._def.keyType;
      const valueType = this._def.valueType;
      const pairs = [...ctx.data.entries()].map(([key, value], index) => {
        return {
          key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
          value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
        };
      });
      if (ctx.common.async) {
        const finalMap = /* @__PURE__ */ new Map();
        return Promise.resolve().then(async () => {
          for (const pair of pairs) {
            const key = await pair.key;
            const value = await pair.value;
            if (key.status === "aborted" || value.status === "aborted") {
              return INVALID;
            }
            if (key.status === "dirty" || value.status === "dirty") {
              status.dirty();
            }
            finalMap.set(key.value, value.value);
          }
          return { status: status.value, value: finalMap };
        });
      } else {
        const finalMap = /* @__PURE__ */ new Map();
        for (const pair of pairs) {
          const key = pair.key;
          const value = pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      }
    }
  };
  ZodMap.create = (keyType, valueType, params) => {
    return new ZodMap({
      valueType,
      keyType,
      typeName: ZodFirstPartyTypeKind.ZodMap,
      ...processCreateParams(params)
    });
  };
  var ZodSet = class _ZodSet extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.set) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.set,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const def = this._def;
      if (def.minSize !== null) {
        if (ctx.data.size < def.minSize.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: def.minSize.value,
            type: "set",
            inclusive: true,
            exact: false,
            message: def.minSize.message
          });
          status.dirty();
        }
      }
      if (def.maxSize !== null) {
        if (ctx.data.size > def.maxSize.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: def.maxSize.value,
            type: "set",
            inclusive: true,
            exact: false,
            message: def.maxSize.message
          });
          status.dirty();
        }
      }
      const valueType = this._def.valueType;
      function finalizeSet(elements2) {
        const parsedSet = /* @__PURE__ */ new Set();
        for (const element of elements2) {
          if (element.status === "aborted")
            return INVALID;
          if (element.status === "dirty")
            status.dirty();
          parsedSet.add(element.value);
        }
        return { status: status.value, value: parsedSet };
      }
      const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
      if (ctx.common.async) {
        return Promise.all(elements).then((elements2) => finalizeSet(elements2));
      } else {
        return finalizeSet(elements);
      }
    }
    min(minSize, message) {
      return new _ZodSet({
        ...this._def,
        minSize: { value: minSize, message: errorUtil.toString(message) }
      });
    }
    max(maxSize, message) {
      return new _ZodSet({
        ...this._def,
        maxSize: { value: maxSize, message: errorUtil.toString(message) }
      });
    }
    size(size, message) {
      return this.min(size, message).max(size, message);
    }
    nonempty(message) {
      return this.min(1, message);
    }
  };
  ZodSet.create = (valueType, params) => {
    return new ZodSet({
      valueType,
      minSize: null,
      maxSize: null,
      typeName: ZodFirstPartyTypeKind.ZodSet,
      ...processCreateParams(params)
    });
  };
  var ZodFunction = class _ZodFunction extends ZodType {
    constructor() {
      super(...arguments);
      this.validate = this.implement;
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.function) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.function,
          received: ctx.parsedType
        });
        return INVALID;
      }
      function makeArgsIssue(args, error) {
        return makeIssue({
          data: args,
          path: ctx.path,
          errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
          issueData: {
            code: ZodIssueCode.invalid_arguments,
            argumentsError: error
          }
        });
      }
      function makeReturnsIssue(returns, error) {
        return makeIssue({
          data: returns,
          path: ctx.path,
          errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
          issueData: {
            code: ZodIssueCode.invalid_return_type,
            returnTypeError: error
          }
        });
      }
      const params = { errorMap: ctx.common.contextualErrorMap };
      const fn = ctx.data;
      if (this._def.returns instanceof ZodPromise) {
        const me = this;
        return OK(async function(...args) {
          const error = new ZodError([]);
          const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
            error.addIssue(makeArgsIssue(args, e));
            throw error;
          });
          const result = await Reflect.apply(fn, this, parsedArgs);
          const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
            error.addIssue(makeReturnsIssue(result, e));
            throw error;
          });
          return parsedReturns;
        });
      } else {
        const me = this;
        return OK(function(...args) {
          const parsedArgs = me._def.args.safeParse(args, params);
          if (!parsedArgs.success) {
            throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
          }
          const result = Reflect.apply(fn, this, parsedArgs.data);
          const parsedReturns = me._def.returns.safeParse(result, params);
          if (!parsedReturns.success) {
            throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
          }
          return parsedReturns.data;
        });
      }
    }
    parameters() {
      return this._def.args;
    }
    returnType() {
      return this._def.returns;
    }
    args(...items) {
      return new _ZodFunction({
        ...this._def,
        args: ZodTuple.create(items).rest(ZodUnknown.create())
      });
    }
    returns(returnType) {
      return new _ZodFunction({
        ...this._def,
        returns: returnType
      });
    }
    implement(func) {
      const validatedFunc = this.parse(func);
      return validatedFunc;
    }
    strictImplement(func) {
      const validatedFunc = this.parse(func);
      return validatedFunc;
    }
    static create(args, returns, params) {
      return new _ZodFunction({
        args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
        returns: returns || ZodUnknown.create(),
        typeName: ZodFirstPartyTypeKind.ZodFunction,
        ...processCreateParams(params)
      });
    }
  };
  var ZodLazy = class extends ZodType {
    get schema() {
      return this._def.getter();
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const lazySchema = this._def.getter();
      return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
    }
  };
  ZodLazy.create = (getter, params) => {
    return new ZodLazy({
      getter,
      typeName: ZodFirstPartyTypeKind.ZodLazy,
      ...processCreateParams(params)
    });
  };
  var ZodLiteral = class extends ZodType {
    _parse(input) {
      if (input.data !== this._def.value) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_literal,
          expected: this._def.value
        });
        return INVALID;
      }
      return { status: "valid", value: input.data };
    }
    get value() {
      return this._def.value;
    }
  };
  ZodLiteral.create = (value, params) => {
    return new ZodLiteral({
      value,
      typeName: ZodFirstPartyTypeKind.ZodLiteral,
      ...processCreateParams(params)
    });
  };
  function createZodEnum(values, params) {
    return new ZodEnum({
      values,
      typeName: ZodFirstPartyTypeKind.ZodEnum,
      ...processCreateParams(params)
    });
  }
  var ZodEnum = class _ZodEnum extends ZodType {
    _parse(input) {
      if (typeof input.data !== "string") {
        const ctx = this._getOrReturnCtx(input);
        const expectedValues = this._def.values;
        addIssueToContext(ctx, {
          expected: util.joinValues(expectedValues),
          received: ctx.parsedType,
          code: ZodIssueCode.invalid_type
        });
        return INVALID;
      }
      if (!this._cache) {
        this._cache = new Set(this._def.values);
      }
      if (!this._cache.has(input.data)) {
        const ctx = this._getOrReturnCtx(input);
        const expectedValues = this._def.values;
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_enum_value,
          options: expectedValues
        });
        return INVALID;
      }
      return OK(input.data);
    }
    get options() {
      return this._def.values;
    }
    get enum() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    get Values() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    get Enum() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    extract(values, newDef = this._def) {
      return _ZodEnum.create(values, {
        ...this._def,
        ...newDef
      });
    }
    exclude(values, newDef = this._def) {
      return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
        ...this._def,
        ...newDef
      });
    }
  };
  ZodEnum.create = createZodEnum;
  var ZodNativeEnum = class extends ZodType {
    _parse(input) {
      const nativeEnumValues = util.getValidEnumValues(this._def.values);
      const ctx = this._getOrReturnCtx(input);
      if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
        const expectedValues = util.objectValues(nativeEnumValues);
        addIssueToContext(ctx, {
          expected: util.joinValues(expectedValues),
          received: ctx.parsedType,
          code: ZodIssueCode.invalid_type
        });
        return INVALID;
      }
      if (!this._cache) {
        this._cache = new Set(util.getValidEnumValues(this._def.values));
      }
      if (!this._cache.has(input.data)) {
        const expectedValues = util.objectValues(nativeEnumValues);
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_enum_value,
          options: expectedValues
        });
        return INVALID;
      }
      return OK(input.data);
    }
    get enum() {
      return this._def.values;
    }
  };
  ZodNativeEnum.create = (values, params) => {
    return new ZodNativeEnum({
      values,
      typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
      ...processCreateParams(params)
    });
  };
  var ZodPromise = class extends ZodType {
    unwrap() {
      return this._def.type;
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.promise,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
      return OK(promisified.then((data) => {
        return this._def.type.parseAsync(data, {
          path: ctx.path,
          errorMap: ctx.common.contextualErrorMap
        });
      }));
    }
  };
  ZodPromise.create = (schema, params) => {
    return new ZodPromise({
      type: schema,
      typeName: ZodFirstPartyTypeKind.ZodPromise,
      ...processCreateParams(params)
    });
  };
  var ZodEffects = class extends ZodType {
    innerType() {
      return this._def.schema;
    }
    sourceType() {
      return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      const effect = this._def.effect || null;
      const checkCtx = {
        addIssue: (arg) => {
          addIssueToContext(ctx, arg);
          if (arg.fatal) {
            status.abort();
          } else {
            status.dirty();
          }
        },
        get path() {
          return ctx.path;
        }
      };
      checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
      if (effect.type === "preprocess") {
        const processed = effect.transform(ctx.data, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(processed).then(async (processed2) => {
            if (status.value === "aborted")
              return INVALID;
            const result = await this._def.schema._parseAsync({
              data: processed2,
              path: ctx.path,
              parent: ctx
            });
            if (result.status === "aborted")
              return INVALID;
            if (result.status === "dirty")
              return DIRTY(result.value);
            if (status.value === "dirty")
              return DIRTY(result.value);
            return result;
          });
        } else {
          if (status.value === "aborted")
            return INVALID;
          const result = this._def.schema._parseSync({
            data: processed,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        }
      }
      if (effect.type === "refinement") {
        const executeRefinement = (acc) => {
          const result = effect.refinement(acc, checkCtx);
          if (ctx.common.async) {
            return Promise.resolve(result);
          }
          if (result instanceof Promise) {
            throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
          }
          return acc;
        };
        if (ctx.common.async === false) {
          const inner = this._def.schema._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          executeRefinement(inner.value);
          return { status: status.value, value: inner.value };
        } else {
          return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
            if (inner.status === "aborted")
              return INVALID;
            if (inner.status === "dirty")
              status.dirty();
            return executeRefinement(inner.value).then(() => {
              return { status: status.value, value: inner.value };
            });
          });
        }
      }
      if (effect.type === "transform") {
        if (ctx.common.async === false) {
          const base = this._def.schema._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (!isValid(base))
            return INVALID;
          const result = effect.transform(base.value, checkCtx);
          if (result instanceof Promise) {
            throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
          }
          return { status: status.value, value: result };
        } else {
          return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
            if (!isValid(base))
              return INVALID;
            return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
              status: status.value,
              value: result
            }));
          });
        }
      }
      util.assertNever(effect);
    }
  };
  ZodEffects.create = (schema, effect, params) => {
    return new ZodEffects({
      schema,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect,
      ...processCreateParams(params)
    });
  };
  ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
    return new ZodEffects({
      schema,
      effect: { type: "preprocess", transform: preprocess },
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      ...processCreateParams(params)
    });
  };
  var ZodOptional = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType === ZodParsedType.undefined) {
        return OK(void 0);
      }
      return this._def.innerType._parse(input);
    }
    unwrap() {
      return this._def.innerType;
    }
  };
  ZodOptional.create = (type, params) => {
    return new ZodOptional({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodOptional,
      ...processCreateParams(params)
    });
  };
  var ZodNullable = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType === ZodParsedType.null) {
        return OK(null);
      }
      return this._def.innerType._parse(input);
    }
    unwrap() {
      return this._def.innerType;
    }
  };
  ZodNullable.create = (type, params) => {
    return new ZodNullable({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodNullable,
      ...processCreateParams(params)
    });
  };
  var ZodDefault = class extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      let data = ctx.data;
      if (ctx.parsedType === ZodParsedType.undefined) {
        data = this._def.defaultValue();
      }
      return this._def.innerType._parse({
        data,
        path: ctx.path,
        parent: ctx
      });
    }
    removeDefault() {
      return this._def.innerType;
    }
  };
  ZodDefault.create = (type, params) => {
    return new ZodDefault({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodDefault,
      defaultValue: typeof params.default === "function" ? params.default : () => params.default,
      ...processCreateParams(params)
    });
  };
  var ZodCatch = class extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const newCtx = {
        ...ctx,
        common: {
          ...ctx.common,
          issues: []
        }
      };
      const result = this._def.innerType._parse({
        data: newCtx.data,
        path: newCtx.path,
        parent: {
          ...newCtx
        }
      });
      if (isAsync(result)) {
        return result.then((result2) => {
          return {
            status: "valid",
            value: result2.status === "valid" ? result2.value : this._def.catchValue({
              get error() {
                return new ZodError(newCtx.common.issues);
              },
              input: newCtx.data
            })
          };
        });
      } else {
        return {
          status: "valid",
          value: result.status === "valid" ? result.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      }
    }
    removeCatch() {
      return this._def.innerType;
    }
  };
  ZodCatch.create = (type, params) => {
    return new ZodCatch({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodCatch,
      catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
      ...processCreateParams(params)
    });
  };
  var ZodNaN = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.nan) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.nan,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return { status: "valid", value: input.data };
    }
  };
  ZodNaN.create = (params) => {
    return new ZodNaN({
      typeName: ZodFirstPartyTypeKind.ZodNaN,
      ...processCreateParams(params)
    });
  };
  var BRAND = /* @__PURE__ */ Symbol("zod_brand");
  var ZodBranded = class extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const data = ctx.data;
      return this._def.type._parse({
        data,
        path: ctx.path,
        parent: ctx
      });
    }
    unwrap() {
      return this._def.type;
    }
  };
  var ZodPipeline = class _ZodPipeline extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.common.async) {
        const handleAsync = async () => {
          const inResult = await this._def.in._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (inResult.status === "aborted")
            return INVALID;
          if (inResult.status === "dirty") {
            status.dirty();
            return DIRTY(inResult.value);
          } else {
            return this._def.out._parseAsync({
              data: inResult.value,
              path: ctx.path,
              parent: ctx
            });
          }
        };
        return handleAsync();
      } else {
        const inResult = this._def.in._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return {
            status: "dirty",
            value: inResult.value
          };
        } else {
          return this._def.out._parseSync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      }
    }
    static create(a, b) {
      return new _ZodPipeline({
        in: a,
        out: b,
        typeName: ZodFirstPartyTypeKind.ZodPipeline
      });
    }
  };
  var ZodReadonly = class extends ZodType {
    _parse(input) {
      const result = this._def.innerType._parse(input);
      const freeze = (data) => {
        if (isValid(data)) {
          data.value = Object.freeze(data.value);
        }
        return data;
      };
      return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
    }
    unwrap() {
      return this._def.innerType;
    }
  };
  ZodReadonly.create = (type, params) => {
    return new ZodReadonly({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodReadonly,
      ...processCreateParams(params)
    });
  };
  function cleanParams(params, data) {
    const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
    const p2 = typeof p === "string" ? { message: p } : p;
    return p2;
  }
  function custom(check, _params = {}, fatal) {
    if (check)
      return ZodAny.create().superRefine((data, ctx) => {
        const r = check(data);
        if (r instanceof Promise) {
          return r.then((r2) => {
            if (!r2) {
              const params = cleanParams(_params, data);
              const _fatal = params.fatal ?? fatal ?? true;
              ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
            }
          });
        }
        if (!r) {
          const params = cleanParams(_params, data);
          const _fatal = params.fatal ?? fatal ?? true;
          ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
        }
        return;
      });
    return ZodAny.create();
  }
  var late = {
    object: ZodObject.lazycreate
  };
  var ZodFirstPartyTypeKind;
  (function(ZodFirstPartyTypeKind2) {
    ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
    ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
    ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
    ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
    ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
    ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
    ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
    ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
    ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
    ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
    ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
    ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
    ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
    ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
    ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
    ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
    ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
    ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
    ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
    ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
    ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
    ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
    ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
    ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
    ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
    ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
    ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
    ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
    ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
    ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
    ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
    ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
    ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
    ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
    ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
    ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
  })(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
  var instanceOfType = (cls, params = {
    message: `Input not instance of ${cls.name}`
  }) => custom((data) => data instanceof cls, params);
  var stringType = ZodString.create;
  var numberType = ZodNumber.create;
  var nanType = ZodNaN.create;
  var bigIntType = ZodBigInt.create;
  var booleanType = ZodBoolean.create;
  var dateType = ZodDate.create;
  var symbolType = ZodSymbol.create;
  var undefinedType = ZodUndefined.create;
  var nullType = ZodNull.create;
  var anyType = ZodAny.create;
  var unknownType = ZodUnknown.create;
  var neverType = ZodNever.create;
  var voidType = ZodVoid.create;
  var arrayType = ZodArray.create;
  var objectType = ZodObject.create;
  var strictObjectType = ZodObject.strictCreate;
  var unionType = ZodUnion.create;
  var discriminatedUnionType = ZodDiscriminatedUnion.create;
  var intersectionType = ZodIntersection.create;
  var tupleType = ZodTuple.create;
  var recordType = ZodRecord.create;
  var mapType = ZodMap.create;
  var setType = ZodSet.create;
  var functionType = ZodFunction.create;
  var lazyType = ZodLazy.create;
  var literalType = ZodLiteral.create;
  var enumType = ZodEnum.create;
  var nativeEnumType = ZodNativeEnum.create;
  var promiseType = ZodPromise.create;
  var effectsType = ZodEffects.create;
  var optionalType = ZodOptional.create;
  var nullableType = ZodNullable.create;
  var preprocessType = ZodEffects.createWithPreprocess;
  var pipelineType = ZodPipeline.create;
  var ostring = () => stringType().optional();
  var onumber = () => numberType().optional();
  var oboolean = () => booleanType().optional();
  var coerce = {
    string: ((arg) => ZodString.create({ ...arg, coerce: true })),
    number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
    boolean: ((arg) => ZodBoolean.create({
      ...arg,
      coerce: true
    })),
    bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
    date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
  };
  var NEVER = INVALID;

  // ../../packages/shared/dist/safety.js
  var snapshotSafetyLimits = {
    rawDomTextChars: 2e5,
    pageTitleChars: 500,
    urlChars: 2048,
    networkRecords: 50,
    networkRecordChars: 256e3,
    networkTotalChars: 1e6,
    tableItems: 20,
    visibleMetrics: 200,
    arrayItems: 200,
    objectKeys: 500,
    depth: 12,
    stringChars: 2e5
  };
  var redacted = "[REDACTED]";
  var truncated = "[TRUNCATED]";
  var sensitiveContains = ["token", "cookie", "password", "passwd", "authorization", "secret", "session", "credential"];
  var sensitiveExact = /* @__PURE__ */ new Set([
    "accesstoken",
    "refreshtoken",
    "phone",
    "mobile",
    "idcard",
    "identitycard",
    "email",
    "name",
    "realname",
    "username",
    "nickname",
    "contactname",
    "legalperson",
    "\u8EAB\u4EFD\u8BC1",
    "\u624B\u673A\u53F7",
    "\u59D3\u540D"
  ]);
  function shouldRedactSensitiveKey(key) {
    const normalized = normalizeKey(key);
    if (isCredentialReferenceKey(normalized))
      return false;
    return sensitiveExact.has(normalized) || sensitiveContains.some((part) => normalized.includes(part));
  }
  function sanitizeVisibleText(text, maxChars = snapshotSafetyLimits.stringChars) {
    let sanitized = truncateText(text, maxChars);
    if (sanitized.includes("@"))
      sanitized = sanitized.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, redacted);
    if (/\d/.test(sanitized)) {
      sanitized = sanitized.replace(/\b1[3-9]\d{9}\b/g, redacted).replace(/\b\d{17}[\dXx]\b/g, redacted);
    }
    if (/bearer/i.test(sanitized))
      sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${redacted}`);
    if (/password|passwd|token|authorization|cookie|secret|session|credential/i.test(sanitized)) {
      sanitized = sanitized.replace(/((?:password|passwd|token|authorization|cookie|secret|session|credential)\s*[:=]\s*)[^\s,;&]+/gi, `$1${redacted}`);
    }
    return truncateText(sanitized, maxChars);
  }
  function sanitizeSensitiveData(value, depth = 0) {
    if (depth > snapshotSafetyLimits.depth)
      return truncated;
    const holder = {};
    const stack = [
      { input: value, parent: holder, key: "value", depth }
    ];
    const seen = /* @__PURE__ */ new WeakSet();
    while (stack.length) {
      const current = stack.pop();
      if (current.depth > snapshotSafetyLimits.depth) {
        current.parent[current.key] = truncated;
        continue;
      }
      if (typeof current.input === "string") {
        current.parent[current.key] = sanitizeVisibleText(current.input);
        continue;
      }
      if (!current.input || typeof current.input !== "object") {
        current.parent[current.key] = current.input;
        continue;
      }
      if (seen.has(current.input)) {
        current.parent[current.key] = truncated;
        continue;
      }
      seen.add(current.input);
      if (Array.isArray(current.input)) {
        const output2 = [];
        current.parent[current.key] = output2;
        const length = Math.min(current.input.length, snapshotSafetyLimits.arrayItems);
        for (let index = length - 1; index >= 0; index -= 1) {
          stack.push({ input: current.input[index], parent: output2, key: index, depth: current.depth + 1 });
        }
        continue;
      }
      const output = {};
      current.parent[current.key] = output;
      const entries = [];
      let count = 0;
      for (const key in current.input) {
        if (!Object.prototype.hasOwnProperty.call(current.input, key))
          continue;
        entries.push([key, current.input[key]]);
        count += 1;
        if (count >= snapshotSafetyLimits.objectKeys)
          break;
      }
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [key, raw] = entries[index];
        if (shouldRedactSensitiveKey(key))
          output[key] = redacted;
        else
          stack.push({ input: raw, parent: output, key, depth: current.depth + 1 });
      }
    }
    return holder.value;
  }
  function sanitizeCaptureUrl(inputUrl, baseUrl = "https://example.invalid") {
    try {
      const url = new URL(inputUrl, baseUrl);
      url.username = url.username ? redacted : "";
      url.password = url.password ? redacted : "";
      for (const key of [...url.searchParams.keys()]) {
        if (shouldRedactSensitiveKey(key))
          url.searchParams.set(key, redacted);
      }
      return truncateText(url.href, snapshotSafetyLimits.urlChars);
    } catch {
      return sanitizeVisibleText(inputUrl, snapshotSafetyLimits.urlChars);
    }
  }
  function sanitizeCollectionSnapshotPayload(snapshot2) {
    const { detectedAccountId: _detectedAccountId, detectedAccountName: _detectedAccountName, accountMatchEvidence: _accountMatchEvidence, ...snapshotWithoutPageAccount } = snapshot2;
    const truncatedFields = [
      ...snapshot2.rawDomText.length ? ["rawDomText"] : [],
      ...snapshot2.rawNetworkJson.length ? ["rawNetworkJson"] : [],
      ...snapshot2.rawTableData.length > snapshotSafetyLimits.tableItems ? ["rawTableData"] : [],
      ...(snapshot2.visibleMetricsJson?.length || 0) > snapshotSafetyLimits.visibleMetrics ? ["visibleMetricsJson"] : []
    ];
    const sanitized = {
      ...snapshotWithoutPageAccount,
      sourceUrl: sanitizeCaptureUrl(snapshot2.sourceUrl || ""),
      pageTitle: sanitizeVisibleText(snapshot2.pageTitle || "", snapshotSafetyLimits.pageTitleChars),
      // Page text may be used in memory to derive allowlisted fields, but is never part of a snapshot payload.
      rawDomText: "",
      rawNetworkJson: [],
      rawTableData: limitArrayValue(sanitizeSensitiveData(snapshot2.rawTableData.slice(0, snapshotSafetyLimits.tableItems)), snapshotSafetyLimits.networkTotalChars),
      visibleMetricsJson: (snapshot2.visibleMetricsJson || []).slice(0, snapshotSafetyLimits.visibleMetrics).map(sanitizeVisibleMetric),
      screenshotUrl: snapshot2.screenshotUrl ? sanitizeCaptureUrl(snapshot2.screenshotUrl) : snapshot2.screenshotUrl
    };
    if ("captureMeta" in snapshot2 && snapshot2.captureMeta && typeof snapshot2.captureMeta === "object") {
      const meta = snapshot2.captureMeta;
      sanitized.captureMeta = {
        ...meta,
        acceptedBytes: serializedLength({ rawDomText: sanitized.rawDomText, rawTableData: sanitized.rawTableData, visibleMetricsJson: sanitized.visibleMetricsJson }),
        truncatedFields: [.../* @__PURE__ */ new Set([...Array.isArray(meta.truncatedFields) ? meta.truncatedFields.map(String) : [], ...truncatedFields])],
        truncationReasons: [.../* @__PURE__ */ new Set([
          ...Array.isArray(meta.truncationReasons) ? meta.truncationReasons.map(String) : [],
          ...snapshot2.rawDomText.length ? ["PAGE_TEXT_CAPTURE_DISABLED"] : [],
          ...snapshot2.rawNetworkJson.length ? ["NETWORK_CAPTURE_DISABLED"] : [],
          ...snapshot2.rawTableData.length > snapshotSafetyLimits.tableItems || (snapshot2.visibleMetricsJson?.length || 0) > snapshotSafetyLimits.visibleMetrics ? ["SNAPSHOT_SAFETY_LIMIT"] : []
        ])]
      };
    }
    return sanitized;
  }
  function sanitizeVisibleMetric(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return sanitizeSensitiveData(value);
    const metric = value;
    const sanitized = sanitizeSensitiveData(metric);
    return {
      ...sanitized,
      key: sanitizeVisibleText(String(metric.key || "unknown"), 100),
      name: sanitizeVisibleText(String(metric.name || ""), 200)
    };
  }
  function limitSerializedValue(value, maxChars) {
    const serialized = safeStringify(value);
    if (serialized.length <= maxChars)
      return value;
    return {
      truncated: true,
      originalChars: serialized.length,
      preview: truncateText(serialized, Math.min(1e4, maxChars))
    };
  }
  function limitArrayValue(value, maxChars) {
    const limited = limitSerializedValue(value, maxChars);
    return Array.isArray(limited) ? limited : [limited];
  }
  function serializedLength(value) {
    return safeStringify(value).length;
  }
  function safeStringify(value) {
    try {
      return JSON.stringify(value) || "";
    } catch {
      return JSON.stringify({ truncated: true, reason: "non_serializable" });
    }
  }
  function truncateText(value, maxChars) {
    return value.length <= maxChars ? value : `${value.slice(0, maxChars)}${truncated}`;
  }
  function normalizeKey(key) {
    return key.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, "").toLowerCase();
  }
  function isCredentialReferenceKey(normalizedKey) {
    return normalizedKey.endsWith("id");
  }

  // ../../packages/shared/dist/decision-tables.js
  var decisionTableCellSchema = external_exports.union([external_exports.string(), external_exports.number(), external_exports.boolean(), external_exports.null()]);
  var decisionTableInputSchema = external_exports.object({
    routeKey: external_exports.enum(collectionRouteKeys).nullable(),
    pageType: external_exports.string().nullable(),
    rows: external_exports.array(external_exports.array(decisionTableCellSchema).max(100)).max(1e3)
  });

  // ../../packages/shared/dist/metric-value.js
  var metricValidationStatuses = ["TRUSTED", "REQUIRES_REVIEW", "INVALID"];
  var currencyMetricKeys = /* @__PURE__ */ new Set([
    "spend",
    "daily_budget",
    "remaining_budget",
    "recent_30m_spend",
    "cpa",
    "target_cpa",
    "gmv",
    "gpm",
    "shelf_gmv",
    "search_gmv",
    "gross_profit",
    "merchant_subsidy",
    "service_fee",
    "platform_subsidy",
    "ad_coupon",
    "rebate_coupon"
  ]);
  var percentageMetricKeys = /* @__PURE__ */ new Set(["ctr", "product_click_rate", "product_conversion_rate", "live_room_click_rate", "complaint_rate", "refund_rate", "fulfillment_exception_rate"]);
  var roiMetricKeys = /* @__PURE__ */ new Set(["pay_roi", "full_domain_pay_roi", "verify_roi", "gross_profit_roi", "target_roi"]);
  function metricValueSemantic(metricKey) {
    if (currencyMetricKeys.has(metricKey))
      return "CURRENCY";
    if (percentageMetricKeys.has(metricKey))
      return "PERCENTAGE";
    if (roiMetricKeys.has(metricKey))
      return "ROI";
    return "COUNT";
  }
  function parseDisplayedMetricValue(value, semantic = "UNKNOWN", declaredUnit) {
    const displayValue = value == null ? "" : String(value).trim();
    if (!displayValue || displayValue === "--" || displayValue === "-") {
      return {
        displayValue,
        normalizedText: null,
        displayPrecision: null,
        multiplier: 1,
        unit: null,
        status: "REQUIRES_REVIEW",
        reasons: ["VALUE_MISSING"]
      };
    }
    const matched = displayValue.match(/^[¥￥]?\s*(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(万|千|w|W|k|K)?\s*(%|元|人民币|倍)?\s*$/);
    if (!matched) {
      return invalid(displayValue, "VALUE_FORMAT_INVALID");
    }
    const numeric = matched[1].replace(/,/g, "");
    const suffix = matched[2] || "";
    const explicitUnit = matched[3] || "";
    const multiplier = /万|w/i.test(suffix) ? 1e4 : /千|k/i.test(suffix) ? 1e3 : 1;
    const isPercent = explicitUnit === "%" || declaredUnit === "%";
    const precision = numeric.split(".")[1]?.length || 0;
    const normalizedText = scaleDecimal(numeric, multiplier, isPercent ? -2 : 0);
    const reasons = [];
    if (semantic === "ROI" && isPercent)
      reasons.push("ROI_CANNOT_USE_PERCENT_UNIT");
    if (semantic === "ROI" && suffix)
      reasons.push("ROI_CANNOT_USE_QUANTITY_UNIT");
    if (semantic === "ROI" && explicitUnit && explicitUnit !== "\u500D" && explicitUnit !== "%")
      reasons.push("ROI_UNIT_MISMATCH");
    if (semantic === "PERCENTAGE" && !isPercent)
      reasons.push("PERCENT_UNIT_NOT_EXPLICIT");
    if (semantic === "PERCENTAGE" && suffix)
      reasons.push("PERCENT_CANNOT_USE_QUANTITY_UNIT");
    if (semantic === "PERCENTAGE" && explicitUnit && explicitUnit !== "%")
      reasons.push("PERCENT_UNIT_MISMATCH");
    if (semantic === "CURRENCY" && (explicitUnit === "%" || explicitUnit === "\u500D"))
      reasons.push("CURRENCY_UNIT_MISMATCH");
    if (semantic === "COUNT" && explicitUnit)
      reasons.push("COUNT_UNIT_MISMATCH");
    return {
      displayValue,
      normalizedText,
      displayPrecision: precision,
      multiplier,
      unit: explicitUnit || declaredUnit || null,
      status: reasons.length ? "INVALID" : "REQUIRES_REVIEW",
      reasons
    };
  }
  function invalid(displayValue, reason) {
    return {
      displayValue,
      normalizedText: null,
      displayPrecision: null,
      multiplier: 1,
      unit: null,
      status: "INVALID",
      reasons: [reason]
    };
  }
  function metricValueText(metric, semantic = "UNKNOWN") {
    const evidencedValue = metric.rawEvidence?.normalizedValue;
    if (typeof evidencedValue === "string" && isCanonicalDecimal(evidencedValue))
      return evidencedValue;
    if (metric.value == null)
      return null;
    if (typeof metric.value === "number") {
      return Number.isFinite(metric.value) ? String(metric.value) : null;
    }
    return parseDisplayedMetricValue(metric.value, semantic).normalizedText;
  }
  function scaleDecimal(value, multiplier, decimalShift) {
    const negative = value.startsWith("-");
    const unsigned = negative ? value.slice(1) : value;
    const [whole = "0", fraction = ""] = unsigned.split(".");
    const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
    const shift = (multiplier === 1e4 ? 4 : multiplier === 1e3 ? 3 : 0) - fraction.length + decimalShift;
    let result;
    if (shift >= 0)
      result = `${digits}${"0".repeat(shift)}`;
    else {
      const point = digits.length + shift;
      result = point > 0 ? `${digits.slice(0, point)}.${digits.slice(point)}` : `0.${"0".repeat(-point)}${digits}`;
    }
    result = result.replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    return negative && result !== "0" ? `-${result}` : result;
  }
  function isCanonicalDecimal(value) {
    return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
  }

  // ../../packages/shared/dist/collection-diagnostics.js
  var collectionRouteDiagnosticStatuses = [
    "UPLOADED",
    "AGING",
    "PARTIAL",
    "UNVERIFIED",
    "MANUAL_PENDING",
    "STALE",
    "FAILED",
    "MISSING"
  ];
  var collectionIssueCodes = [
    "NO_SNAPSHOT",
    "SNAPSHOT_STALE",
    "COLLECTOR_STALLED",
    "CONSECUTIVE_FAILURES",
    "ROUTE_UNVERIFIED",
    "PARTIAL_CAPTURE",
    "LOW_FIELD_COVERAGE",
    "CAPTURE_TRUNCATED",
    "UPLOAD_FAILED"
  ];
  var collectionRouteDiagnosticSchema = external_exports.object({
    routeKey: external_exports.enum([
      "LOCAL_PROMOTION_DASHBOARD",
      "LIVE_DATA_SCREEN",
      "LIVE_PRODUCT_TAB",
      "LIVE_TRAFFIC_TAB",
      "TASK_TABLE",
      "MATERIAL_LIBRARY",
      "HOURLY_TREND",
      "UNKNOWN"
    ]),
    required: external_exports.boolean(),
    summaryStatus: external_exports.enum(collectionRouteDiagnosticStatuses),
    freshnessState: external_exports.enum(["FRESH", "AGING", "STALE", "MISSING"]),
    lastAttemptAt: external_exports.string().datetime().nullable(),
    lastSuccessAt: external_exports.string().datetime().nullable(),
    lastCapturedAt: external_exports.string().datetime().nullable(),
    ageMs: external_exports.number().nonnegative().nullable(),
    consecutiveFailures: external_exports.number().int().nonnegative(),
    completeness: external_exports.enum(["COMPLETE", "PARTIAL", "UNKNOWN"]).nullable(),
    coverageRatio: external_exports.number().min(0).max(1).nullable(),
    adapterId: external_exports.string().nullable(),
    adapterVersion: external_exports.string().nullable(),
    pageFingerprint: external_exports.string().nullable(),
    expectedFields: external_exports.array(external_exports.string()),
    extractedFields: external_exports.array(external_exports.string()),
    missingFields: external_exports.array(external_exports.string()),
    truncationReasons: external_exports.array(external_exports.string()),
    issues: external_exports.array(external_exports.object({
      code: external_exports.enum(collectionIssueCodes),
      severity: external_exports.enum(["INFO", "WARNING", "ERROR"]),
      message: external_exports.string(),
      recoveryAction: external_exports.string()
    })),
    blocksFormalDecision: external_exports.boolean(),
    blocksStrongActions: external_exports.boolean()
  });

  // ../../packages/shared/dist/collection-records.js
  var structuredCollectionDataVersion = "collection-records-v1";
  var nullableNumber = external_exports.number().finite().nullable();
  var provenanceSchema = external_exports.object({
    routeKey: external_exports.enum(collectionRouteKeys),
    capturedAt: external_exports.string().datetime(),
    tableIndex: external_exports.number().int().nonnegative(),
    rowIndex: external_exports.number().int().nonnegative(),
    adapterId: external_exports.string().nullable(),
    adapterVersion: external_exports.string().nullable(),
    schemaVersion: external_exports.literal(structuredCollectionDataVersion)
  });
  var baseSchema = {
    routeKey: external_exports.enum(collectionRouteKeys),
    capturedAt: external_exports.string().datetime(),
    schemaVersion: external_exports.literal(structuredCollectionDataVersion),
    adapterId: external_exports.string().nullable(),
    adapterVersion: external_exports.string().nullable(),
    acceptedRowCount: external_exports.number().int().nonnegative(),
    rejectedRowCount: external_exports.number().int().nonnegative(),
    warnings: external_exports.array(external_exports.string())
  };
  var taskCollectionRowSchema = external_exports.object({
    taskId: external_exports.string().nullable(),
    taskName: external_exports.string().nullable(),
    status: external_exports.string().nullable(),
    budget: nullableNumber,
    spend: nullableNumber,
    roi: nullableNumber,
    targetRoi: nullableNumber,
    orders: nullableNumber,
    impressions: nullableNumber,
    clicks: nullableNumber,
    ctr: nullableNumber,
    provenance: provenanceSchema
  }).refine((row) => Boolean(row.taskId || row.taskName), "\u4EFB\u52A1\u884C\u5FC5\u987B\u5305\u542B taskId \u6216 taskName");
  var hourlyCollectionRowSchema = external_exports.object({
    intervalStart: external_exports.string().nullable(),
    intervalLabel: external_exports.string().nullable(),
    spend: nullableNumber,
    orders: nullableNumber,
    roi: nullableNumber,
    liveViews: nullableNumber,
    naturalViews: nullableNumber,
    commercialViews: nullableNumber,
    provenance: provenanceSchema
  });
  var materialCollectionRowSchema = external_exports.object({
    materialId: external_exports.string().nullable(),
    materialName: external_exports.string().nullable(),
    auditStatus: external_exports.string().nullable(),
    createdAt: external_exports.string().nullable(),
    spend: nullableNumber,
    impressions: nullableNumber,
    clicks: nullableNumber,
    ctr: nullableNumber,
    orders: nullableNumber,
    cvr: nullableNumber,
    roi: nullableNumber,
    provenance: provenanceSchema
  }).refine((row) => Boolean(row.materialId || row.materialName), "\u7D20\u6750\u884C\u5FC5\u987B\u5305\u542B materialId \u6216 materialName");
  var structuredCollectionDataSchema = external_exports.discriminatedUnion("kind", [
    external_exports.object({ ...baseSchema, kind: external_exports.literal("TASK_ROWS"), rows: external_exports.array(taskCollectionRowSchema) }),
    external_exports.object({ ...baseSchema, kind: external_exports.literal("HOURLY_ROWS"), rows: external_exports.array(hourlyCollectionRowSchema) }),
    external_exports.object({ ...baseSchema, kind: external_exports.literal("MATERIAL_ROWS"), rows: external_exports.array(materialCollectionRowSchema) })
  ]);

  // ../../packages/shared/dist/metric-keys.js
  var metricKeys = [
    "unknown",
    "verify_roi",
    "gross_profit_roi",
    "pay_roi",
    "full_domain_pay_roi",
    "target_roi",
    "spend",
    "daily_budget",
    "remaining_budget",
    "recent_30m_spend",
    "recent_30m_orders",
    "live_duration_minutes",
    "average_watch_duration_seconds",
    "minutes_since_last_adjustment",
    "orders",
    "impressions",
    "clicks",
    "ctr",
    "cpa",
    "target_cpa",
    "live_viewers",
    "current_online_viewers",
    "exposure_users",
    "click_users",
    "transaction_users",
    "product_click_rate",
    "product_conversion_rate",
    "live_room_click_rate",
    "hourly_live_views",
    "hourly_natural_live_views",
    "hourly_commercial_live_views",
    "gpm",
    "gmv",
    "gross_profit",
    "merchant_subsidy",
    "service_fee",
    "store_rating",
    "complaint_rate",
    "refund_rate",
    "fulfillment_exception_rate",
    "inventory_capacity",
    "wrong_price_promise_risk",
    "activity_verified",
    "platform_subsidy",
    "ad_coupon",
    "rebate_coupon",
    "shelf_gmv",
    "search_gmv",
    "poi_visits",
    "store_searches"
  ];
  var [, ...recordableMetricKeys] = metricKeys;

  // ../../packages/shared/dist/live-screen-internal-api.js
  var liveScreenInternalApiContractVersion = "2026-08-14.1";
  var liveScreenInternalApiAdapterVersion = "1.6.0";
  var liveScreenRoomIdSources = ["URL", "DOM", "URL_AND_DOM", "MISSING", "MISMATCH"];
  var liveScreenRoomIdPattern = /^\d{1,32}$/;
  var liveScreenInternalApiEndpointKeys = [
    "key_index",
    "room_minute_indicator",
    "room_info",
    "follow_product",
    "product_trend",
    "conversion_funnel",
    "portrait",
    "marketing_data",
    "comment_info",
    "punish_info"
  ];
  var liveScreenApiEvidencePurposes = ["PULSE_ONLY", "SNAPSHOT_EVIDENCE", "SNAPSHOT_DISPLAY_ONLY"];
  var requestSchema = external_exports.object({ room_id: external_exports.string().regex(/^\d{1,32}$/) }).strict();
  var metricValueSchema = external_exports.union([external_exports.number().finite(), external_exports.string().trim().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?%?$/)]).nullable();
  var responseSchema = external_exports.object({
    code: external_exports.number().int(),
    data: external_exports.record(external_exports.string(), external_exports.unknown())
  }).passthrough();
  var keyIndexResponseSchema = external_exports.object({
    code: external_exports.number().int(),
    // Field-level type checks happen only at the explicit approved paths below.
    // Keeping the object opaque here lets a single invalid/missing metric remain
    // a local projection miss instead of widening the whole endpoint contract.
    data: external_exports.record(external_exports.string(), external_exports.unknown())
  }).strip();
  var roomMinuteIndicatorResponseSchema = external_exports.object({
    code: external_exports.literal(0),
    data: external_exports.object({
      minute_rows: external_exports.array(external_exports.object({
        interval_label: external_exports.string().trim().min(1).max(100),
        live_views: metricValueSchema
      }).strip()).max(120)
    }).strip()
  }).strip();
  var roomInfoResponseSchema = external_exports.object({
    code: external_exports.literal(0),
    data: external_exports.object({
      live_viewers: metricValueSchema.optional(),
      impressions: metricValueSchema.optional(),
      clicks: metricValueSchema.optional(),
      orders: metricValueSchema.optional()
    }).strip()
  }).strip();
  var clickRateResponseSchema = external_exports.object({
    code: external_exports.literal(0),
    data: external_exports.object({ product_click_rate: metricValueSchema.optional() }).strip()
  }).strip();
  function endpoint(key, fields, maxResponseBytes = 96 * 1024, endpointResponseSchema = responseSchema) {
    return {
      key,
      path: `/life/api/live_screen/v5/${key}`,
      method: "POST",
      requestSchema,
      responseSchema: endpointResponseSchema,
      maxResponseBytes,
      fields
    };
  }
  var realtime = (metricKey, metricName, fieldPath, fieldLabel, unit, semanticScope, displayPrecision = 0) => ({
    metricKey,
    metricName,
    fieldPath,
    approvedFieldPaths: [fieldPath],
    fieldLabel,
    unit,
    timeRange: "\u5B9E\u65F6",
    semanticScope,
    purpose: "PULSE_ONLY",
    displayPrecision
  });
  var snapshot = (metricKey, metricName, fieldPath, fieldLabel, unit, semanticScope, displayPrecision = 0, rowPath, rowLabelPath) => ({
    metricKey,
    metricName,
    fieldPath,
    approvedFieldPaths: [fieldPath],
    fieldLabel,
    unit,
    timeRange: "\u672C\u573A",
    semanticScope,
    purpose: "SNAPSHOT_EVIDENCE",
    displayPrecision,
    rowPath,
    rowLabelPath
  });
  var liveScreenInternalApiContracts = {
    key_index: endpoint("key_index", [
      // The live page renders Object.keys(response.data), and every key-index item
      // exposes its display number through item.value. Keep this whitelist aligned
      // with the concrete data keys shipped by the platform bundle; never scan
      // arbitrary response keys or retain the response body.
      realtime("gmv", "\u76F4\u64AD\u95F4\u6210\u4EA4\u91D1\u989D", "data.PayGmv.value", "\u76F4\u64AD\u95F4\u6210\u4EA4\u91D1\u989D", "yuan", "\u76F4\u64AD\u95F4\u6210\u4EA4\u91D1\u989D", 2),
      realtime("current_online_viewers", "\u5728\u7EBF\u4EBA\u6570", "data.CurrentUserCnt.value", "\u5728\u7EBF\u4EBA\u6570", null, "\u5F53\u524D\u5728\u7EBF\u4EBA\u6570"),
      realtime("average_watch_duration_seconds", "\u4EBA\u5747\u89C2\u770B\u65F6\u957F", "data.ClientAvgWatchDuration.value", "\u4EBA\u5747\u89C2\u770B\u65F6\u957F", "s", "\u4EBA\u5747\u89C2\u770B\u65F6\u957F", 2),
      realtime("gpm", "\u5343\u6B21\u89C2\u770B\u6210\u4EA4\u91D1\u989D", "data.GPM.value", "\u5343\u6B21\u89C2\u770B\u6210\u4EA4\u91D1\u989D", "yuan", "\u5343\u6B21\u89C2\u770B\u6210\u4EA4\u91D1\u989D", 2),
      realtime("orders", "\u6210\u4EA4\u8BA2\u5355\u6570", "data.PayOrderCnt.value", "\u6210\u4EA4\u8BA2\u5355\u6570", null, "\u6210\u4EA4\u8BA2\u5355\u6570"),
      realtime("transaction_users", "\u6210\u4EA4\u4EBA\u6570", "data.PayUvAll.value", "\u6210\u4EA4\u4EBA\u6570", null, "\u6210\u4EA4\u4EBA\u6570"),
      realtime("product_conversion_rate", "\u5546\u54C1\u8F6C\u5316\u7387", "data.GoodsCvr.value", "\u5546\u54C1\u8F6C\u5316\u7387", "%", "\u5546\u54C1\u8F6C\u5316\u7387", 2)
    ], 64 * 1024, keyIndexResponseSchema),
    room_minute_indicator: endpoint("room_minute_indicator", [
      snapshot("hourly_live_views", "\u5206\u949F\u770B\u64AD\u6B21\u6570", "data.minute_rows[].live_views", "\u5206\u949F\u770B\u64AD\u6B21\u6570", null, "\u5206\u949F\u8D8B\u52BF", 0, "data.minute_rows", "interval_label")
    ], 96 * 1024, roomMinuteIndicatorResponseSchema),
    room_info: endpoint("room_info", [
      snapshot("live_viewers", "\u6574\u573A\u7D2F\u8BA1\u770B\u64AD\u4EBA\u6570", "data.live_viewers", "\u6574\u573A\u7D2F\u8BA1\u770B\u64AD\u4EBA\u6570", null, "\u6574\u573A\u7D2F\u8BA1\u770B\u64AD\u4EBA\u6570"),
      snapshot("impressions", "\u66DD\u5149\u6B21\u6570", "data.impressions", "\u66DD\u5149\u6B21\u6570", null, "\u66DD\u5149\u6B21\u6570"),
      snapshot("clicks", "\u70B9\u51FB\u6B21\u6570", "data.clicks", "\u70B9\u51FB\u6B21\u6570", null, "\u70B9\u51FB\u6B21\u6570"),
      snapshot("orders", "\u6210\u4EA4\u8BA2\u5355\u6570", "data.orders", "\u6210\u4EA4\u8BA2\u5355\u6570", null, "\u6210\u4EA4\u8BA2\u5355\u6570")
    ], 64 * 1024, roomInfoResponseSchema),
    follow_product: endpoint("follow_product", [
      snapshot("product_click_rate", "\u5546\u54C1\u70B9\u51FB\u7387", "data.product_click_rate", "\u5546\u54C1\u70B9\u51FB\u7387", "%", "\u5546\u54C1\u70B9\u51FB\u7387", 2)
    ], 64 * 1024, clickRateResponseSchema),
    product_trend: endpoint("product_trend", []),
    conversion_funnel: endpoint("conversion_funnel", [
      snapshot("product_click_rate", "\u5546\u54C1\u70B9\u51FB\u7387", "data.product_click_rate", "\u5546\u54C1\u70B9\u51FB\u7387", "%", "\u5546\u54C1\u70B9\u51FB\u7387", 2)
    ], 64 * 1024, clickRateResponseSchema),
    portrait: endpoint("portrait", []),
    marketing_data: endpoint("marketing_data", []),
    // Comments and enforcement endpoints intentionally expose no free text or identity fields.
    comment_info: endpoint("comment_info", []),
    punish_info: endpoint("punish_info", [])
  };
  var liveScreenSnapshotEndpointKeys = liveScreenInternalApiEndpointKeys.filter((key) => liveScreenInternalApiContracts[key].fields.some((field) => field.purpose !== "PULSE_ONLY"));
  function liveScreenEndpointKeysForMode(mode) {
    if (mode === "SNAPSHOT")
      return [...liveScreenSnapshotEndpointKeys];
    return ["key_index"];
  }
  function resolveLiveScreenRoomId(input) {
    const evidence = {
      urlRoomIds: normalizeRoomIds(input.urlRoomIds),
      domRoomIds: normalizeRoomIds(input.domRoomIds)
    };
    if (evidence.urlRoomIds.length > 1 || evidence.domRoomIds.length > 1) {
      return { value: null, source: "MISMATCH", evidence };
    }
    const urlRoomId = evidence.urlRoomIds[0] || null;
    const domRoomId = evidence.domRoomIds[0] || null;
    if (urlRoomId && domRoomId && urlRoomId !== domRoomId) {
      return { value: null, source: "MISMATCH", evidence };
    }
    if (urlRoomId && domRoomId)
      return { value: urlRoomId, source: "URL_AND_DOM", evidence };
    if (urlRoomId)
      return { value: urlRoomId, source: "URL", evidence };
    if (domRoomId)
      return { value: domRoomId, source: "DOM", evidence };
    return { value: null, source: "MISSING", evidence };
  }
  function normalizeRoomIds(values) {
    return [...new Set(values.map((value) => value?.trim() || "").filter((value) => liveScreenRoomIdPattern.test(value)))].slice(0, 2);
  }

  // ../../packages/shared/dist/collection-capture.js
  var pageTypes = ["LOCAL_PROMOTION_DASHBOARD", "LIVE_DATA_SCREEN", "TASK_TABLE", "UNKNOWN"];
  var metricSources = ["XHR_JSON", "TABLE", "DOM_TEXT", "SCREENSHOT", "MANUAL_INPUT", "UNKNOWN"];
  var metricSourceStatuses = ["INTERNAL_API", "DOM_TEXT", "API_AND_DOM", "SOURCE_CONFLICT"];
  var captureCompletenessValues = ["COMPLETE", "PARTIAL", "UNKNOWN"];
  var captureTabStates = ["VISIBLE", "HIDDEN", "FROZEN", "DISCARDED", "UNKNOWN"];
  var metricRawEvidenceSchema = external_exports.object({
    sourceType: external_exports.string().min(1),
    path: external_exports.string().optional(),
    selector: external_exports.string().optional(),
    tableIndex: external_exports.number().int().optional(),
    rowIndex: external_exports.number().int().optional(),
    columnName: external_exports.string().optional(),
    url: external_exports.string().optional(),
    method: external_exports.string().optional(),
    jsonPath: external_exports.string().optional(),
    textSnippet: external_exports.string().max(500).optional(),
    fieldLabel: external_exports.string().max(100).optional(),
    displayValue: external_exports.string().max(100).optional(),
    normalizedValue: external_exports.string().max(100).nullable().optional(),
    displayPrecision: external_exports.number().int().min(0).max(20).nullable().optional(),
    multiplier: external_exports.number().positive().optional(),
    unitSource: external_exports.enum(["VALUE", "HEADER", "LABEL", "DEFAULT", "NONE"]).optional(),
    timeRange: external_exports.string().max(100).nullable().optional(),
    timeRangeSource: external_exports.enum(["COMPONENT", "TABLE_CONTEXT", "MANUAL"]).optional(),
    timeRangeLocation: external_exports.string().max(300).nullable().optional(),
    bindingKind: external_exports.enum(["CARD", "TABLE", "MANUAL"]).optional(),
    componentPath: external_exports.string().max(300).optional(),
    rowIdentity: external_exports.string().max(200).optional(),
    calibrationSignature: external_exports.string().max(500).optional(),
    validationStatus: external_exports.enum(metricValidationStatuses).optional(),
    validationReasons: external_exports.array(external_exports.string().max(100)).max(20).optional(),
    sourceStatus: external_exports.enum(metricSourceStatuses).optional(),
    apiCandidate: external_exports.object({
      value: external_exports.string().max(100),
      displayValue: external_exports.string().max(100),
      unit: external_exports.string().nullable(),
      timeRange: external_exports.string().max(100),
      displayPrecision: external_exports.number().int().min(0).max(20),
      fieldPath: external_exports.string().max(300),
      fieldLabel: external_exports.string().max(100)
    }).optional(),
    domCandidate: external_exports.object({
      value: external_exports.string().max(100),
      displayValue: external_exports.string().max(100),
      unit: external_exports.string().nullable(),
      timeRange: external_exports.string().max(100),
      displayPrecision: external_exports.number().int().min(0).max(20),
      fieldPath: external_exports.string().max(300),
      fieldLabel: external_exports.string().max(100)
    }).optional(),
    selectionReason: external_exports.string().max(200).optional(),
    manualSourceSelection: external_exports.enum(["API", "DOM", "IGNORE"]).optional(),
    semanticScope: external_exports.string().max(100).optional(),
    apiContractVersion: external_exports.string().max(50).optional(),
    apiAdapterVersion: external_exports.string().max(50).optional(),
    endpointKey: external_exports.string().max(100).optional(),
    evidencePurpose: external_exports.enum(liveScreenApiEvidencePurposes).optional()
  });
  var visibleMetricSchema = external_exports.object({
    key: external_exports.string().min(1),
    name: external_exports.string().min(1),
    value: external_exports.union([external_exports.number(), external_exports.string(), external_exports.null()]),
    unit: external_exports.string().nullable().optional(),
    source: external_exports.enum(["dom", "table", "network", "manual"]),
    metricSource: external_exports.enum(metricSources).optional(),
    confidence: external_exports.number().min(0).max(1).optional(),
    rawEvidence: metricRawEvidenceSchema.nullable().optional()
  });
  var networkRecordSchema = external_exports.object({
    url: external_exports.string().url().max(snapshotSafetyLimits.urlChars),
    method: external_exports.string().min(1).max(16),
    status: external_exports.number().int().min(0).max(599),
    responseJson: external_exports.unknown(),
    capturedAt: external_exports.string().datetime()
  });
  var captureMetaSchema = external_exports.object({
    adapterId: external_exports.string().min(1).max(100),
    adapterVersion: external_exports.string().min(1).max(50),
    pageFingerprint: external_exports.string().min(1).max(128),
    completeness: external_exports.enum(captureCompletenessValues),
    coverageRatio: external_exports.number().min(0).max(1),
    expectedFields: external_exports.array(external_exports.string().max(100)).max(100),
    extractedFields: external_exports.array(external_exports.string().max(100)).max(100),
    visibleRegions: external_exports.array(external_exports.string().max(100)).max(50),
    renderModes: external_exports.array(external_exports.enum(["DOM", "TABLE", "CANVAS", "VIRTUALIZED"])).max(4),
    tableBindings: external_exports.array(external_exports.object({
      tableIndex: external_exports.number().int().min(0).max(3),
      headers: external_exports.array(external_exports.string().max(100)).min(1).max(100),
      identityColumn: external_exports.string().max(100).nullable(),
      identityColumnIndex: external_exports.number().int().min(0).max(99).nullable().optional(),
      timeRange: external_exports.string().max(100).nullable().optional(),
      timeRangeLocation: external_exports.string().max(300).nullable().optional(),
      componentPath: external_exports.string().max(300).nullable().optional(),
      bindingSignature: external_exports.string().min(1).max(500),
      validationStatus: external_exports.enum(metricValidationStatuses),
      validationReasons: external_exports.array(external_exports.string().max(100)).max(20)
    })).max(4).optional(),
    tabState: external_exports.enum(captureTabStates),
    originalBytes: external_exports.number().int().min(0),
    acceptedBytes: external_exports.number().int().min(0),
    truncatedFields: external_exports.array(external_exports.string().max(100)).max(100),
    truncationReasons: external_exports.array(external_exports.string().max(200)).max(100),
    routeDetection: external_exports.object({
      routeKey: external_exports.enum(collectionRouteKeys),
      source: external_exports.enum(["MANUAL", "URL", "ACTIVE_TAB", "VISIBLE_CONTENT", "PAGE_TYPE", "UNKNOWN"]),
      confidence: external_exports.number().min(0).max(1),
      manuallyConfirmed: external_exports.boolean(),
      evidence: external_exports.array(external_exports.string().max(200)).max(20)
    }).optional(),
    liveScreenInternalApi: external_exports.object({
      contractVersion: external_exports.string().max(50),
      adapterVersion: external_exports.string().max(50),
      enabled: external_exports.boolean(),
      roomId: external_exports.string().regex(liveScreenRoomIdPattern).nullable().optional(),
      roomIdSource: external_exports.enum(liveScreenRoomIdSources),
      roomIdEvidence: external_exports.object({
        urlRoomIds: external_exports.array(external_exports.string().regex(liveScreenRoomIdPattern)).max(2),
        domRoomIds: external_exports.array(external_exports.string().regex(liveScreenRoomIdPattern)).max(2)
      }).optional(),
      endpointStatuses: external_exports.array(external_exports.object({
        endpoint: external_exports.enum(liveScreenInternalApiEndpointKeys),
        status: external_exports.enum(["SUCCESS", "SKIPPED", "FAILED", "ABORTED"]),
        acceptedBytes: external_exports.number().int().min(0).max(384 * 1024),
        reason: external_exports.string().max(100).optional()
      })).max(liveScreenInternalApiEndpointKeys.length),
      minuteRows: external_exports.array(external_exports.object({
        intervalLabel: external_exports.string().min(1).max(100),
        liveViews: external_exports.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/)
      })).max(120).optional()
    }).optional()
  });
  var collectionSnapshotSchema = external_exports.object({
    pageType: external_exports.enum(pageTypes).default("UNKNOWN"),
    sourceUrl: external_exports.string().url().max(snapshotSafetyLimits.urlChars),
    pageTitle: external_exports.string().max(snapshotSafetyLimits.pageTitleChars).default(""),
    rawDomText: external_exports.string().max(snapshotSafetyLimits.rawDomTextChars).default(""),
    rawNetworkJson: external_exports.array(networkRecordSchema).max(snapshotSafetyLimits.networkRecords).default([]),
    rawTableData: external_exports.array(external_exports.unknown()).max(snapshotSafetyLimits.tableItems).default([]),
    visibleMetricsJson: external_exports.array(visibleMetricSchema).max(snapshotSafetyLimits.visibleMetrics).default([]),
    screenshotUrl: external_exports.string().url().max(snapshotSafetyLimits.urlChars).nullable().optional(),
    localCollectedAt: external_exports.string().datetime(),
    collectionRunId: external_exports.string().min(1).max(128).nullable().optional(),
    routeKey: external_exports.enum(collectionRouteKeys).optional(),
    captureProtocolVersion: external_exports.number().int().min(1).max(100).optional(),
    captureMeta: captureMetaSchema.optional()
  });
  var metricPulseSchema = external_exports.object({
    collectionRunId: external_exports.string().min(1).max(128).nullable().optional(),
    routeKey: external_exports.enum(collectionRouteKeys),
    pageType: external_exports.enum(pageTypes),
    localCapturedAt: external_exports.string().datetime(),
    tabState: external_exports.enum(captureTabStates),
    metrics: external_exports.array(visibleMetricSchema).max(32),
    captureMeta: captureMetaSchema,
    sourceUrl: external_exports.string().url().max(snapshotSafetyLimits.urlChars).nullable().optional(),
    captureProtocolVersion: external_exports.number().int().min(1).max(100).optional()
  });

  // ../../packages/shared/dist/collection-field-profiles.js
  var collectionMetricFieldDefinitions = [
    { key: "spend", name: "ad spend", unit: "yuan", labels: ["\u6D88\u8017", "\u5E7F\u544A\u6D88\u8017", "\u4ECA\u65E5\u6D88\u8017", "\u5168\u57DF\u6D88\u8017(\u5143)"] },
    { key: "daily_budget", name: "daily budget", unit: "yuan", labels: ["\u65E5\u9884\u7B97", "\u9884\u7B97"] },
    { key: "remaining_budget", name: "remaining budget", unit: "yuan", labels: ["\u5269\u4F59\u9884\u7B97"] },
    { key: "impressions", name: "impressions", labels: ["\u66DD\u5149\u6B21\u6570", "\u66DD\u5149\u91CF"] },
    { key: "clicks", name: "clicks", labels: ["\u70B9\u51FB\u6B21\u6570", "\u5168\u57DF\u5546\u54C1\u70B9\u51FB\u6B21\u6570"] },
    { key: "ctr", name: "click through rate", unit: "%", labels: ["\u70B9\u51FB\u7387", "CTR"] },
    { key: "orders", name: "orders", labels: ["\u6210\u4EA4\u8BA2\u5355\u6570", "\u652F\u4ED8\u8BA2\u5355", "\u652F\u4ED8\u8BA2\u5355\u6570", "\u5168\u57DF\u6210\u4EA4\u8BA2\u5355\u6570"] },
    { key: "pay_roi", name: "\u6574\u4F53\u652F\u4ED8 ROI", labels: ["\u6574\u4F53\u652F\u4ED8ROI", "\u6574\u4F53\u652F\u4ED8 ROI", "\u4ED8\u6B3E ROI"] },
    { key: "full_domain_pay_roi", name: "\u5168\u57DF\u652F\u4ED8 ROI", labels: ["\u5168\u57DF\u652F\u4ED8ROI", "\u5168\u57DF\u652F\u4ED8 ROI", "\u5168\u57DFROI", "\u5168\u57DF ROI"] },
    { key: "verify_roi", name: "verify ROI", labels: ["\u6838\u9500 ROI"] },
    { key: "gross_profit_roi", name: "gross profit ROI", labels: ["\u6BDB\u5229 ROI"] },
    { key: "gmv", name: "GMV", unit: "yuan", labels: ["\u6210\u4EA4\u91D1\u989D", "\u652F\u4ED8\u91D1\u989D", "GMV", "\u5168\u57DF\u6210\u4EA4\u91D1\u989D(\u5143)"] },
    { key: "gpm", name: "GPM", unit: "yuan", labels: ["\u5343\u6B21\u89C2\u770B\u6210\u4EA4\u91D1\u989D", "GPM"] },
    { key: "live_viewers", name: "live viewers", labels: ["\u76F4\u64AD\u95F4\u89C2\u770B\u4EBA\u6570", "\u89C2\u770B\u4EBA\u6570", "\u770B\u64AD\u4EBA\u6570", "\u6574\u573A\u7D2F\u8BA1\u770B\u64AD\u4EBA\u6570"] },
    { key: "current_online_viewers", name: "current online viewers", labels: ["\u5F53\u524D\u5728\u7EBF\u4EBA\u6570", "\u5B9E\u65F6\u5728\u7EBF\u4EBA\u6570", "\u5728\u7EBF\u4EBA\u6570"] },
    { key: "average_watch_duration_seconds", name: "average watch duration", unit: "s", labels: ["\u4EBA\u5747\u89C2\u770B\u65F6\u957F", "\u5E73\u5747\u89C2\u770B\u65F6\u957F"] },
    { key: "exposure_users", name: "exposure users", labels: ["\u66DD\u5149\u4EBA\u6570", "\u5546\u54C1\u66DD\u5149\u4EBA\u6570", "\u76F4\u64AD\u66DD\u5149\u4EBA\u6570"] },
    { key: "click_users", name: "click users", labels: ["\u70B9\u51FB\u4EBA\u6570", "\u5546\u54C1\u70B9\u51FB\u4EBA\u6570"] },
    { key: "transaction_users", name: "transaction users", labels: ["\u6210\u4EA4\u4EBA\u6570", "\u652F\u4ED8\u4EBA\u6570"] },
    { key: "product_click_rate", name: "product click rate", unit: "%", labels: ["\u5546\u54C1\u70B9\u51FB\u7387"] },
    { key: "product_conversion_rate", name: "product conversion rate", unit: "%", labels: ["\u5546\u54C1\u8F6C\u5316\u7387"] },
    { key: "live_room_click_rate", name: "live room click rate", unit: "%", labels: ["\u76F4\u64AD\u95F4\u70B9\u51FB\u7387"] },
    { key: "hourly_live_views", name: "\u5C0F\u65F6\u770B\u64AD\u6B21\u6570", labels: ["\u5C0F\u65F6\u770B\u64AD\u6B21\u6570"] },
    { key: "hourly_natural_live_views", name: "\u5C0F\u65F6\u81EA\u7136\u770B\u64AD\u6B21\u6570", labels: ["\u5C0F\u65F6\u81EA\u7136\u770B\u64AD\u6B21\u6570"] },
    { key: "hourly_commercial_live_views", name: "\u5C0F\u65F6\u5546\u4E1A\u770B\u64AD\u6B21\u6570", labels: ["\u5C0F\u65F6\u5546\u4E1A\u770B\u64AD\u6B21\u6570"] },
    { key: "store_searches", name: "store searches", labels: ["\u95E8\u5E97\u641C\u7D22\u91CF", "\u641C\u7D22\u91CF"] },
    { key: "poi_visits", name: "POI visits", labels: ["POI\u8BBF\u95EE", "POI \u8BBF\u95EE", "\u95E8\u5E97\u8BBF\u95EE"] },
    { key: "shelf_gmv", name: "shelf GMV", unit: "yuan", labels: ["\u8D27\u67B6\u6210\u4EA4", "\u56E2\u8D2D\u8D27\u67B6"] },
    { key: "search_gmv", name: "search GMV", unit: "yuan", labels: ["\u641C\u7D22\u6210\u4EA4"] }
  ];
  var productTableFields = [
    { key: "id", semantic: "UNKNOWN", labels: ["\u5546\u54C1ID", "\u5546\u54C1\u7F16\u53F7", "SPUID", "\u5546\u54C1\u7F16\u7801"], identity: true },
    { key: "name", semantic: "UNKNOWN", labels: ["\u5546\u54C1\u540D\u79F0", "\u5546\u54C1\u6807\u9898", "\u5546\u54C1\u540D"], identity: true },
    { key: "price", semantic: "CURRENCY", labels: ["\u552E\u4EF7", "\u5546\u54C1\u552E\u4EF7", "\u539F\u4EF7"] },
    { key: "seckillPrice", semantic: "CURRENCY", labels: ["\u79D2\u6740\u4EF7", "\u6D3B\u52A8\u4EF7", "\u5230\u624B\u4EF7"] },
    { key: "paymentAmount", semantic: "CURRENCY", labels: ["\u652F\u4ED8\u91D1\u989D", "\u6210\u4EA4\u91D1\u989D", "\u5546\u54C1\u6210\u4EA4\u91D1\u989D", "GMV"] },
    { key: "orders", semantic: "COUNT", labels: ["\u652F\u4ED8\u8BA2\u5355\u6570", "\u652F\u4ED8\u8BA2\u5355", "\u6210\u4EA4\u8BA2\u5355\u6570", "\u6210\u4EA4\u8BA2\u5355", "\u8BA2\u5355\u6570"] },
    { key: "impressions", semantic: "COUNT", labels: ["\u5546\u54C1\u66DD\u5149\u4EBA\u6570", "\u5546\u54C1\u66DD\u5149", "\u66DD\u5149\u4EBA\u6570", "\u66DD\u5149\u91CF", "\u66DD\u5149"] },
    { key: "clicks", semantic: "COUNT", labels: ["\u5546\u54C1\u70B9\u51FB\u4EBA\u6570", "\u5546\u54C1\u70B9\u51FB", "\u70B9\u51FB\u4EBA\u6570", "\u70B9\u51FB\u91CF", "\u70B9\u51FB"] },
    { key: "detailVisits", semantic: "COUNT", labels: ["\u5546\u54C1\u8BE6\u60C5\u8BBF\u95EE\u4EBA\u6570", "\u5546\u54C1\u8BE6\u60C5\u8BBF\u95EE", "\u8BE6\u60C5\u8BBF\u95EE\u4EBA\u6570", "\u8BE6\u60C5\u8BBF\u95EE"] },
    { key: "submitVisits", semantic: "COUNT", labels: ["\u63D0\u5355\u8BBF\u95EE\u4EBA\u6570", "\u63D0\u5355\u8BBF\u95EE", "\u63D0\u4EA4\u8BA2\u5355\u4EBA\u6570", "\u63D0\u5355\u4EBA\u6570"] },
    { key: "submitRate", semantic: "PERCENTAGE", labels: ["\u63D0\u5355\u7387", "\u63D0\u4EA4\u8BA2\u5355\u7387"] },
    { key: "conversionRate", semantic: "PERCENTAGE", labels: ["\u652F\u4ED8\u8F6C\u5316\u7387", "\u6210\u4EA4\u8F6C\u5316\u7387", "\u8F6C\u5316\u7387"] }
  ];
  var trafficTableFields = [
    { key: "period", semantic: "UNKNOWN", labels: ["\u65F6\u95F4\u6BB5", "\u65F6\u95F4", "\u65F6\u6BB5", "\u5C0F\u65F6"], identity: true },
    { key: "liveViews", semantic: "COUNT", labels: ["\u5C0F\u65F6\u770B\u64AD\u6B21\u6570", "\u770B\u64AD\u6B21\u6570"] },
    { key: "naturalLiveViews", semantic: "COUNT", labels: ["\u5C0F\u65F6\u81EA\u7136\u770B\u64AD\u6B21\u6570", "\u81EA\u7136\u770B\u64AD\u6B21\u6570"] },
    { key: "commercialLiveViews", semantic: "COUNT", labels: ["\u5C0F\u65F6\u5546\u4E1A\u770B\u64AD\u6B21\u6570", "\u5546\u4E1A\u770B\u64AD\u6B21\u6570"] }
  ];
  var taskTableFields = [
    { key: "id", semantic: "UNKNOWN", labels: ["\u6295\u6D41\u5355\u5143ID", "\u5355\u5143ID", "\u4EFB\u52A1ID", "\u8BA1\u5212ID"], identity: true },
    { key: "name", semantic: "UNKNOWN", labels: ["\u6295\u6D41\u5355\u5143", "\u5355\u5143\u540D\u79F0", "\u4EFB\u52A1\u540D\u79F0", "\u8BA1\u5212\u540D\u79F0", "\u5E7F\u544A\u7EC4\u540D\u79F0"], identity: true },
    { key: "status", semantic: "UNKNOWN", labels: ["\u6295\u653E\u72B6\u6001", "\u4EFB\u52A1\u72B6\u6001", "\u8BA1\u5212\u72B6\u6001", "\u72B6\u6001"] },
    { key: "budget", semantic: "CURRENCY", labels: ["\u65E5\u9884\u7B97", "\u6BCF\u65E5\u9884\u7B97", "\u9884\u7B97"] },
    { key: "spend", semantic: "CURRENCY", labels: ["\u5E7F\u544A\u6D88\u8017", "\u603B\u6D88\u8017", "\u6D88\u8017"] },
    { key: "roi", semantic: "ROI", labels: ["\u652F\u4ED8ROI", "\u6838\u9500ROI", "\u6574\u4F53\u652F\u4ED8ROI", "ROI"] },
    { key: "targetRoi", semantic: "ROI", labels: ["\u76EE\u6807ROI", "\u76EE\u6807\u652F\u4ED8ROI", "ROI\u76EE\u6807"] },
    { key: "orders", semantic: "COUNT", labels: ["\u652F\u4ED8\u8BA2\u5355\u6570", "\u652F\u4ED8\u8BA2\u5355", "\u6210\u4EA4\u8BA2\u5355\u6570", "\u8BA2\u5355\u6570"] },
    { key: "impressions", semantic: "COUNT", labels: ["\u66DD\u5149\u91CF", "\u66DD\u5149\u6B21\u6570", "\u66DD\u5149"] },
    { key: "clicks", semantic: "COUNT", labels: ["\u70B9\u51FB\u91CF", "\u70B9\u51FB\u6B21\u6570", "\u70B9\u51FB\u4EBA\u6570", "\u70B9\u51FB"] },
    { key: "ctr", semantic: "PERCENTAGE", labels: ["\u70B9\u51FB\u7387", "CTR"] }
  ];
  var collectionFieldProfiles = {
    LIVE_PRODUCT_TAB: {
      adapterId: "live-product-tab",
      pageType: "LIVE_DATA_SCREEN",
      keywords: ["\u5546\u54C1\u5217\u8868", "\u5173\u6CE8\u5546\u54C1", "\u63A8\u8350\u8FD4\u573A", "\u5546\u54C1\u753B\u50CF"],
      metricKeys: ["gmv", "orders", "impressions", "clicks", "ctr"],
      periodRequired: true,
      tableFields: productTableFields
    },
    LIVE_TRAFFIC_TAB: {
      adapterId: "live-traffic-tab",
      pageType: "LIVE_DATA_SCREEN",
      keywords: ["\u76F4\u64AD\u6D41\u91CF", "\u6D41\u91CF\u5206\u6790", "\u5C0F\u65F6\u81EA\u7136\u770B\u64AD\u6B21\u6570", "\u5C0F\u65F6\u5546\u4E1A\u770B\u64AD\u6B21\u6570"],
      metricKeys: ["live_viewers", "hourly_live_views", "hourly_natural_live_views", "hourly_commercial_live_views"],
      periodRequired: true,
      tableFields: trafficTableFields
    },
    LIVE_DATA_SCREEN: {
      adapterId: "live-screen",
      pageType: "LIVE_DATA_SCREEN",
      keywords: ["\u76F4\u64AD\u6570\u636E\u5927\u5C4F", "\u76F4\u64AD\u95F4", "\u770B\u64AD", "\u66DD\u5149\u4EBA\u6570", "\u6210\u4EA4\u4EBA\u6570"],
      metricKeys: ["gmv", "current_online_viewers", "average_watch_duration_seconds", "gpm", "orders", "transaction_users", "product_conversion_rate"],
      periodRequired: true,
      tableFields: []
    },
    LOCAL_PROMOTION_DASHBOARD: {
      adapterId: "local-promotion",
      pageType: "LOCAL_PROMOTION_DASHBOARD",
      keywords: ["\u5DE8\u91CF\u672C\u5730\u63A8", "\u672C\u5730\u63A8", "\u6295\u653E", "\u51FA\u4EF7", "\u9884\u7B97", "\u6D88\u8017"],
      metricKeys: ["spend", "daily_budget", "pay_roi", "full_domain_pay_roi", "gmv", "orders", "impressions", "clicks"],
      periodRequired: true,
      tableFields: []
    },
    TASK_TABLE: {
      adapterId: "task-table",
      pageType: "TASK_TABLE",
      keywords: ["\u4EFB\u52A1\u5217\u8868", "\u8BA1\u5212\u5217\u8868", "\u5E7F\u544A\u7EC4", "\u5355\u5143", "\u521B\u610F", "\u72B6\u6001"],
      metricKeys: ["spend", "daily_budget", "orders"],
      periodRequired: true,
      tableFields: taskTableFields
    }
  };
  function metricFieldsForRoute(routeKey) {
    const keys = new Set(collectionFieldProfiles[routeKey]?.metricKeys || []);
    return collectionMetricFieldDefinitions.filter((definition) => keys.has(definition.key));
  }
  function tableFieldForHeader(routeKey, header) {
    const normalized = normalizeCollectionFieldName(header);
    return collectionFieldProfiles[routeKey]?.tableFields.find((field) => field.labels.some((candidate) => normalizeCollectionFieldName(candidate) === normalized)) || null;
  }
  function normalizeCollectionFieldName(value) {
    return value.toLowerCase().replace(/[\s_\-—/（）()：:·]/g, "").replace(/(?:人民币|元|%|倍)$/, "");
  }

  // ../../packages/shared/dist/collection-dashboard.js
  var bulkTableCellReviewInputSchema = external_exports.object({
    snapshotId: external_exports.string().min(1),
    expectedSnapshotUpdatedAt: external_exports.string().datetime(),
    items: external_exports.array(external_exports.object({
      tableIndex: external_exports.number().int().min(0).max(3),
      rowIndex: external_exports.number().int().min(0).max(999),
      columnIndex: external_exports.number().int().min(0).max(99),
      reviewedValue: external_exports.string().optional(),
      reviewStatus: external_exports.enum(["CONFIRMED", "MODIFIED", "IGNORED"])
    }).superRefine((value, ctx) => {
      if (value.reviewStatus === "MODIFIED" && !value.reviewedValue?.trim()) {
        ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["reviewedValue"], message: "MODIFIED requires reviewedValue" });
      }
    })).min(1).max(240)
  });
  var confirmTableBindingInputSchema = external_exports.object({
    snapshotId: external_exports.string().min(1),
    expectedSnapshotUpdatedAt: external_exports.string().datetime(),
    tableIndex: external_exports.number().int().min(0).max(3)
  });

  // ../../packages/shared/dist/index.js
  var businessTypes = ["DOUYIN_LOCAL_LIFE"];
  var subjectTypes = [
    "SUBJECT_PENDING",
    "MERCHANT_OFFICIAL",
    "PROFESSIONAL",
    "EXTERNAL_CREATOR",
    "CREATOR_MATRIX",
    "SERVICE_PROVIDER",
    "PLATFORM_EVENT",
    "BRAND_REGION_MATRIX"
  ];
  var operatorTypes = [
    "OPERATOR_PENDING",
    "MERCHANT_SELF",
    "SERVICE_PROVIDER_LIVE",
    "SERVICE_PROVIDER_OPERATION",
    "CREATOR_SELF",
    "AGENCY_LEADER",
    "PLATFORM_OPERATION",
    "BRAND_REGION"
  ];
  var cooperationTypes = [
    "COOPERATION_PENDING",
    "NONE",
    "PROFESSIONAL_BINDING",
    "CREATOR_COOPERATION",
    "SERVICE_PROVIDER_CONTRACT",
    "PLATFORM_INVITATION",
    "BRAND_MATRIX"
  ];
  var controlLevels = ["PENDING", "HIGH", "MEDIUM", "LOW"];
  var accountPlatforms = ["DOUYIN_LOCAL_LIFE"];
  var collectionTaskStatuses = ["PENDING", "COLLECTING", "REVIEWING", "UPLOADED", "PROCESSING", "ANALYZED", "FAILED"];
  var riskLevels = ["LOW", "MEDIUM", "HIGH"];
  var actionTypes = [
    "OBSERVE",
    "INCREASE_BUDGET",
    "DECREASE_BUDGET",
    "KEEP_BUDGET",
    "FINE_TUNE_TARGETING",
    "DECREASE_BID",
    "PAUSE_TASK",
    "ADJUST_ROI_TARGET",
    "CHECK_LIVE_ROOM",
    "CHECK_CREATIVE",
    "CHECK_AUDIENCE",
    "VERIFY_ACTIVITY",
    "APPLY_ACTIVITY",
    "OPTIMIZE_SCRIPT",
    "REPAIR_REPUTATION",
    "STRENGTHEN_SHELF",
    "CHECK_INVENTORY_BOOKING",
    "OPTIMIZE_POI_SEARCH",
    "REPLACE_CREATOR",
    "UNIFY_CREATOR_SCRIPT",
    "ADJUST_SERVICE_PROVIDER_SOP",
    "RENEGOTIATE_SERVICE_FEE",
    "REUSE_MATERIAL",
    "ALLOCATE_HIGH_VERIFY_STORES",
    "CALIBRATE_SUBJECT",
    "REQUEST_MANUAL_REVIEW"
  ];
  var actionProposalStatuses = ["PENDING_APPROVAL", "APPROVED", "REJECTED", "OBSERVING", "MANUAL_EXECUTED", "EXPIRED", "SUPERSEDED"];
  var metricReviewStatuses = ["PENDING", "CONFIRMED", "MODIFIED", "IGNORED"];
  var dataReviewStatuses = ["REVIEWED", "UNREVIEWED"];
  var metricLayers = ["REVIEWED_METRIC", "REALTIME_API"];
  var observationWindows = ["30m", "2h", "1d", "custom"];
  var actionOutcomeResults = ["IMPROVED", "WORSENED", "NO_CHANGE", "UNCLEAR"];
  var metricKeyLabels = {
    unknown: "\u672A\u77E5\u6307\u6807",
    verify_roi: "\u6838\u9500 ROI",
    gross_profit_roi: "\u6BDB\u5229 ROI",
    pay_roi: "\u652F\u4ED8 ROI",
    full_domain_pay_roi: "\u5168\u57DF\u652F\u4ED8 ROI",
    target_roi: "\u76EE\u6807 ROI",
    spend: "\u6D88\u8017",
    daily_budget: "\u65E5\u9884\u7B97",
    remaining_budget: "\u5269\u4F59\u9884\u7B97",
    recent_30m_spend: "\u8FD1 30 \u5206\u949F\u6D88\u8017",
    recent_30m_orders: "\u8FD1 30 \u5206\u949F\u8BA2\u5355\u6570",
    live_duration_minutes: "\u5F00\u64AD\u65F6\u957F\uFF08\u5206\u949F\uFF09",
    average_watch_duration_seconds: "\u4EBA\u5747\u89C2\u770B\u65F6\u957F\uFF08\u79D2\uFF09",
    minutes_since_last_adjustment: "\u8DDD\u4E0A\u6B21\u8C03\u4EF7\uFF08\u5206\u949F\uFF09",
    orders: "\u6210\u4EA4\u8BA2\u5355\u6570",
    impressions: "\u66DD\u5149\u91CF",
    clicks: "\u70B9\u51FB\u91CF",
    ctr: "\u70B9\u51FB\u7387",
    cpa: "\u8BA2\u5355\u6210\u672C",
    target_cpa: "\u76EE\u6807 CPA",
    live_viewers: "\u76F4\u64AD\u95F4\u89C2\u770B\u4EBA\u6570",
    current_online_viewers: "\u5F53\u524D\u5728\u7EBF\u4EBA\u6570",
    exposure_users: "\u66DD\u5149\u4EBA\u6570",
    click_users: "\u70B9\u51FB\u4EBA\u6570",
    transaction_users: "\u6210\u4EA4\u4EBA\u6570",
    product_click_rate: "\u5546\u54C1\u70B9\u51FB\u7387",
    product_conversion_rate: "\u5546\u54C1\u8F6C\u5316\u7387",
    live_room_click_rate: "\u76F4\u64AD\u95F4\u70B9\u51FB\u7387",
    hourly_live_views: "\u5C0F\u65F6\u770B\u64AD\u6B21\u6570",
    hourly_natural_live_views: "\u5C0F\u65F6\u81EA\u7136\u770B\u64AD\u6B21\u6570",
    hourly_commercial_live_views: "\u5C0F\u65F6\u5546\u4E1A\u770B\u64AD\u6B21\u6570",
    gpm: "GPM",
    gmv: "GMV",
    gross_profit: "\u6838\u9500\u6BDB\u5229",
    merchant_subsidy: "\u5546\u5BB6\u8865\u8D34",
    service_fee: "\u670D\u52A1\u5546\u8D39\u7528",
    store_rating: "\u95E8\u5E97\u8BC4\u5206",
    complaint_rate: "\u6295\u8BC9\u7387",
    refund_rate: "\u9000\u6B3E\u7387",
    fulfillment_exception_rate: "\u5C65\u7EA6\u5F02\u5E38\u7387",
    inventory_capacity: "\u5E93\u5B58/\u9884\u7EA6\u627F\u63A5\u91CF",
    wrong_price_promise_risk: "\u9519\u4EF7/\u627F\u8BFA\u98CE\u9669",
    activity_verified: "\u6D3B\u52A8\u540E\u53F0\u6838\u9A8C\u72B6\u6001",
    platform_subsidy: "\u5E73\u53F0\u8865\u8D34",
    ad_coupon: "\u6295\u653E\u5238",
    rebate_coupon: "\u6D88\u8FD4\u5238",
    shelf_gmv: "\u8D27\u67B6\u6210\u4EA4 GMV",
    search_gmv: "\u641C\u7D22\u6210\u4EA4 GMV",
    poi_visits: "POI \u8BBF\u95EE\u91CF",
    store_searches: "\u95E8\u5E97\u641C\u7D22\u91CF"
  };
  var metricAliases = {
    unknown: [],
    verify_roi: ["verify_roi", "\u6838\u9500 ROI", "\u6838\u9500ROI", "\u6838\u9500roi"],
    gross_profit_roi: ["gross_profit_roi", "\u6BDB\u5229 ROI", "\u6BDB\u5229ROI", "\u6838\u9500\u6BDB\u5229 ROI", "\u6838\u9500\u6BDB\u5229ROI"],
    pay_roi: ["pay_roi", "\u652F\u4ED8 ROI", "\u652F\u4ED8ROI", "\u4ED8\u6B3E ROI", "\u4ED8\u6B3EROI", "\u6574\u4F53\u652F\u4ED8 ROI", "\u6574\u4F53\u652F\u4ED8ROI"],
    full_domain_pay_roi: ["full_domain_pay_roi", "\u5168\u57DF\u652F\u4ED8 ROI", "\u5168\u57DF\u652F\u4ED8ROI", "\u5168\u57DF ROI", "\u5168\u57DFROI"],
    target_roi: ["target_roi", "\u76EE\u6807 ROI", "\u76EE\u6807ROI"],
    spend: ["spend", "\u6D88\u8017", "\u5E7F\u544A\u6D88\u8017", "\u4ECA\u65E5\u6D88\u8017", "\u6295\u653E\u6D88\u8017"],
    daily_budget: ["daily_budget", "\u65E5\u9884\u7B97", "\u9884\u7B97"],
    remaining_budget: ["remaining_budget", "\u5269\u4F59\u9884\u7B97"],
    recent_30m_spend: ["recent_30m_spend", "\u8FD130\u5206\u949F\u6D88\u8017", "\u8FD1 30 \u5206\u949F\u6D88\u8017"],
    recent_30m_orders: ["recent_30m_orders", "\u8FD130\u5206\u949F\u8BA2\u5355", "\u8FD1 30 \u5206\u949F\u8BA2\u5355\u6570"],
    live_duration_minutes: ["live_duration_minutes", "\u5F00\u64AD\u65F6\u957F", "\u76F4\u64AD\u65F6\u957F", "\u5DF2\u5F00\u64AD\u5206\u949F"],
    average_watch_duration_seconds: ["average_watch_duration_seconds", "\u4EBA\u5747\u89C2\u770B\u65F6\u957F", "\u5E73\u5747\u89C2\u770B\u65F6\u957F"],
    minutes_since_last_adjustment: ["minutes_since_last_adjustment", "\u8DDD\u4E0A\u6B21\u8C03\u4EF7", "\u8DDD\u4E0A\u6B21\u8C03\u6574", "\u6700\u8FD1\u4E00\u6B21\u8C03\u4EF7\u65F6\u95F4"],
    orders: ["orders", "order_count", "conversions", "\u6210\u4EA4\u8BA2\u5355\u6570", "\u652F\u4ED8\u8BA2\u5355", "\u652F\u4ED8\u8BA2\u5355\u6570"],
    impressions: ["impressions", "\u66DD\u5149\u91CF", "\u66DD\u5149\u6B21\u6570", "\u76F4\u64AD\u66DD\u5149\u6B21\u6570"],
    clicks: ["clicks", "\u70B9\u51FB\u91CF", "\u70B9\u51FB\u6B21\u6570", "\u5168\u57DF\u5546\u54C1\u70B9\u51FB\u6B21\u6570"],
    ctr: ["ctr", "CTR", "\u70B9\u51FB\u7387", "\u66DD\u5149\u70B9\u51FB\u7387"],
    cpa: ["cpa", "cost_per_order", "order_cost", "\u8F6C\u5316\u6210\u672C", "\u6210\u4EA4\u6210\u672C", "\u8BA2\u5355\u6210\u672C", "CPA"],
    target_cpa: ["target_cpa", "target_cost", "\u76EE\u6807 CPA", "\u76EE\u6807CPA", "\u76EE\u6807\u6210\u672C"],
    live_viewers: ["live_viewers", "viewers", "\u76F4\u64AD\u95F4\u89C2\u770B\u4EBA\u6570", "\u89C2\u770B\u4EBA\u6570", "\u770B\u64AD\u4EBA\u6570", "\u6574\u573A\u7D2F\u8BA1\u770B\u64AD\u4EBA\u6570"],
    current_online_viewers: ["current_online_viewers", "\u5F53\u524D\u5728\u7EBF\u4EBA\u6570", "\u5B9E\u65F6\u5728\u7EBF\u4EBA\u6570", "\u5728\u7EBF\u4EBA\u6570"],
    exposure_users: ["exposure_users", "\u66DD\u5149\u4EBA\u6570", "\u5546\u54C1\u66DD\u5149\u4EBA\u6570", "\u76F4\u64AD\u66DD\u5149\u4EBA\u6570"],
    click_users: ["click_users", "\u70B9\u51FB\u4EBA\u6570", "\u5546\u54C1\u70B9\u51FB\u4EBA\u6570"],
    transaction_users: ["transaction_users", "\u6210\u4EA4\u4EBA\u6570", "\u652F\u4ED8\u4EBA\u6570"],
    product_click_rate: ["product_click_rate", "\u5546\u54C1\u70B9\u51FB\u7387"],
    product_conversion_rate: ["product_conversion_rate", "\u5546\u54C1\u8F6C\u5316\u7387"],
    live_room_click_rate: ["live_room_click_rate", "\u76F4\u64AD\u95F4\u70B9\u51FB\u7387"],
    hourly_live_views: ["hourly_live_views", "\u5C0F\u65F6\u770B\u64AD\u6B21\u6570"],
    hourly_natural_live_views: ["hourly_natural_live_views", "\u5C0F\u65F6\u81EA\u7136\u770B\u64AD\u6B21\u6570"],
    hourly_commercial_live_views: ["hourly_commercial_live_views", "\u5C0F\u65F6\u5546\u4E1A\u770B\u64AD\u6B21\u6570"],
    gpm: ["gpm", "GPM", "\u5343\u6B21\u89C2\u770B\u6210\u4EA4\u91D1\u989D"],
    gmv: ["gmv", "GMV", "\u6210\u4EA4\u91D1\u989D", "\u652F\u4ED8\u91D1\u989D"],
    gross_profit: ["gross_profit", "\u6838\u9500\u6BDB\u5229", "\u6BDB\u5229"],
    merchant_subsidy: ["merchant_subsidy", "\u5546\u5BB6\u8865\u8D34"],
    service_fee: ["service_fee", "\u670D\u52A1\u8D39", "\u670D\u52A1\u5546\u8D39\u7528"],
    store_rating: ["store_rating", "\u95E8\u5E97\u8BC4\u5206", "\u4F53\u9A8C\u5206", "\u7ECF\u8425\u5206"],
    complaint_rate: ["complaint_rate", "\u6295\u8BC9\u7387", "\u5BA2\u8BC9\u7387"],
    refund_rate: ["refund_rate", "\u9000\u6B3E\u7387"],
    fulfillment_exception_rate: ["fulfillment_exception_rate", "\u5C65\u7EA6\u5F02\u5E38\u7387", "\u5C65\u7EA6\u5F02\u5E38"],
    inventory_capacity: ["inventory_capacity", "\u5E93\u5B58\u627F\u63A5", "\u9884\u7EA6\u627F\u63A5", "\u53EF\u63A5\u5F85\u91CF"],
    wrong_price_promise_risk: ["wrong_price_promise_risk", "\u9519\u4EF7\u98CE\u9669", "\u865A\u5047\u627F\u8BFA", "\u627F\u8BFA\u98CE\u9669"],
    activity_verified: ["activity_verified", "\u6D3B\u52A8\u5DF2\u6838\u9A8C", "\u540E\u53F0\u6838\u9A8C", "\u6D3B\u52A8\u6838\u9A8C\u72B6\u6001"],
    platform_subsidy: ["platform_subsidy", "\u5E73\u53F0\u8865\u8D34"],
    ad_coupon: ["ad_coupon", "\u6295\u653E\u5238"],
    rebate_coupon: ["rebate_coupon", "\u6D88\u8FD4\u5238"],
    shelf_gmv: ["shelf_gmv", "\u8D27\u67B6\u6210\u4EA4 GMV", "\u8D27\u67B6\u6210\u4EA4GMV", "\u56E2\u8D2D\u8D27\u67B6"],
    search_gmv: ["search_gmv", "\u641C\u7D22\u6210\u4EA4 GMV", "\u641C\u7D22\u6210\u4EA4GMV", "\u641C\u7D22\u6210\u4EA4"],
    poi_visits: ["poi_visits", "POI \u8BBF\u95EE\u91CF", "POI\u8BBF\u95EE\u91CF", "POI\u8BBF\u95EE", "\u95E8\u5E97\u8BBF\u95EE"],
    store_searches: ["store_searches", "\u95E8\u5E97\u641C\u7D22\u91CF", "\u641C\u7D22\u91CF"]
  };
  var diagnosisActionToActionType = {
    \u52A0\u9884\u7B97: "INCREASE_BUDGET",
    \u7A33\u9884\u7B97: "KEEP_BUDGET",
    \u5FAE\u8C03\u5B9A\u5411: "FINE_TUNE_TARGETING",
    \u964D\u4F4E\u51FA\u4EF7: "DECREASE_BID",
    \u6682\u505C\u8DD1\u91CF: "PAUSE_TASK",
    \u6838\u9A8C\u6D3B\u52A8: "VERIFY_ACTIVITY",
    \u62A5\u540D\u6D3B\u52A8: "APPLY_ACTIVITY",
    \u4F18\u5316\u8BB2\u89E3: "OPTIMIZE_SCRIPT",
    \u4FEE\u590D\u53E3\u7891: "REPAIR_REPUTATION",
    \u5F3A\u5316\u8D27\u67B6\u627F\u63A5: "STRENGTHEN_SHELF",
    "\u68C0\u67E5\u5E93\u5B58/\u9884\u7EA6": "CHECK_INVENTORY_BOOKING",
    "\u4F18\u5316 POI/\u641C\u7D22\u627F\u63A5": "OPTIMIZE_POI_SEARCH",
    \u66F4\u6362\u8FBE\u4EBA: "REPLACE_CREATOR",
    \u7EDF\u4E00\u8FBE\u4EBA\u8BDD\u672F: "UNIFY_CREATOR_SCRIPT",
    "\u8C03\u6574\u670D\u52A1\u5546 SOP": "ADJUST_SERVICE_PROVIDER_SOP",
    \u91CD\u8C08\u670D\u52A1\u8D39\u7528: "RENEGOTIATE_SERVICE_FEE",
    \u6C89\u6DC0\u7D20\u6750\u590D\u6295: "REUSE_MATERIAL",
    \u503E\u659C\u9AD8\u6838\u9500\u95E8\u5E97: "ALLOCATE_HIGH_VERIFY_STORES",
    \u4E3B\u4F53\u8BC6\u522B\u6821\u51C6: "CALIBRATE_SUBJECT"
  };
  var actionTypeToDiagnosisAction = Object.fromEntries(Object.entries(diagnosisActionToActionType).map(([label, type]) => [type, label]));
  var diagnosticDimensions = ["DATA_QUALITY", "PROFITABILITY", "TRAFFIC", "LIVE_ROOM", "PRODUCT", "COMPLIANCE"];
  var recommendationPriorities = ["P0", "P1", "P2"];
  var decisionAnalysisModes = ["MANAGED_LIVE_GROWTH", "FULL_BUSINESS"];
  var metricKeySchema = external_exports.enum(metricKeys);
  var createActionOutcomeInputSchema = external_exports.object({
    observationWindow: external_exports.enum(observationWindows),
    customWindow: external_exports.string().trim().max(100).nullable().optional(),
    beforeMetrics: external_exports.array(external_exports.object({
      metricKey: external_exports.enum(recordableMetricKeys),
      value: external_exports.number().finite(),
      unit: external_exports.string().trim().max(30).nullable().optional()
    }).strict()).max(100).optional(),
    afterMetrics: external_exports.array(external_exports.object({
      metricKey: external_exports.enum(recordableMetricKeys),
      value: external_exports.number().finite(),
      unit: external_exports.string().trim().max(30).nullable().optional()
    }).strict()).max(100).optional(),
    result: external_exports.enum(actionOutcomeResults),
    note: external_exports.string().trim().max(2e3).nullable().optional(),
    conclusion: external_exports.string().trim().max(2e3).nullable().optional()
  }).superRefine((value, ctx) => {
    if (value.observationWindow === "custom" && !value.customWindow?.trim()) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["customWindow"],
        message: "custom observationWindow requires customWindow"
      });
    }
  });
  var subjectContextSchema = external_exports.object({
    subjectType: external_exports.enum(subjectTypes),
    operatorType: external_exports.enum(operatorTypes),
    cooperationType: external_exports.enum(cooperationTypes),
    controlLevel: external_exports.enum(controlLevels),
    confidence: external_exports.number().min(0).max(1),
    serviceProviderName: external_exports.string().nullable().optional(),
    serviceMode: external_exports.string().nullable().optional(),
    serviceFee: external_exports.number().min(0).nullable().optional()
  });
  var createExtensionPairingCodeSchema = external_exports.object({
    accountProfileId: external_exports.string().min(1, "\u8BF7\u9009\u62E9\u8981\u7ED1\u5B9A\u7684\u5E73\u53F0\u8D26\u53F7"),
    collectionTaskId: external_exports.string().min(1, "\u8BF7\u9009\u62E9\u8981\u7ED1\u5B9A\u7684\u91C7\u96C6\u4EFB\u52A1").optional()
  });
  var exchangeExtensionPairingCodeSchema = external_exports.object({
    code: external_exports.string().trim().regex(/^\d{6}$/, "\u8BF7\u8F93\u5165 6 \u4F4D\u914D\u5BF9\u7801"),
    apiBaseUrl: external_exports.string().url().optional(),
    label: external_exports.string().trim().max(100).optional()
  });
  var selectExtensionTaskSchema = external_exports.object({
    collectionTaskId: external_exports.string().min(1, "\u8BF7\u9009\u62E9\u91C7\u96C6\u4EFB\u52A1")
  });
  var extensionHeartbeatSchema = external_exports.object({
    collectionTaskId: external_exports.string().min(1, "\u63D2\u4EF6\u5C1A\u672A\u7ED1\u5B9A\u91C7\u96C6\u4EFB\u52A1"),
    extensionVersion: external_exports.string().trim().min(1).max(50),
    bridgeProtocolVersion: external_exports.number().int().min(1).max(100).optional(),
    buildFingerprint: external_exports.string().trim().max(100).nullable().optional(),
    currentUrl: external_exports.string().url().max(snapshotSafetyLimits.urlChars),
    pageType: external_exports.enum(pageTypes),
    routeKey: external_exports.enum(collectionRouteKeys).optional(),
    collectable: external_exports.boolean(),
    tabState: external_exports.enum(captureTabStates),
    lastError: external_exports.string().trim().max(500).nullable().optional(),
    observedAt: external_exports.string().datetime()
  });
  var manualMetricItemSchema = external_exports.object({
    key: external_exports.string().trim().max(100).optional(),
    name: external_exports.string().trim().min(1, "\u6307\u6807\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A").max(100),
    value: external_exports.union([external_exports.number(), external_exports.string().trim().max(200)]),
    unit: external_exports.string().trim().max(30).optional().nullable()
  });
  var manualMetricsInputSchema = external_exports.object({
    accountConfirmed: external_exports.literal(true, { message: "\u8BF7\u786E\u8BA4\u6570\u636E\u5C5E\u4E8E\u5F53\u524D\u8D26\u53F7" }),
    pageType: external_exports.enum(pageTypes).default("LOCAL_PROMOTION_DASHBOARD"),
    routeKey: external_exports.enum(collectionRouteKeys).default("LOCAL_PROMOTION_DASHBOARD"),
    sourceLabel: external_exports.string().trim().max(100).default("\u7F51\u9875\u624B\u5DE5\u5F55\u5165"),
    metrics: external_exports.array(manualMetricItemSchema).min(1, "\u8BF7\u81F3\u5C11\u586B\u5199\u4E00\u4E2A\u6307\u6807").max(200, "\u5355\u6B21\u6700\u591A\u5F55\u5165 200 \u4E2A\u6307\u6807")
  });
  var manualCheckItemSchema = external_exports.object({
    title: external_exports.string().min(1),
    reason: external_exports.string().min(1)
  });
  var decisionDataQualitySchema = external_exports.object({
    missingFields: external_exports.array(external_exports.string()),
    lowConfidenceFields: external_exports.array(external_exports.string()).optional(),
    blockingReasons: external_exports.array(external_exports.string()).optional(),
    subjectReady: external_exports.boolean().optional(),
    reviewReady: external_exports.boolean().optional(),
    completeness: external_exports.number().min(0).max(1),
    blocksStrongActions: external_exports.boolean(),
    globalSafetyBlock: external_exports.boolean().optional(),
    actionEligibility: external_exports.record(external_exports.string(), external_exports.object({
      eligible: external_exports.boolean(),
      blockingEvidence: external_exports.array(external_exports.string()),
      missingEvidence: external_exports.array(external_exports.string()),
      maxDataAgeMs: external_exports.number().int().min(0)
    })).optional(),
    blockingEvidence: external_exports.array(external_exports.string()).optional(),
    missingEvidence: external_exports.array(external_exports.string()).optional(),
    collectionQuality: external_exports.object({
      requiredRoutes: external_exports.array(external_exports.enum(collectionRouteKeys)),
      routes: external_exports.array(external_exports.object({
        routeKey: external_exports.enum(collectionRouteKeys),
        state: external_exports.enum(["FRESH", "AGING", "STALE", "MISSING"]),
        lastCollectedAt: external_exports.string().datetime().nullable(),
        ageMs: external_exports.number().nonnegative().nullable()
      })),
      diagnostics: external_exports.array(collectionRouteDiagnosticSchema).optional(),
      completeness: external_exports.number().min(0).max(1),
      missingRoutes: external_exports.array(external_exports.enum(collectionRouteKeys)),
      staleRoutes: external_exports.array(external_exports.enum(collectionRouteKeys)),
      blocksStrongActions: external_exports.boolean()
    }).optional(),
    liveScreenInternalApi: external_exports.object({
      contractVersion: external_exports.string().max(50),
      adapterVersion: external_exports.string().max(50),
      enabled: external_exports.boolean(),
      roomIdSource: external_exports.enum(["URL", "DOM", "URL_AND_DOM", "MISSING", "MISMATCH"]),
      endpointStatuses: external_exports.array(external_exports.object({
        endpoint: external_exports.string().max(100),
        status: external_exports.enum(["SUCCESS", "SKIPPED", "FAILED", "ABORTED"]),
        acceptedBytes: external_exports.number().int().nonnegative(),
        reason: external_exports.string().max(200).optional()
      })).max(10)
    }).optional()
  });
  var reviewCoverageSchema = external_exports.object({
    confirmedCount: external_exports.number().int().nonnegative(),
    modifiedCount: external_exports.number().int().nonnegative(),
    ignoredCount: external_exports.number().int().nonnegative(),
    pendingCount: external_exports.number().int().nonnegative(),
    totalCount: external_exports.number().int().nonnegative()
  });
  var reviewedMetricDTOSchema = external_exports.object({
    id: external_exports.string(),
    taskId: external_exports.string(),
    snapshotId: external_exports.string().nullable().optional(),
    normalizedMetricId: external_exports.string().nullable().optional(),
    metricKey: external_exports.string(),
    metricName: external_exports.string(),
    originalValue: external_exports.string().nullable().optional(),
    reviewedValue: external_exports.string().nullable().optional(),
    metricUnit: external_exports.string().nullable().optional(),
    metricSource: external_exports.enum(metricSources),
    confidence: external_exports.number().min(0).max(1),
    rawEvidence: external_exports.unknown().optional(),
    displayValue: external_exports.string().nullable().optional(),
    normalizedValue: external_exports.string().nullable().optional(),
    fieldLabel: external_exports.string().nullable().optional(),
    displayPrecision: external_exports.number().int().min(0).nullable().optional(),
    unitSource: external_exports.enum(["VALUE", "HEADER", "LABEL", "DEFAULT", "NONE"]).nullable().optional(),
    bindingLocation: external_exports.string().nullable().optional(),
    bindingStatus: external_exports.enum(metricValidationStatuses).nullable().optional(),
    bindingReasons: external_exports.array(external_exports.string()).optional(),
    sourceStatus: external_exports.enum(metricSourceStatuses).nullable().optional(),
    apiValue: external_exports.string().nullable().optional(),
    domValue: external_exports.string().nullable().optional(),
    selectionReason: external_exports.string().nullable().optional(),
    manualSourceSelection: external_exports.enum(["API", "DOM", "IGNORE"]).nullable().optional(),
    pageType: external_exports.string().nullable().optional(),
    scope: external_exports.string().nullable().optional(),
    timeRange: external_exports.string().nullable().optional(),
    reviewStatus: external_exports.enum(metricReviewStatuses),
    reviewedAt: external_exports.string().nullable().optional()
  });
  var reviewMetricInputSchema = external_exports.object({
    expectedSnapshotUpdatedAt: external_exports.string().datetime(),
    reviewedValue: external_exports.string().optional(),
    timeRange: external_exports.string().trim().min(1).max(100).optional(),
    sourceSelection: external_exports.enum(["API", "DOM", "IGNORE"]).optional(),
    reviewStatus: external_exports.enum(["CONFIRMED", "MODIFIED", "IGNORED"])
  }).superRefine((value, ctx) => {
    if (value.reviewStatus === "MODIFIED" && !value.reviewedValue?.trim()) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["reviewedValue"],
        message: "MODIFIED requires reviewedValue"
      });
    }
  });
  var bulkReviewMetricInputSchema = external_exports.object({
    items: external_exports.array(external_exports.object({
      metricId: external_exports.string().min(1),
      expectedSnapshotUpdatedAt: external_exports.string().datetime(),
      reviewedValue: external_exports.string().optional(),
      timeRange: external_exports.string().trim().min(1).max(100).optional(),
      sourceSelection: external_exports.enum(["API", "DOM", "IGNORE"]).optional(),
      reviewStatus: external_exports.enum(["CONFIRMED", "MODIFIED", "IGNORED"])
    }).superRefine((value, ctx) => {
      if (value.reviewStatus === "MODIFIED" && !value.reviewedValue?.trim()) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["reviewedValue"],
          message: "MODIFIED requires reviewedValue"
        });
      }
    })).min(1)
  });
  var confirmAllReviewMetricsInputSchema = external_exports.object({
    snapshotVersions: external_exports.array(external_exports.object({
      snapshotId: external_exports.string().min(1),
      expectedSnapshotUpdatedAt: external_exports.string().datetime()
    })).min(1).max(100).superRefine((versions, ctx) => {
      const seen = /* @__PURE__ */ new Set();
      for (const [index, version] of versions.entries()) {
        if (seen.has(version.snapshotId)) {
          ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: [index, "snapshotId"], message: "snapshotId must be unique" });
        }
        seen.add(version.snapshotId);
      }
    })
  });
  var actionProposalDTOSchema = external_exports.object({
    id: external_exports.string().optional(),
    decisionRunId: external_exports.string().optional(),
    projectId: external_exports.string().optional(),
    collectionTaskId: external_exports.string().optional(),
    actionType: external_exports.enum(actionTypes),
    title: external_exports.string().min(1),
    summary: external_exports.string().nullable().optional(),
    reason: external_exports.string().min(1),
    expectedImpact: external_exports.string().nullable().optional(),
    riskLevel: external_exports.enum(riskLevels),
    confidence: external_exports.number().min(0).max(1),
    requiresApproval: external_exports.boolean(),
    status: external_exports.enum(actionProposalStatuses),
    blockedReason: external_exports.string().nullable().optional(),
    createdAt: external_exports.string().optional(),
    updatedAt: external_exports.string().optional(),
    approvedAt: external_exports.string().nullable().optional(),
    rejectedAt: external_exports.string().nullable().optional(),
    observedAt: external_exports.string().nullable().optional(),
    manualExecutedAt: external_exports.string().nullable().optional()
  });
  var generatedOptimizationRecommendationSchema = external_exports.object({
    priority: external_exports.enum(recommendationPriorities),
    dimension: external_exports.enum(diagnosticDimensions),
    title: external_exports.string().min(1),
    reason: external_exports.string().min(1),
    evidence: external_exports.array(external_exports.string().min(1)).min(1),
    steps: external_exports.array(external_exports.string().min(1)).min(1),
    verifyMetrics: external_exports.array(external_exports.string().min(1)).min(1),
    ruleBoundary: external_exports.string().min(1)
  });
  var decisionEngineInputSchema = external_exports.object({
    projectId: external_exports.string().optional(),
    collectionTaskId: external_exports.string().optional(),
    businessType: external_exports.enum(businessTypes),
    subject: subjectContextSchema,
    pageTitle: external_exports.string().default(""),
    sourceUrl: external_exports.string().default(""),
    metrics: external_exports.array(visibleMetricSchema),
    tables: external_exports.array(decisionTableInputSchema),
    structuredCollectionData: external_exports.array(structuredCollectionDataSchema).optional(),
    visibleText: external_exports.string().default(""),
    networkJsonSummary: external_exports.array(networkRecordSchema).max(50),
    targetRoi: external_exports.number().nullable().optional(),
    targetCpa: external_exports.number().nullable().optional(),
    latestAnalysis: external_exports.unknown().nullable().optional(),
    dataReviewStatus: external_exports.enum(dataReviewStatuses).optional(),
    reviewCoverage: reviewCoverageSchema.optional(),
    metricLayer: external_exports.enum(metricLayers).optional(),
    collectionQuality: external_exports.object({
      requiredRoutes: external_exports.array(external_exports.enum(collectionRouteKeys)),
      routes: external_exports.array(external_exports.object({
        routeKey: external_exports.enum(collectionRouteKeys),
        state: external_exports.enum(["FRESH", "AGING", "STALE", "MISSING"]),
        lastCollectedAt: external_exports.string().datetime().nullable(),
        ageMs: external_exports.number().nonnegative().nullable()
      })),
      diagnostics: external_exports.array(collectionRouteDiagnosticSchema).optional(),
      completeness: external_exports.number().min(0).max(1),
      missingRoutes: external_exports.array(external_exports.enum(collectionRouteKeys)),
      staleRoutes: external_exports.array(external_exports.enum(collectionRouteKeys)),
      blocksStrongActions: external_exports.boolean()
    }).optional(),
    realtimeEvidence: external_exports.object({
      routeKey: external_exports.enum(collectionRouteKeys),
      pageType: external_exports.enum(pageTypes),
      observedAt: external_exports.string().datetime(),
      receivedAt: external_exports.string().datetime(),
      metricCount: external_exports.number().int().nonnegative(),
      successfulEndpoints: external_exports.array(external_exports.string().min(1)).max(20),
      source: external_exports.literal("LIVE_SCREEN_INTERNAL_API")
    }).optional()
  });
  var decisionEngineOutputSchema = external_exports.object({
    engineVersion: external_exports.string().optional(),
    ruleVersion: external_exports.string().optional(),
    strategyVersion: external_exports.string().optional(),
    riskLevel: external_exports.enum(riskLevels),
    confidence: external_exports.number().min(0).max(1),
    diagnosis: external_exports.string().min(1),
    actionProposals: external_exports.array(actionProposalDTOSchema),
    manualCheckItems: external_exports.array(manualCheckItemSchema),
    dataQuality: decisionDataQualitySchema,
    businessAnalysis: external_exports.object({
      mode: external_exports.enum(decisionAnalysisModes).optional(),
      headline: external_exports.string().min(1),
      performanceSnapshot: external_exports.array(external_exports.string()),
      findings: external_exports.array(external_exports.object({
        dimension: external_exports.enum(diagnosticDimensions),
        title: external_exports.string().min(1),
        conclusion: external_exports.string().min(1),
        evidence: external_exports.array(external_exports.string()),
        riskLevel: external_exports.enum(riskLevels)
      })),
      recommendations: external_exports.array(external_exports.object({
        priority: external_exports.enum(recommendationPriorities),
        dimension: external_exports.enum(diagnosticDimensions),
        title: external_exports.string().min(1),
        reason: external_exports.string().min(1),
        evidence: external_exports.array(external_exports.string().min(1)).optional(),
        steps: external_exports.array(external_exports.string().min(1)),
        verifyMetrics: external_exports.array(external_exports.string().min(1)),
        ruleBoundary: external_exports.string().min(1)
      })),
      metricExplanations: external_exports.array(external_exports.object({
        title: external_exports.string().min(1),
        value: external_exports.number().nullable(),
        meaning: external_exports.string().min(1),
        use: external_exports.string().min(1),
        caveat: external_exports.string().min(1)
      })),
      ruleReferences: external_exports.array(external_exports.object({
        title: external_exports.string().min(1),
        url: external_exports.string().url(),
        scope: external_exports.string().min(1),
        checkedAt: external_exports.string().min(1)
      }))
    }).optional(),
    calculatedMetrics: external_exports.object({
      serviceProviderAfterCost: external_exports.number().nullable().optional(),
      serviceProviderGrossProfitRoi: external_exports.number().nullable().optional(),
      verifiedPlatformBenefits: external_exports.number().nullable().optional(),
      evidence: external_exports.array(external_exports.string()).optional()
    }).optional()
  });
  var generatedDecisionEngineOutputSchema = decisionEngineOutputSchema.superRefine((output, ctx) => {
    for (const [index, recommendation] of (output.businessAnalysis?.recommendations || []).entries()) {
      if (!generatedOptimizationRecommendationSchema.safeParse(recommendation).success) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["businessAnalysis", "recommendations", index, "evidence"],
          message: "\u65B0\u751F\u6210\u7684\u7ECF\u8425\u5EFA\u8BAE\u5FC5\u987B\u5305\u542B\u81F3\u5C11\u4E00\u6761\u771F\u5B9E\u8BC1\u636E"
        });
      }
    }
  });
  var createProjectSchema = external_exports.object({
    workspaceId: external_exports.string().min(1).optional(),
    accountProfileId: external_exports.string().min(1).optional(),
    name: external_exports.string().trim().min(1, "\u8BF7\u586B\u5199\u9879\u76EE\u540D\u79F0").max(100, "\u9879\u76EE\u540D\u79F0\u4E0D\u80FD\u8D85\u8FC7 100 \u4E2A\u5B57"),
    businessType: external_exports.enum(businessTypes).default("DOUYIN_LOCAL_LIFE"),
    subjectType: external_exports.enum(subjectTypes).default("SUBJECT_PENDING"),
    operatorType: external_exports.enum(operatorTypes).default("OPERATOR_PENDING"),
    cooperationType: external_exports.enum(cooperationTypes).default("COOPERATION_PENDING"),
    controlLevel: external_exports.enum(controlLevels).default("PENDING"),
    subjectConfidence: external_exports.coerce.number().min(0).max(1).default(0),
    serviceProviderName: external_exports.string().trim().optional().nullable(),
    serviceMode: external_exports.string().trim().optional().nullable(),
    serviceFee: external_exports.coerce.number().min(0).optional().nullable()
  }).superRefine((value, ctx) => {
    const usesServiceProvider = value.subjectType === "SERVICE_PROVIDER" || value.operatorType === "SERVICE_PROVIDER_LIVE" || value.operatorType === "SERVICE_PROVIDER_OPERATION";
    if (usesServiceProvider && !value.serviceProviderName?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["serviceProviderName"],
        message: "\u670D\u52A1\u5546\u4EE3\u64AD\u6216\u4EE3\u8FD0\u8425\u9879\u76EE\u5FC5\u987B\u586B\u5199\u670D\u52A1\u5546\u540D\u79F0"
      });
    }
  });
  var createAccountProfileSchema = external_exports.object({
    workspaceId: external_exports.string().min(1).optional(),
    platform: external_exports.enum(accountPlatforms).default("DOUYIN_LOCAL_LIFE"),
    accountName: external_exports.string().trim().min(1, "\u8BF7\u586B\u5199\u5E73\u53F0\u8D26\u53F7\u540D\u79F0").max(100, "\u8D26\u53F7\u540D\u79F0\u4E0D\u80FD\u8D85\u8FC7 100 \u4E2A\u5B57"),
    merchantName: external_exports.string().trim().max(100).optional().nullable(),
    storeName: external_exports.string().trim().max(100).optional().nullable(),
    memo: external_exports.string().trim().max(1e3).optional().nullable()
  });
  var updateAccountProfileSchema = createAccountProfileSchema.omit({ workspaceId: true }).partial().refine((value) => Object.keys(value).length > 0, { message: "\u8BF7\u81F3\u5C11\u4FEE\u6539\u4E00\u9879\u8D26\u53F7\u8D44\u6599" });
  var deleteAccountProfileSchema = external_exports.object({
    accountName: external_exports.string().trim().min(1, "\u8BF7\u786E\u8BA4\u8981\u5220\u9664\u7684\u8D26\u53F7\u540D\u79F0")
  });
  var cloneProjectSchema = external_exports.object({
    name: external_exports.string().trim().min(1, "\u8BF7\u586B\u5199\u65B0\u9879\u76EE\u540D\u79F0").max(100),
    accountProfileId: external_exports.string().min(1).optional(),
    subjectType: external_exports.enum(subjectTypes).optional(),
    operatorType: external_exports.enum(operatorTypes).optional(),
    cooperationType: external_exports.enum(cooperationTypes).optional(),
    serviceProviderName: external_exports.string().trim().max(100, "\u670D\u52A1\u5546\u540D\u79F0\u4E0D\u80FD\u8D85\u8FC7 100 \u4E2A\u5B57").optional().nullable(),
    serviceFee: external_exports.coerce.number().min(0, "\u670D\u52A1\u6210\u672C\u4E0D\u80FD\u5C0F\u4E8E 0").optional().nullable()
  });
  var collectionRouteSourceInputSchema = external_exports.object({
    routeKey: external_exports.enum(collectionRouteKeys),
    sourceUrl: external_exports.string().trim().url("\u8BF7\u8F93\u5165\u5B8C\u6574\u7684\u9875\u9762\u5730\u5740\uFF0C\u4F8B\u5982 https://example.com/page").max(snapshotSafetyLimits.urlChars).optional().nullable()
  });
  var createCollectionTaskSchema = external_exports.object({
    projectId: external_exports.string().min(1),
    sourceUrl: external_exports.string().trim().url("\u8BF7\u8F93\u5165\u5B8C\u6574\u7684\u9875\u9762\u5730\u5740\uFF0C\u4F8B\u5982 https://example.com/page").max(snapshotSafetyLimits.urlChars).optional(),
    pageTitle: external_exports.string().trim().max(100).optional(),
    routeSources: external_exports.array(collectionRouteSourceInputSchema).max(10).optional()
  });
  var confirmSnapshotRouteSchema = external_exports.object({
    confirmed: external_exports.literal(true),
    routeKey: external_exports.enum(collectionRouteKeys).refine((routeKey) => routeKey !== "UNKNOWN", "\u8BF7\u9009\u62E9\u5F53\u524D\u4EFB\u52A1\u4E2D\u7684\u91C7\u96C6\u8DEF\u7EBF"),
    expectedUpdatedAt: external_exports.string().datetime()
  });
  var updateCollectionTaskStatusSchema = external_exports.object({
    status: external_exports.enum(collectionTaskStatuses)
  });
  var authLoginSchema = external_exports.object({
    email: external_exports.string().trim().toLowerCase().email("\u8BF7\u8F93\u5165\u6709\u6548\u90AE\u7BB1").max(128, "\u90AE\u7BB1\u4E0D\u80FD\u8D85\u8FC7 128 \u4E2A\u5B57\u7B26"),
    password: external_exports.string().min(6, "\u5BC6\u7801\u81F3\u5C11 6 \u4F4D").max(128, "\u5BC6\u7801\u4E0D\u80FD\u8D85\u8FC7 128 \u4F4D")
  });
  var authRegisterSchema = authLoginSchema.extend({
    name: external_exports.string().trim().min(1, "\u8BF7\u8F93\u5165\u59D3\u540D").max(100, "\u59D3\u540D\u4E0D\u80FD\u8D85\u8FC7 100 \u4E2A\u5B57").optional()
  });
  var emailVerificationConfirmSchema = external_exports.object({
    token: external_exports.string().regex(/^[A-Za-z0-9_-]{43}$/, "\u9A8C\u8BC1\u94FE\u63A5\u65E0\u6548\u6216\u5DF2\u8FC7\u671F")
  });
  var emailVerificationResendSchema = external_exports.object({
    email: external_exports.string().trim().toLowerCase().email("\u8BF7\u8F93\u5165\u6709\u6548\u90AE\u7BB1").max(128, "\u90AE\u7BB1\u4E0D\u80FD\u8D85\u8FC7 128 \u4E2A\u5B57\u7B26")
  });
  function normalizeMetricLookupValue(value) {
    return value.toLowerCase().replace(/[（）()]/g, "").replace(/[\s_\-:/：，,。]+/g, "");
  }
  var metricAliasLookup = new Map(metricKeys.flatMap((key) => [
    [normalizeMetricLookupValue(key), key],
    [normalizeMetricLookupValue(metricKeyLabels[key]), key],
    ...metricAliases[key].map((alias) => [normalizeMetricLookupValue(alias), key])
  ]));

  // src/capture-budget.ts
  var captureBudget = {
    maxTraversalNodes: 5e4,
    maxRows: 1e3,
    maxColumns: 100,
    maxCells: 5e4,
    maxTableTextBytes: 1048576,
    maxVisibleTextBytes: 1048576,
    // Real dashboard pages can legitimately contain tens of thousands of rendered
    // nodes. Keep the capture bounded without turning ordinary pages into partial
    // evidence before their visible cards and tables have been read.
    maxDurationMs: 1500
  };
  function createCaptureBudgetState(now = performance.now()) {
    return {
      startedAt: now,
      traversedNodes: 0,
      rows: 0,
      columns: 0,
      cells: 0,
      tableTextBytes: 0,
      visibleTextBytes: 0,
      reasons: /* @__PURE__ */ new Set(),
      visibilityCache: /* @__PURE__ */ new WeakMap()
    };
  }
  function collectBudgetedVisibleText(document2, state) {
    const walker = document2.createTreeWalker(document2.body || document2.documentElement, NodeFilter.SHOW_TEXT);
    const chunks = [];
    while (walker.nextNode()) {
      if (!consumeNode(state)) break;
      const text = walker.currentNode.textContent?.trim() || "";
      const parent = walker.currentNode.parentElement;
      if (!text || !parent || !isCaptureVisibleElement(parent, state)) continue;
      const accepted = consumeText(state, text, "VISIBLE_TEXT_LIMIT", "visibleTextBytes", captureBudget.maxVisibleTextBytes);
      if (accepted) chunks.push(accepted);
      if (isTimedOut(state)) break;
    }
    return chunks.join("\n");
  }
  function collectBudgetedTables(document2, state) {
    const tables = [];
    for (const table of document2.querySelectorAll('table,[role="table"],[role="grid"]')) {
      if (!consumeNode(state) || !isCaptureVisibleElement(table, state)) break;
      const rows = [];
      const rowSelector = table.tagName === "TABLE" ? "tr" : '[role="row"]';
      const cellSelector = table.tagName === "TABLE" ? "th,td" : '[role="columnheader"],[role="rowheader"],[role="cell"],[role="gridcell"]';
      for (const row of table.querySelectorAll(rowSelector)) {
        if (!belongsToTable(row, table)) continue;
        if (!consumeNode(state) || state.rows >= captureBudget.maxRows) {
          state.reasons.add("TABLE_ROW_LIMIT");
          break;
        }
        const cells = [];
        for (const cell of row.querySelectorAll(cellSelector)) {
          if (!belongsToRow(cell, row)) continue;
          if (!consumeNode(state) || state.cells >= captureBudget.maxCells || cells.length >= captureBudget.maxColumns) {
            state.reasons.add(state.cells >= captureBudget.maxCells ? "TABLE_CELL_LIMIT" : "TABLE_COLUMN_LIMIT");
            break;
          }
          if (!isCaptureVisibleElement(cell, state)) continue;
          const text = consumeText(state, cell.textContent?.trim() || "", "TABLE_TEXT_LIMIT", "tableTextBytes", captureBudget.maxTableTextBytes);
          if (text) cells.push(text);
          state.cells += 1;
        }
        state.rows += 1;
        state.columns = Math.max(state.columns, cells.length);
        if (cells.length) rows.push(cells);
        if (isTimedOut(state)) break;
      }
      if (rows.length) tables.push(rows);
      if (isTimedOut(state) || state.rows >= captureBudget.maxRows || state.cells >= captureBudget.maxCells) break;
    }
    return tables;
  }
  function belongsToTable(element, table) {
    return typeof element.closest !== "function" || element.closest('table,[role="table"],[role="grid"]') === table;
  }
  function belongsToRow(element, row) {
    return typeof element.closest !== "function" || element.closest('tr,[role="row"]') === row;
  }
  function applyCaptureBudget(meta, state) {
    const truncationReasons = [.../* @__PURE__ */ new Set([...meta.truncationReasons, ...state.reasons])];
    const truncatedFields = [.../* @__PURE__ */ new Set([
      ...meta.truncatedFields,
      ...truncationReasons.some((reason) => reason.includes("TABLE")) ? ["rawTableData"] : [],
      ...truncationReasons.some((reason) => reason.includes("VISIBLE_TEXT")) ? ["rawDomText"] : []
    ])];
    const partial = truncationReasons.length > 0;
    return {
      ...meta,
      completeness: partial ? "PARTIAL" : meta.completeness,
      originalBytes: Math.max(meta.originalBytes, state.tableTextBytes + state.visibleTextBytes),
      acceptedBytes: state.tableTextBytes + state.visibleTextBytes,
      truncatedFields,
      truncationReasons
    };
  }
  function consumeNode(state) {
    if (isTimedOut(state)) return false;
    state.traversedNodes += 1;
    if (state.traversedNodes > captureBudget.maxTraversalNodes) {
      state.reasons.add("NODE_TRAVERSAL_LIMIT");
      return false;
    }
    return true;
  }
  function consumeText(state, value, reason, field, limit) {
    if (!value) return "";
    const available = Math.max(0, limit - state[field]);
    const bytes = new TextEncoder().encode(value);
    if (bytes.byteLength <= available) {
      state[field] += bytes.byteLength;
      return value;
    }
    state.reasons.add(reason);
    if (!available) return "";
    let result = "";
    for (const character of value) {
      const next = result + character;
      if (new TextEncoder().encode(next).byteLength > available) break;
      result = next;
    }
    state[field] += new TextEncoder().encode(result).byteLength;
    return result;
  }
  function isTimedOut(state) {
    if (performance.now() - state.startedAt < captureBudget.maxDurationMs) return false;
    state.reasons.add("TIME_BUDGET_EXCEEDED");
    return true;
  }
  function isCaptureVisibleElement(element, state) {
    const cached = state?.visibilityCache.get(element);
    if (cached != null) return cached;
    let current = element;
    let visible = true;
    while (current) {
      if (current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true") {
        visible = false;
        break;
      }
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(current.tagName)) {
        visible = false;
        break;
      }
      const style = computedStyle(current);
      if (style && (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0")) {
        visible = false;
        break;
      }
      current = current.parentElement;
    }
    state?.visibilityCache.set(element, visible);
    return visible;
  }
  function computedStyle(element) {
    const view = element.ownerDocument?.defaultView || (typeof window === "undefined" ? null : window);
    if (!view || typeof view.getComputedStyle !== "function") return null;
    try {
      return view.getComputedStyle(element);
    } catch {
      return null;
    }
  }

  // src/page-adapters.ts
  var adapters = [
    createAdapter("LIVE_PRODUCT_TAB"),
    createAdapter("LIVE_TRAFFIC_TAB"),
    createAdapter("LIVE_DATA_SCREEN"),
    createAdapter("LOCAL_PROMOTION_DASHBOARD"),
    createAdapter("TASK_TABLE")
  ];
  function selectPageAdapter(input) {
    return adapters.find((adapter) => adapter.detect(input)) || unknownAdapter;
  }
  function createAdapter(routeKey) {
    const profile = collectionFieldProfiles[routeKey];
    if (!profile) throw new Error(`Missing collection field profile for ${routeKey}`);
    return {
      id: profile.adapterId,
      version: "2.2.0",
      pageType: profile.pageType,
      expectedFields: [...profile.metricKeys],
      detect(input) {
        if (input.routeKey === routeKey) return true;
        if (input.routeKey && input.routeKey !== "UNKNOWN") return false;
        const combined = `${input.title}
${input.url}
${input.visibleText.slice(0, 5e4)}`;
        return profile.keywords.some((keyword) => combined.includes(keyword));
      },
      extractMetrics(input) {
        return extractBoundMetrics(input.document, routeKey, profile);
      },
      extractCoverage(input, metrics) {
        return buildCaptureMeta(this, input, metrics, profile, routeKey);
      }
    };
  }
  var unknownAdapter = {
    id: "unknown-page",
    version: "2.0.0",
    pageType: "UNKNOWN",
    expectedFields: [],
    detect: () => true,
    extractMetrics: () => [],
    extractCoverage(input, metrics) {
      return buildCaptureMeta(this, input, metrics);
    }
  };
  function extractBoundMetrics(document2, routeKey, profile) {
    if (typeof document2.querySelectorAll !== "function") return [];
    const definitions = metricFieldsForRoute(routeKey).map(toMetricDefinition);
    return definitions.flatMap((definition) => {
      const bindings = findMetricBindings(document2, definition, profile);
      if (bindings.length !== 1) {
        const labelCount = countMetricLabels(document2, definition.labels);
        if (!labelCount) return [];
        return [invalidBindingMetric(definition, labelCount > 1 ? "FIELD_BINDING_AMBIGUOUS" : "FIELD_VALUE_NOT_UNIQUE")];
      }
      const binding = bindings[0];
      return [{
        key: binding.definition.key,
        name: binding.definition.name,
        value: binding.value,
        unit: binding.unit,
        source: "dom",
        metricSource: "DOM_TEXT",
        confidence: binding.confidence,
        rawEvidence: binding.evidence
      }];
    });
  }
  function toMetricDefinition(definition) {
    return { ...definition, labels: [...definition.labels] };
  }
  function invalidBindingMetric(definition, reason) {
    return {
      key: definition.key,
      name: definition.name,
      value: null,
      unit: definition.unit || null,
      source: "dom",
      metricSource: "DOM_TEXT",
      confidence: 0.1,
      rawEvidence: {
        sourceType: "DOM_TEXT",
        bindingKind: "CARD",
        fieldLabel: definition.labels[0],
        displayValue: "",
        unitSource: definition.unit ? "DEFAULT" : "NONE",
        validationStatus: "INVALID",
        validationReasons: [reason],
        textSnippet: definition.labels[0]
      }
    };
  }
  function countMetricLabels(document2, labels) {
    return [...document2.querySelectorAll("*")].filter((element) => isVisible(element) && !isInsideDataTable(element) && !isMetricDisplayNoise(element) && isExactMetricLabel(element, labels)).length;
  }
  function findMetricBindings(document2, definition, profile) {
    const labelElements = [...document2.querySelectorAll("*")].filter((element) => isVisible(element) && !isInsideDataTable(element) && !isMetricDisplayNoise(element) && isExactMetricLabel(element, definition.labels));
    const bindings = [];
    for (const labelElement of labelElements) {
      const container = findMetricContainer(labelElement, definition);
      if (!container) continue;
      const labelsInContainer = [...container.querySelectorAll("*")].filter((element) => isVisible(element) && isExactMetricLabel(element, definition.labels));
      if (labelsInContainer.length !== 1) continue;
      const values = findMetricValueElements(container, labelElement, definition);
      if (values.length !== 1) continue;
      const displayValue = textOf(values[0]);
      const parsed = parseDisplayedMetricValue(displayValue, metricValueSemantic(definition.key), definition.unit);
      const periodElement = findTimeRangeElement(container);
      const timeRange = periodElement ? extractTimeRange(textOf(periodElement)) : null;
      const periodLocation = periodElement ? componentPath(container, periodElement) : null;
      const periodReasons = profile.periodRequired && !timeRange ? ["TIME_RANGE_MISSING"] : [];
      const label = textOf(labelElement);
      bindings.push({
        definition,
        label,
        displayValue,
        value: parsed.normalizedText,
        unit: definition.unit || parsed.unit,
        confidence: parsed.status === "INVALID" || parsed.normalizedText == null || periodReasons.length ? 0.1 : 0.82,
        evidence: {
          sourceType: "DOM_TEXT",
          bindingKind: "CARD",
          fieldLabel: label,
          displayValue,
          normalizedValue: parsed.normalizedText,
          displayPrecision: parsed.displayPrecision,
          multiplier: parsed.multiplier,
          unitSource: parsed.unit && parsed.unit !== definition.unit ? "VALUE" : definition.unit ? "DEFAULT" : "NONE",
          timeRange,
          timeRangeSource: timeRange ? "COMPONENT" : void 0,
          timeRangeLocation: periodLocation,
          componentPath: componentPath(container, labelElement),
          calibrationSignature: bindingSignature(definition.key, label, parsed.unit || definition.unit || null, componentPath(container, labelElement), periodLocation),
          validationStatus: parsed.status === "INVALID" || parsed.normalizedText == null || periodReasons.length ? "INVALID" : parsed.status,
          validationReasons: [...parsed.reasons, ...periodReasons],
          textSnippet: `${label} ${displayValue}`
        }
      });
    }
    return bindings;
  }
  function findMetricContainer(label, definition) {
    let nearestUniqueValueContainer = null;
    let current = label.parentElement;
    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      if (current.tagName === "BODY" || current.tagName === "HTML") break;
      const labelsInContainer = [...current.querySelectorAll("*")].filter((element) => isVisible(element) && isExactMetricLabel(element, definition.labels));
      if (labelsInContainer.length !== 1) continue;
      const values = findMetricValueElements(current, label, definition);
      if (values.length !== 1) continue;
      nearestUniqueValueContainer ||= current;
      if (findTimeRangeElement(current)) return current;
    }
    return nearestUniqueValueContainer;
  }
  function findMetricValueElements(container, label, definition) {
    const descendants = [...container.querySelectorAll("*")];
    const labelIndex = descendants.indexOf(label);
    const candidates = descendants.filter((element, index) => {
      if (index <= labelIndex) return false;
      if (element === label || !isVisible(element)) return false;
      const text = textOf(element);
      if (!text || isExactMetricLabel(element, definition.labels)) return false;
      if (element.children.length > 0 && !isSplitMetricValueElement(element, definition)) return false;
      const parsed = parseDisplayedMetricValue(text, metricValueSemantic(definition.key), definition.unit);
      return parsed.normalizedText != null || parsed.reasons.includes("VALUE_MISSING");
    });
    const outerCandidates = candidates.filter((candidate) => !candidates.some((other) => other !== candidate && isDescendantOf(candidate, other)));
    const primaryCandidates = outerCandidates.filter((candidate) => !isComparisonMetricValue(candidate, container));
    return primaryCandidates.length ? primaryCandidates : outerCandidates;
  }
  function isSplitMetricValueElement(element, definition) {
    const children = [...element.children].filter(isVisible);
    if (!children.length || children.some((child) => child.children.length > 0 || isExactMetricLabel(child, definition.labels))) return false;
    const displayValue = textOf(element);
    const parsed = parseDisplayedMetricValue(displayValue, metricValueSemantic(definition.key), definition.unit);
    if (parsed.normalizedText == null && !parsed.reasons.includes("VALUE_MISSING")) return false;
    if (children.length > 1) return true;
    return normalizeMetricLookupValue(displayValue) !== normalizeMetricLookupValue(textOf(children[0]));
  }
  function isDescendantOf(candidate, ancestor) {
    let current = candidate.parentElement;
    while (current) {
      if (current === ancestor) return true;
      current = current.parentElement;
    }
    return false;
  }
  function isComparisonMetricValue(element, container) {
    let current = element.parentElement;
    while (current && current !== container) {
      const text = textOf(current);
      if (/^(?:近\s*\d+\s*场均值|近\s*\d+\s*(?:日|天|小时)均值|(?:同|环)比|平均值|目标(?:值)?)/.test(text)) return true;
      current = current.parentElement;
    }
    return false;
  }
  function isExactMetricLabel(element, labels) {
    const text = normalizeMetricLookupValue(textOf(element));
    if (!text || !labels.some((label) => text === normalizeMetricLookupValue(label))) return false;
    return ![...element.children].some((child) => normalizeMetricLookupValue(textOf(child)) === text);
  }
  function isVisible(element) {
    return isCaptureVisibleElement(element);
  }
  function textOf(element) {
    return (element.textContent || "").replace(/\s+/g, " ").trim();
  }
  function extractTimeRange(text) {
    const normalized = text.replace(/\s+/g, " ").trim();
    const direct = normalized.match(/^(?:今日|昨日|昨天|实时|本场|整场|近\s*\d+\s*(?:分钟|小时|天)|\d{1,2}:\d{2}\s*[-至]\s*\d{1,2}:\d{2}|\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:\s*[-至]\s*\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)?)$/);
    if (direct) return direct[0];
    return normalized.match(/^(?:统计周期|数据周期|统计日期|数据日期|时间范围|数据范围|日期范围)\s*[:：]?\s*(今日|昨日|昨天|实时|本场|整场|近\s*\d+\s*(?:分钟|小时|天)|\d{1,2}:\d{2}\s*[-至]\s*\d{1,2}:\d{2}|\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:\s*[-至]\s*\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)?)$/)?.[1] || null;
  }
  function findTimeRangeElement(container) {
    return [container, ...container.querySelectorAll("*")].find((element) => isVisible(element) && !isInsideDataTable(element) && element.children.length === 0 && Boolean(extractTimeRange(textOf(element)))) || null;
  }
  function isInsideDataTable(element) {
    let current = element;
    while (current) {
      const role = current.getAttribute("role");
      if (current.tagName === "TABLE" || role === "table" || role === "grid") return true;
      current = current.parentElement;
    }
    return false;
  }
  function isMetricDisplayNoise(element) {
    let current = element;
    for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
      const className = current.getAttribute("class") || "";
      const role = current.getAttribute("role");
      if (["option", "radio", "tab"].includes(role || "")) return true;
      if (/(?:^|[-_\s])legend(?:[-_\s]|$)|chart|(?:^|[-_\s])tabs?(?:[-_\s]|$)|(?:^|[-_\s])radio-select(?:[-_\s]|$)/i.test(className)) return true;
    }
    return false;
  }
  function componentPath(container, target) {
    const path = [];
    let current = target;
    while (current) {
      const parent = current.parentElement;
      const siblingIndex = parent ? [...parent.children].indexOf(current) : 0;
      path.unshift(`${current.tagName.toLowerCase()}:${Math.max(0, siblingIndex)}`);
      if (current === container) break;
      current = parent;
    }
    return path.join(">");
  }
  function bindingSignature(metricKey, label, unit, path, periodLocation) {
    return [metricKey, normalizeMetricLookupValue(label), unit || "", path, periodLocation || ""].join("|");
  }
  function buildCaptureMeta(adapter, input, metrics, profile, routeKey) {
    const extractedFields = [...new Set(metrics.filter((metric) => metric.value != null && String(metric.value).trim() !== "").map((metric) => String(metric.key)))];
    const expected = adapter.expectedFields;
    const matched = expected.filter((field) => extractedFields.includes(field)).length;
    const coverageRatio = expected.length ? matched / expected.length : 0;
    const renderModes = ["DOM"];
    if (typeof input.document.querySelector === "function" && input.document.querySelector('table,[role="table"],[role="grid"]')) renderModes.push("TABLE");
    if (typeof input.document.querySelector === "function" && input.document.querySelector("canvas")) renderModes.push("CANVAS");
    if (detectVirtualizedContent(input.document)) renderModes.push("VIRTUALIZED");
    const partialRender = renderModes.includes("CANVAS") || renderModes.includes("VIRTUALIZED");
    const completeness = adapter.pageType === "UNKNOWN" ? "UNKNOWN" : partialRender || coverageRatio < 0.75 ? "PARTIAL" : "COMPLETE";
    const originalBytes = byteLength(input.visibleText) + byteLength(safeStringify2(input.tables));
    const truncatedFields = input.visibleText.length >= 2e5 ? ["rawDomText"] : [];
    const tableBindings = extractTableBindings(input, profile, routeKey);
    return {
      adapterId: adapter.id,
      adapterVersion: adapter.version,
      pageFingerprint: fingerprintPage(input, metrics, tableBindings),
      completeness,
      coverageRatio: Math.round(coverageRatio * 100) / 100,
      expectedFields: expected,
      extractedFields,
      visibleRegions: typeof input.document.querySelectorAll === "function" ? [...input.document.querySelectorAll("h1,h2,h3,[role=heading]")].slice(0, 30).map(textOf).filter(Boolean) : [],
      renderModes: [...new Set(renderModes)],
      tableBindings,
      tabState: input.document.visibilityState === "visible" ? "VISIBLE" : "HIDDEN",
      originalBytes,
      acceptedBytes: originalBytes,
      truncatedFields,
      truncationReasons: truncatedFields.length ? ["DOM_TEXT_LIMIT"] : []
    };
  }
  function extractTableBindings(input, profile, routeKey) {
    const tableElements = typeof input.document.querySelectorAll === "function" ? [...input.document.querySelectorAll('table,[role="table"],[role="grid"]')].filter(isVisible) : [];
    return input.tables.flatMap((table, tableIndex) => {
      if (tableIndex > 3 || !Array.isArray(table) || !Array.isArray(table[0])) return [];
      const headers = table[0].map((cell) => String(cell ?? "").trim()).slice(0, 100);
      if (!headers.length || headers.every((header) => !header)) return [];
      const normalizedHeaders = headers.map(normalizeMetricLookupValue);
      const tableFields = headers.map((header) => profile ? tableFieldForHeader(routeKey || input.routeKey || "UNKNOWN", header) : null);
      const identityColumnIndex = tableFields.findIndex((field) => field?.identity);
      const identityColumn = identityColumnIndex >= 0 ? headers[identityColumnIndex] : null;
      const duplicatedHeader = normalizedHeaders.some((header, index) => header && normalizedHeaders.indexOf(header) !== index);
      const duplicatedField = tableFields.some((field, index) => field && tableFields.findIndex((candidate) => candidate?.key === field.key) !== index);
      const rowIdentities = table.slice(1).map((row) => Array.isArray(row) && identityColumnIndex >= 0 ? String(row[identityColumnIndex] ?? "").trim() : "");
      const missingRowIdentity = rowIdentities.some((value) => !value);
      const duplicateRowIdentity = new Set(rowIdentities.filter(Boolean)).size !== rowIdentities.filter(Boolean).length;
      const rowWidthMismatch = table.some((row) => Array.isArray(row) && row.length !== headers.length);
      const uncalibratedHeader = tableFields.some((field, index) => !field && Boolean(headers[index]));
      const tableElement = tableElements[tableIndex] || null;
      const tableContext = tableElement ? findTableContext(tableElement) : null;
      const periodElement = tableContext ? findTimeRangeElement(tableContext) : null;
      const timeRange = periodElement ? extractTimeRange(textOf(periodElement)) : null;
      const tablePath = tableElement && tableContext ? componentPath(tableContext, tableElement) : null;
      const timeRangeLocation = periodElement && tableContext ? componentPath(tableContext, periodElement) : null;
      const invalidReasons = [
        ...headers.some((header) => !header) ? ["TABLE_HEADER_MISSING"] : [],
        ...identityColumn ? [] : ["TABLE_IDENTITY_COLUMN_MISSING"],
        ...duplicatedHeader ? ["TABLE_HEADER_AMBIGUOUS"] : [],
        ...duplicatedField ? ["TABLE_FIELD_AMBIGUOUS"] : [],
        ...missingRowIdentity ? ["TABLE_ROW_IDENTITY_MISSING"] : [],
        ...duplicateRowIdentity ? ["TABLE_ROW_IDENTITY_DUPLICATED"] : [],
        ...rowWidthMismatch ? ["TABLE_COLUMN_COUNT_MISMATCH"] : [],
        ...profile?.periodRequired && !timeRange ? ["TIME_RANGE_MISSING"] : []
      ];
      const reviewReasons = [
        ...!profile?.tableFields.length ? ["TABLE_ROUTE_SCHEMA_UNCALIBRATED"] : [],
        ...uncalibratedHeader ? ["TABLE_HEADER_UNCALIBRATED"] : []
      ];
      const signature = [
        headers.map((header) => normalizeMetricLookupValue(header) || "<empty>").join("|"),
        identityColumnIndex,
        tablePath || "",
        timeRangeLocation || ""
      ].join("::");
      return [{
        tableIndex,
        headers,
        identityColumn,
        identityColumnIndex: identityColumnIndex >= 0 ? identityColumnIndex : null,
        timeRange,
        timeRangeLocation,
        componentPath: tablePath,
        bindingSignature: signature,
        validationStatus: invalidReasons.length ? "INVALID" : "REQUIRES_REVIEW",
        validationReasons: [...invalidReasons, ...reviewReasons]
      }];
    });
  }
  function findTableContext(table) {
    let fallback = table;
    let current = table;
    for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
      if (current.tagName === "BODY" || current.tagName === "HTML") break;
      fallback = current;
      if (findTimeRangeElement(current)) return current;
    }
    return fallback;
  }
  function detectVirtualizedContent(document2) {
    if (typeof document2.querySelectorAll !== "function") return false;
    return [...document2.querySelectorAll("[aria-rowcount]")].some((element) => {
      const total = Number(element.getAttribute("aria-rowcount") || 0);
      const rendered = element.querySelectorAll('[role="row"]').length;
      return total > rendered && rendered > 0;
    });
  }
  function fingerprintPage(input, metrics, tableBindings) {
    const headers = typeof input.document.querySelectorAll === "function" ? [...input.document.querySelectorAll("h1,h2,h3,th,[role=columnheader]")].slice(0, 50).map(textOf).join("|") : "";
    const url = new URL(input.url);
    const metricStructure = metrics.map((metric) => metric.rawEvidence?.calibrationSignature || "").filter(Boolean).sort().join("|");
    const tableStructure = tableBindings.map((binding) => binding.bindingSignature).sort().join("|");
    const value = `${url.hostname}${url.pathname}|${input.title}|${headers}|${metricStructure}|${tableStructure}`;
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  function byteLength(value) {
    return new TextEncoder().encode(value).byteLength;
  }
  function safeStringify2(value) {
    try {
      return JSON.stringify(value) || "";
    } catch {
      return "";
    }
  }

  // src/safety.ts
  var sanitizeSnapshotPayload = sanitizeCollectionSnapshotPayload;
  function isSupportedExtensionCollectionUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return false;
      if (url.hostname === "eos.douyin.com") return url.pathname === "/dp/liveScreen";
      return url.hostname === "localads.chengzijianzhan.cn" && /^\/lamp\/pc\/liveboard2(?:\/|$)/.test(url.pathname);
    } catch {
      return false;
    }
  }

  // src/live-screen-internal-api.ts
  var responseSafetyPattern = /cookie|token|authorization|secret|session|credential/i;
  var totalResponseLimit = 384 * 1024;
  var liveScreenInternalApiRequestTimeoutMs = 4e3;
  async function collectLiveScreenInternalApi(input) {
    const endpointStatuses = [];
    const requestableRoomId = input.enabled && input.roomId && !["MISMATCH", "MISSING"].includes(input.roomIdSource) ? input.roomId : null;
    const baseMeta = {
      contractVersion: liveScreenInternalApiContractVersion,
      adapterVersion: liveScreenInternalApiAdapterVersion,
      enabled: input.enabled,
      roomIdSource: input.roomIdSource,
      ...requestableRoomId ? { roomId: requestableRoomId, roomIdEvidence: input.roomIdEvidence } : {},
      endpointStatuses
    };
    if (!input.enabled) return { metrics: [], captureMeta: baseMeta };
    if (!requestableRoomId) {
      endpointStatuses.push(...liveScreenEndpointKeysForMode(input.mode).map((endpoint2) => ({ endpoint: endpoint2, status: "SKIPPED", acceptedBytes: 0, reason: "ROOM_ID_UNAVAILABLE" })));
      return { metrics: [], captureMeta: baseMeta };
    }
    const metrics = [];
    let acceptedBytes = 0;
    let fatalResponse = false;
    for (const endpoint2 of liveScreenEndpointKeysForMode(input.mode)) {
      if (input.signal?.aborted) {
        endpointStatuses.push({ endpoint: endpoint2, status: "ABORTED", acceptedBytes: 0, reason: "ABORTED" });
        fatalResponse = true;
        break;
      }
      const contract = liveScreenInternalApiContracts[endpoint2];
      const remaining = totalResponseLimit - acceptedBytes;
      if (remaining <= 0) {
        endpointStatuses.push({ endpoint: endpoint2, status: "ABORTED", acceptedBytes: 0, reason: "TOTAL_BYTE_LIMIT" });
        fatalResponse = true;
        break;
      }
      const endpointRequest = createEndpointRequest(
        input.signal,
        input.mode === "PULSE" ? liveScreenInternalApiRequestTimeoutMs : null
      );
      try {
        const response = await fetch(contract.path, {
          method: contract.method,
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(contract.requestSchema.parse({ room_id: requestableRoomId })),
          signal: endpointRequest.signal
        });
        if (response.status === 401 || response.status === 429) {
          endpointStatuses.push({ endpoint: endpoint2, status: "ABORTED", acceptedBytes: 0, reason: `HTTP_${response.status}` });
          fatalResponse = true;
          break;
        }
        if (!response.ok) {
          endpointStatuses.push({ endpoint: endpoint2, status: "FAILED", acceptedBytes: 0, reason: `HTTP_${response.status}` });
          continue;
        }
        const payload = await readSafeJson(response, Math.min(contract.maxResponseBytes, remaining), endpointRequest.signal);
        if (!payload.ok) {
          const reason = endpointRequest.didTimeout() ? "REQUEST_TIMEOUT" : payload.reason;
          endpointStatuses.push({
            endpoint: endpoint2,
            status: ["ABORTED", "SENSITIVE_RESPONSE", "BYTE_LIMIT"].includes(reason) ? "ABORTED" : "FAILED",
            acceptedBytes: payload.acceptedBytes,
            reason
          });
          if (reason === "SENSITIVE_RESPONSE" || reason === "BYTE_LIMIT" || reason === "ABORTED") {
            fatalResponse = true;
            break;
          }
          continue;
        }
        acceptedBytes += payload.acceptedBytes;
        const parsed = contract.responseSchema.safeParse(normalizePlatformResponse(payload.value));
        if (!parsed.success || parsed.data.code !== 0) {
          endpointStatuses.push({ endpoint: endpoint2, status: "FAILED", acceptedBytes: payload.acceptedBytes, reason: parsed.success ? "BUSINESS_ERROR" : "SCHEMA_MISMATCH" });
          if (!parsed.success) {
            fatalResponse = true;
            break;
          }
          continue;
        }
        const projectedMetrics = projectMetrics(endpoint2, parsed.data.data, input.mode);
        endpointStatuses.push({
          endpoint: endpoint2,
          status: "SUCCESS",
          acceptedBytes: payload.acceptedBytes,
          ...input.mode === "PULSE" && endpoint2 === "key_index" && projectedMetrics.length === 0 ? { reason: "PULSE_KEY_INDEX_NO_USABLE_METRICS" } : {}
        });
        metrics.push(...projectedMetrics);
        if (endpoint2 === "room_minute_indicator") {
          const minuteRows = projectMinuteRows(parsed.data.data);
          if (minuteRows.length) baseMeta.minuteRows = minuteRows;
        }
      } catch (error) {
        const reason = endpointRequest.didTimeout() ? "REQUEST_TIMEOUT" : error instanceof DOMException && error.name === "AbortError" ? "ABORTED" : "REQUEST_FAILED";
        endpointStatuses.push({ endpoint: endpoint2, status: reason === "ABORTED" ? "ABORTED" : "FAILED", acceptedBytes: 0, reason });
        if (reason === "ABORTED") {
          fatalResponse = true;
          break;
        }
      } finally {
        endpointRequest.dispose();
      }
    }
    if (fatalResponse) {
      metrics.length = 0;
      delete baseMeta.minuteRows;
    }
    return { metrics, captureMeta: baseMeta };
  }
  function projectMetrics(endpoint2, data, mode) {
    const contract = liveScreenInternalApiContracts[endpoint2];
    return contract.fields.flatMap((field) => {
      if (mode === "PULSE" && field.purpose !== "PULSE_ONLY") return [];
      if (mode === "SNAPSHOT" && field.purpose === "PULSE_ONLY") return [];
      if (field.rowPath) return [];
      const matched = readApprovedFieldValue(data, field.approvedFieldPaths);
      if (!matched) return [];
      const { value, fieldPath } = matched;
      const displayValue = String(value).trim();
      if (!displayValue || responseSafetyPattern.test(displayValue)) return [];
      const parsedValue = field.metricKey === "average_watch_duration_seconds" ? parseAverageWatchDuration(displayValue) : parseDisplayedMetricValue(displayValue, metricValueSemantic(field.metricKey), field.unit);
      if (!parsedValue.normalizedText) return [];
      const evidence = {
        sourceType: "INTERNAL_API",
        bindingKind: "CARD",
        fieldLabel: field.fieldLabel,
        displayValue,
        normalizedValue: parsedValue.normalizedText,
        displayPrecision: field.displayPrecision,
        unitSource: field.unit ? "DEFAULT" : "NONE",
        timeRange: field.timeRange,
        timeRangeSource: "COMPONENT",
        timeRangeLocation: "internal-api-contract",
        componentPath: fieldPath,
        calibrationSignature: `${field.metricKey}|${field.timeRange}|${field.semanticScope}|${fieldPath}`,
        validationStatus: "REQUIRES_REVIEW",
        validationReasons: [],
        endpointKey: endpoint2,
        semanticScope: field.semanticScope,
        apiContractVersion: liveScreenInternalApiContractVersion,
        apiAdapterVersion: liveScreenInternalApiAdapterVersion,
        evidencePurpose: field.purpose
      };
      const apiCandidate = {
        value: parsedValue.normalizedText,
        displayValue,
        unit: field.unit,
        timeRange: field.timeRange,
        displayPrecision: field.displayPrecision,
        fieldPath,
        fieldLabel: field.fieldLabel
      };
      return [{
        key: field.metricKey,
        name: field.metricName,
        value: displayValue,
        unit: field.unit,
        source: "network",
        metricSource: "XHR_JSON",
        confidence: 0.8,
        rawEvidence: {
          ...evidence,
          sourceStatus: "INTERNAL_API",
          apiCandidate,
          selectionReason: "\u4EC5 API \u5B57\u6BB5\u6709\u6548"
        }
      }];
    });
  }
  function parseAverageWatchDuration(displayValue) {
    const matched = displayValue.match(/^((?:0|[1-9]\d*)(?:\.\d+)?)\s*(?:s|秒)$/i);
    if (!matched) return parseDisplayedMetricValue(displayValue, "COUNT", "s");
    return {
      displayValue,
      normalizedText: matched[1],
      displayPrecision: matched[1].split(".")[1]?.length || 0,
      multiplier: 1,
      unit: "s",
      status: "REQUIRES_REVIEW",
      reasons: []
    };
  }
  function readApprovedFieldValue(data, approvedFieldPaths) {
    for (const fieldPath of approvedFieldPaths) {
      const value = readPath(data, fieldPath.replace(/^data\./, ""));
      if (typeof value === "number" && Number.isFinite(value)) return { value, fieldPath };
      if (typeof value === "string" && value.trim()) return { value, fieldPath };
    }
    return null;
  }
  function projectMinuteRows(data) {
    const rows = data.minute_rows;
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return [];
      const record = row;
      const intervalLabel = typeof record.interval_label === "string" ? record.interval_label.trim() : "";
      const liveViews = record.live_views;
      if (!intervalLabel || typeof liveViews !== "number" && typeof liveViews !== "string") return [];
      const value = String(liveViews).trim();
      if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return [];
      return [{ intervalLabel, liveViews: value }];
    });
  }
  async function readSafeJson(response, limit, signal) {
    const reader = response.body?.getReader();
    if (!reader) return { ok: false, acceptedBytes: 0, reason: signal?.aborted ? "ABORTED" : "EMPTY_RESPONSE" };
    const decoder = new TextDecoder();
    let text = "";
    let acceptedBytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        acceptedBytes += chunk.value.byteLength;
        if (acceptedBytes > limit) {
          await reader.cancel();
          return { ok: false, acceptedBytes, reason: "BYTE_LIMIT" };
        }
        text += decoder.decode(chunk.value, { stream: true });
        if (responseSafetyPattern.test(text)) {
          await reader.cancel();
          return { ok: false, acceptedBytes, reason: "SENSITIVE_RESPONSE" };
        }
      }
      text += decoder.decode();
      if (responseSafetyPattern.test(text)) return { ok: false, acceptedBytes, reason: "SENSITIVE_RESPONSE" };
      return { ok: true, value: JSON.parse(text), acceptedBytes };
    } catch {
      return { ok: false, acceptedBytes, reason: signal?.aborted ? "ABORTED" : "JSON_PARSE_FAILED" };
    } finally {
      reader.releaseLock();
    }
  }
  function createEndpointRequest(parentSignal, timeoutMs) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = timeoutMs == null ? null : globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abortFromParent = () => controller.abort();
    if (parentSignal?.aborted) controller.abort();
    else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    return {
      signal: controller.signal,
      didTimeout: () => timedOut,
      dispose: () => {
        if (timer != null) globalThis.clearTimeout(timer);
        parentSignal?.removeEventListener("abort", abortFromParent);
      }
    };
  }
  function readPath(source, path) {
    let current = source;
    for (const segment of path.split(".")) {
      if (!segment || segment.includes("[")) return void 0;
      if (!current || typeof current !== "object" || Array.isArray(current)) return void 0;
      current = current[segment];
    }
    return current;
  }
  function normalizePlatformResponse(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const record = value;
    const code = record.code ?? record.status_code;
    const data = record.data ?? record.result;
    if (typeof code !== "number" || !Number.isInteger(code) || !data || typeof data !== "object" || Array.isArray(data)) {
      return value;
    }
    return { code, data };
  }

  // src/live-screen-capture-plan.ts
  function liveScreenCapturePlan(input) {
    const collectInternalApi = input.internalApiEnabled && input.internalApiEligible;
    return {
      collectInternalApi,
      // A pulse named and surfaced as API must never silently become a DOM pulse.
      // Formal snapshots retain DOM evidence for fallback and API/DOM calibration.
      collectDom: input.mode === "SNAPSHOT"
    };
  }

  // src/live-screen-metric-merge.ts
  function mergeLiveScreenMetrics(domMetrics, apiMetrics) {
    const apiMetricKeys = new Set(apiMetrics.map((metric) => String(metric.key)));
    const comparableDomMetrics = domMetrics.filter((metric) => !apiMetricKeys.has(String(metric.key)) || isComparableDomMetric(metric));
    const domByKey = groupByMergeKey(comparableDomMetrics);
    const apiByKey = groupByMergeKey(apiMetrics);
    const keys = /* @__PURE__ */ new Set([...domByKey.keys(), ...apiByKey.keys()]);
    return [...keys].flatMap((key) => {
      const dom = domByKey.get(key) || [];
      const api = apiByKey.get(key) || [];
      if (dom.length > 1 || api.length > 1) return invalidateDuplicateSourceMetrics(dom, api);
      return mergePair(dom[0], api[0]);
    });
  }
  function liveScreenMetricsForMode(mode, domMetrics, apiMetrics) {
    return mode === "PULSE" ? apiMetrics : mergeLiveScreenMetrics(domMetrics, apiMetrics);
  }
  function mergePair(domMetric, apiMetric) {
    if (!domMetric && !apiMetric) return [];
    const dom = domMetric ? toCandidate(domMetric) : null;
    const api = apiMetric ? toCandidate(apiMetric) : null;
    if (!api) return domMetric ? [withSource(domMetric, "DOM_TEXT", dom, null, "\u4EC5 DOM \u5B57\u6BB5\u6709\u6548")] : [];
    if (!dom) return [withSource(apiMetric, "INTERNAL_API", null, api, "\u4EC5 API \u5B57\u6BB5\u6709\u6548")];
    const scopeConflicts = api.scopeExplicit && dom.scopeExplicit && api.scope !== dom.scope;
    if (api.unit !== dom.unit || api.timeRange !== dom.timeRange || scopeConflicts) {
      return [conflict(apiMetric, dom, api, "\u5355\u4F4D\u3001\u5468\u671F\u6216\u4E1A\u52A1\u53E3\u5F84\u4E0D\u4E00\u81F4")];
    }
    if (equivalent(domMetric, apiMetric)) return [withSource(apiMetric, "API_AND_DOM", dom, api, "API \u4E0E DOM \u5728\u5C55\u793A\u7CBE\u5EA6\u5185\u4E00\u81F4")];
    return [conflict(apiMetric, dom, api, "API \u4E0E DOM \u6570\u503C\u51B2\u7A81")];
  }
  function withSource(metric, sourceStatus, dom, api, selectionReason) {
    const evidence = metric.rawEvidence || { sourceType: metric.metricSource || "UNKNOWN" };
    return {
      ...metric,
      rawEvidence: { ...evidence, sourceStatus, domCandidate: dom || void 0, apiCandidate: api || void 0, selectionReason }
    };
  }
  function conflict(base, dom, api, selectionReason) {
    return {
      ...base,
      value: null,
      confidence: 0.1,
      rawEvidence: {
        ...base.rawEvidence || { sourceType: "INTERNAL_API" },
        sourceStatus: "SOURCE_CONFLICT",
        domCandidate: dom,
        apiCandidate: api,
        selectionReason,
        validationStatus: "INVALID",
        validationReasons: [.../* @__PURE__ */ new Set([...base.rawEvidence?.validationReasons || [], "SOURCE_CONFLICT"])]
      }
    };
  }
  function toCandidate(metric) {
    const evidence = metric.rawEvidence;
    const value = metricValueText(metric, metricValueSemantic(String(metric.key))) || "";
    return {
      value,
      displayValue: evidence?.displayValue || value,
      unit: metric.unit || null,
      timeRange: evidence?.timeRange || "UNKNOWN",
      displayPrecision: evidence?.displayPrecision ?? 0,
      fieldPath: evidence?.componentPath || evidence?.path || evidence?.jsonPath || "unknown",
      fieldLabel: evidence?.fieldLabel || metric.name,
      scope: evidence?.semanticScope || String(metric.key),
      scopeExplicit: Boolean(evidence?.semanticScope)
    };
  }
  function mergeKey(metric) {
    const evidence = metric.rawEvidence;
    return `${metric.key}|${evidence?.timeRange || "UNKNOWN"}`;
  }
  function isComparableDomMetric(metric) {
    const evidence = metric.rawEvidence;
    return metric.value != null && String(metric.value).trim() !== "" && evidence?.validationStatus !== "INVALID" && Boolean(evidence?.timeRange && evidence.timeRange !== "UNKNOWN");
  }
  function groupByMergeKey(metrics) {
    const grouped = /* @__PURE__ */ new Map();
    for (const metric of metrics) {
      const key = mergeKey(metric);
      grouped.set(key, [...grouped.get(key) || [], metric]);
    }
    return grouped;
  }
  function invalidateDuplicateSourceMetrics(domMetrics, apiMetrics) {
    const reason = "\u540C\u4E00\u6765\u6E90\u5B58\u5728\u91CD\u590D\u4E1A\u52A1\u5B57\u6BB5\uFF0C\u5DF2\u505C\u6B62\u81EA\u52A8\u5408\u5E76";
    const withCandidates = [
      ...domMetrics.map((metric) => withSource(metric, "DOM_TEXT", toCandidate(metric), null, reason)),
      ...apiMetrics.map((metric) => withSource(metric, "INTERNAL_API", null, toCandidate(metric), reason))
    ];
    return withCandidates.map((metric) => ({
      ...metric,
      value: null,
      confidence: 0.1,
      rawEvidence: {
        ...metric.rawEvidence || { sourceType: metric.metricSource || "UNKNOWN" },
        validationStatus: "INVALID",
        validationReasons: [.../* @__PURE__ */ new Set([...metric.rawEvidence?.validationReasons || [], "FIELD_BINDING_AMBIGUOUS"])]
      }
    }));
  }
  function equivalent(dom, api) {
    const domValue = metricValueText(dom, metricValueSemantic(String(dom.key)));
    const apiValue = metricValueText(api, metricValueSemantic(String(api.key)));
    if (domValue == null || apiValue == null) return false;
    const precision = Math.max(dom.rawEvidence?.displayPrecision ?? 0, api.rawEvidence?.displayPrecision ?? 0);
    return decimalDifferenceWithinDisplayPrecision(domValue, apiValue, precision);
  }
  function decimalDifferenceWithinDisplayPrecision(left, right, precision) {
    const leftDecimal = decimalParts(left);
    const rightDecimal = decimalParts(right);
    if (!leftDecimal || !rightDecimal) return false;
    const commonScale = Math.max(leftDecimal.fractionDigits, rightDecimal.fractionDigits, precision);
    const leftScaled = leftDecimal.integer * pow10(commonScale - leftDecimal.fractionDigits);
    const rightScaled = rightDecimal.integer * pow10(commonScale - rightDecimal.fractionDigits);
    const difference = leftScaled >= rightScaled ? leftScaled - rightScaled : rightScaled - leftScaled;
    return difference * 2n * pow10(precision) <= pow10(commonScale);
  }
  function decimalParts(value) {
    const matched = value.match(/^(-?)(\d+)(?:\.(\d+))?$/);
    if (!matched) return null;
    const fraction = matched[3] || "";
    const unsigned = BigInt(`${matched[2]}${fraction}`);
    return {
      integer: matched[1] === "-" ? -unsigned : unsigned,
      fractionDigits: fraction.length
    };
  }
  function pow10(exponent) {
    return 10n ** BigInt(exponent);
  }

  // src/live-screen-pulse-page.ts
  function isExactLiveScreenPage(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "eos.douyin.com" && url.pathname === "/dp/liveScreen";
    } catch {
      return false;
    }
  }
  function livePulseRouteDetection(detected) {
    const evidence = "\u5B9E\u65F6 API \u8109\u51B2\uFF1A\u7CBE\u786E\u76F4\u64AD\u6570\u636E\u5927\u5C4F URL";
    return {
      routeKey: "LIVE_DATA_SCREEN",
      source: "PAGE_TYPE",
      confidence: 0.98,
      manuallyConfirmed: false,
      evidence: detected.evidence.includes(evidence) ? [...detected.evidence] : [...detected.evidence, evidence]
    };
  }
  function livePulsePageContext(input) {
    const hasRoomId = Boolean(input.roomId);
    const routeDetection = livePulseRouteDetection(input.routeDetection);
    return {
      pageType: "LIVE_DATA_SCREEN",
      routeKey: routeDetection.routeKey,
      routeDetection,
      livePulseEligible: hasRoomId,
      livePulseRoomId: input.roomId,
      livePulseFailureCode: hasRoomId ? null : "ROOM_ID_UNAVAILABLE"
    };
  }

  // src/live-pulse-schedule.ts
  var livePulseCadenceMs = 5e3;
  var livePulseUploadSafetyIntervalMs = 4100;
  function nextLivePulseAfter(pulseStartedAt, uploadCompletedAt = pulseStartedAt, cadenceMs = livePulseCadenceMs, uploadSafetyIntervalMs = livePulseUploadSafetyIntervalMs) {
    if (!Number.isFinite(pulseStartedAt) || !Number.isFinite(uploadCompletedAt) || !Number.isInteger(cadenceMs) || cadenceMs <= 0 || !Number.isInteger(uploadSafetyIntervalMs) || uploadSafetyIntervalMs <= 0) {
      throw new Error("LIVE_PULSE_CADENCE_INVALID");
    }
    return Math.max(pulseStartedAt + cadenceMs, uploadCompletedAt + uploadSafetyIntervalMs);
  }

  // src/content.ts
  var pageActivityTimer = null;
  var activePulseController = null;
  var activeLivePulseLoop = null;
  var livePulseLoopGeneration = 0;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startContentRuntime, { once: true });
  else startContentRuntime();
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === MESSAGE.START_COLLECTION) {
      void collectSnapshot(
        message.payload?.collectionRunId || null,
        message.payload?.routeOverride || null,
        message.payload?.liveScreenInternalApiEnabled === true,
        message.payload?.collectionMode === "PULSE" ? "PULSE" : "SNAPSHOT"
      ).then((snapshot2) => sendResponse({ ok: true, snapshot: snapshot2 })).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "\u9875\u9762\u91C7\u96C6\u5931\u8D25" }));
      return true;
    }
    if (message?.type === MESSAGE.BEGIN_LIVE_PULSE_LOOP) {
      startLivePulseLoop({
        collectionRunId: typeof message.payload?.collectionRunId === "string" ? message.payload.collectionRunId : null,
        liveScreenInternalApiEnabled: message.payload?.liveScreenInternalApiEnabled === true
      });
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === MESSAGE.STOP_LIVE_PULSE) {
      stopActiveLivePulseLoop();
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === MESSAGE.GET_PAGE_CONTEXT) {
      sendResponse({ ok: true, ...collectPageContext(), tabState: document.visibilityState === "visible" ? "VISIBLE" : "HIDDEN" });
      return true;
    }
    return false;
  });
  function startContentRuntime() {
    startPageActivityHeartbeat();
    document.addEventListener("visibilitychange", () => {
      reportPageActivity();
    });
    window.addEventListener("pagehide", () => {
      reportPageActivity();
    });
  }
  function startLivePulseLoop(input) {
    stopActiveLivePulseLoop();
    const loop = {
      generation: ++livePulseLoopGeneration,
      collectionRunId: input.collectionRunId,
      liveScreenInternalApiEnabled: input.liveScreenInternalApiEnabled,
      timer: null,
      running: false
    };
    activeLivePulseLoop = loop;
    void runLivePulseLoop(loop);
  }
  function stopActiveLivePulseLoop() {
    const loop = activeLivePulseLoop;
    activeLivePulseLoop = null;
    if (loop?.timer != null) window.clearTimeout(loop.timer);
    activePulseController?.abort();
    activePulseController = null;
  }
  async function runLivePulseLoop(loop) {
    if (activeLivePulseLoop !== loop || loop.running) return;
    loop.running = true;
    const pulseStartedAt = Date.now();
    let payload;
    try {
      payload = {
        pulseStartedAt,
        snapshot: await collectSnapshot(
          loop.collectionRunId,
          null,
          loop.liveScreenInternalApiEnabled,
          "PULSE"
        )
      };
    } catch (error) {
      payload = {
        pulseStartedAt,
        error: error instanceof Error ? error.message : "PULSE_CAPTURE_FAILED"
      };
    } finally {
      loop.running = false;
    }
    if (activeLivePulseLoop !== loop) return;
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE.SUBMIT_LIVE_PULSE,
        payload
      });
      if (activeLivePulseLoop !== loop || response?.stop) {
        stopActiveLivePulseLoop();
        return;
      }
      const nextDelayMs = Number.isFinite(response?.nextDelayMs) ? Math.max(0, Number(response?.nextDelayMs)) : Math.max(0, nextLivePulseAfter(pulseStartedAt, Date.now()) - Date.now());
      loop.timer = window.setTimeout(() => void runLivePulseLoop(loop), nextDelayMs);
    } catch {
      stopActiveLivePulseLoop();
    }
  }
  async function collectSnapshot(collectionRunId, routeOverride, liveScreenInternalApiEnabled = false, collectionMode = "SNAPSHOT") {
    if (collectionMode === "PULSE" && isLiveEnded()) throw new Error("LIVE_ENDED");
    const budget = createCaptureBudgetState();
    const rawDomText = collectionMode === "PULSE" ? "" : collectBudgetedVisibleText(document, budget);
    const rawTableData = collectionMode === "PULSE" ? [] : collectBudgetedTables(document, budget);
    const isLiveApiPulse = collectionMode === "PULSE" && isExactLiveScreenPage(window.location.href);
    const baseAdapter = selectPageAdapter({
      document,
      url: window.location.href,
      title: document.title,
      visibleText: rawDomText,
      tables: rawTableData,
      ...isLiveApiPulse ? { routeKey: "LIVE_DATA_SCREEN" } : {}
    });
    const detectedRoute = detectCurrentRoute(rawDomText, baseAdapter.pageType, routeOverride);
    const routeDetection = isLiveApiPulse ? livePulseRouteDetection(detectedRoute) : detectedRoute;
    const adapterInput = { document, url: window.location.href, title: document.title, visibleText: rawDomText, tables: rawTableData, routeKey: routeDetection.routeKey };
    const adapter = selectPageAdapter(adapterInput);
    const isLiveScreen = adapter.pageType === "LIVE_DATA_SCREEN" && isExactLiveScreenPage(window.location.href);
    const roomId = readRoomId();
    const internalApiEligible = isLiveScreen && Boolean(roomId.value) && (collectionMode === "PULSE" || routeDetection.routeKey === "LIVE_DATA_SCREEN");
    const capturePlan = liveScreenCapturePlan({
      mode: collectionMode,
      internalApiEnabled: liveScreenInternalApiEnabled,
      internalApiEligible
    });
    const domMetrics = capturePlan.collectDom ? adapter.extractMetrics(adapterInput) : [];
    const pulseController = collectionMode === "PULSE" && capturePlan.collectInternalApi ? new AbortController() : null;
    if (pulseController) activePulseController = pulseController;
    const api = isLiveScreen ? await collectLiveScreenInternalApi({
      enabled: capturePlan.collectInternalApi,
      roomId: roomId.value,
      roomIdSource: roomId.source,
      roomIdEvidence: roomId.evidence,
      mode: collectionMode,
      signal: pulseController?.signal
    }) : null;
    if (activePulseController === pulseController) activePulseController = null;
    const visibleMetricsJson = liveScreenMetricsForMode(collectionMode, domMetrics, api?.metrics || []);
    const captureMeta = applyCaptureBudget(adapter.extractCoverage(adapterInput, visibleMetricsJson), budget);
    const isPulse = collectionMode === "PULSE";
    return sanitizeSnapshotPayload({
      pageType: adapter.pageType,
      sourceUrl: window.location.href,
      pageTitle: document.title,
      // Visible text is used only during this capture to derive safe fields; it is never persisted or uploaded.
      rawDomText: "",
      rawNetworkJson: [],
      rawTableData: isPulse ? [] : rawTableData,
      visibleMetricsJson,
      screenshotUrl: null,
      localCollectedAt: (/* @__PURE__ */ new Date()).toISOString(),
      collectionRunId: collectionRunId || null,
      routeKey: routeDetection.routeKey,
      captureMeta: { ...captureMeta, routeDetection, ...api ? { liveScreenInternalApi: api.captureMeta } : {} }
    });
  }
  function readRoomId() {
    const urlRoomIds = new URL(window.location.href).searchParams.getAll("room_id");
    const domRoomIds = [...document.querySelectorAll("[data-room-id]")].map((element) => element.dataset.roomId?.trim() || "");
    return resolveLiveScreenRoomId({ urlRoomIds, domRoomIds });
  }
  function startPageActivityHeartbeat() {
    if (pageActivityTimer != null) window.clearInterval(pageActivityTimer);
    reportPageActivity();
    pageActivityTimer = window.setInterval(reportPageActivity, 5e3);
  }
  function reportPageActivity() {
    const context = collectPageContext();
    chrome.runtime.sendMessage({
      type: MESSAGE.PAGE_ACTIVITY,
      payload: {
        currentUrl: window.location.href,
        pageType: context.pageType,
        routeKey: context.routeKey,
        collectable: isSupportedExtensionCollectionUrl(window.location.href),
        tabState: document.visibilityState === "visible" ? "VISIBLE" : "HIDDEN",
        observedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    }, () => void chrome.runtime.lastError);
  }
  function isLiveEnded() {
    if (new URL(window.location.href).pathname !== "/dp/liveScreen") return false;
    const text = document.body?.innerText?.slice(0, 2e4) || "";
    return /直播已结束|本场直播已结束|直播结束/.test(text);
  }
  function collectPageContext() {
    const routeDetection = detectCurrentRoute("");
    const baseInput = { document, url: window.location.href, title: document.title, visibleText: "", tables: [] };
    if (isExactLiveScreenPage(window.location.href)) {
      const roomId = readRoomId().value;
      return {
        currentUrl: window.location.href,
        ...livePulsePageContext({
          routeDetection,
          roomId
        })
      };
    }
    const baseAdapter = selectPageAdapter(baseInput);
    const adapter = selectPageAdapter({ ...baseInput, routeKey: routeDetection.routeKey });
    return {
      currentUrl: window.location.href,
      pageType: adapter.pageType,
      routeKey: routeDetection.routeKey,
      routeDetection,
      livePulseEligible: false,
      livePulseRoomId: null,
      livePulseFailureCode: null
    };
  }
  function detectCurrentRoute(rawDomText, pageType, manualOverride) {
    return detectActiveCollectionRoute({
      pageType: pageType || "UNKNOWN",
      sourceUrl: window.location.href,
      pageTitle: document.title,
      selectedTabLabels: selectedTabLabels(),
      visibleHeadings: visibleHeadings(),
      visibleText: rawDomText ? rawDomText.slice(0, 5e4) : void 0,
      manualOverride
    });
  }
  function selectedTabLabels() {
    const selector = [
      '[role="tab"][aria-selected="true"]',
      '[aria-current="page"]',
      '[role="tab"][class*="active" i]',
      '[role="tab"][class*="selected" i]',
      'nav a[class*="active" i]',
      'nav li[class*="active" i]'
    ].join(",");
    return [...document.querySelectorAll(selector)].filter((element) => isCaptureVisibleElement(element)).map((element) => (element.textContent || "").trim()).filter((value) => value.length > 0 && value.length <= 20).slice(0, 20);
  }
  function visibleHeadings() {
    return [...document.querySelectorAll("h1,h2,h3,[role=heading]")].filter((element) => isCaptureVisibleElement(element)).map((element) => (element.textContent || "").trim()).filter(Boolean).slice(0, 50);
  }
})();
