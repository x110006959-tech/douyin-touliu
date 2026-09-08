// Bound negation to one clause; uncertainty in another sentence cannot excuse a verdict.
function clauses(text: string) {
  return text.split(/[，,。；;！？!?\n]|但是|然而|不过|但/u);
}

function explicitlyUncertain(prefix: string) {
  return /(?:无法|不能|尚不能|暂不能|难以)(?:据此)?(?:判断|确认|认定|证明|说明)[^，,。；;！？!?\n]{0,32}$/.test(prefix);
}

const benchmark = /行业(?:平均|均值|基准)|健康(?:水平|区间|标准)|通常.{0,20}(?:%|以上|以下|达到)/g;
const qualitative = /(?:表现|效率|时长|转化率|成交|承接)[^，,。；;！？!?\n]{0,16}?(?:良好|较好|较高|较低|有限|优秀|偏弱)/g;

export function hasUnsupportedBenchmark(text: string) {
  return clauses(text).some((clause) => [...clause.matchAll(benchmark)].some((match) => {
    const prefix = clause.slice(0, match.index);
    const suffix = clause.slice(match.index + match[0].length);
    // A statement that the reference itself is absent is not an asserted threshold.
    const missingReference = /(?:缺少|缺乏|未提供|没有|暂无|尚无)[^\d]{0,32}$/.test(prefix)
      && !/\d|为|高于|低于|应当|应达到/.test(suffix);
    const unknownComparison = explicitlyUncertain(prefix) && !/\d|为|应当|应达到/.test(suffix);
    return !missingReference && !unknownComparison;
  }));
}

export function hasUnsupportedQualitativeComparison(text: string) {
  return clauses(text).some((clause) => [...clause.matchAll(qualitative)].some((match) => {
    const verdictOffset = match[0].search(/良好|较好|较高|较低|有限|优秀|偏弱/);
    if (explicitlyUncertain(clause.slice(0, match.index + verdictOffset))) return false;
    const mentionsComparison = /(?:目标|历史|平均|均值|对比|基准)/.test(clause);
    const referenceMissing = /(?:缺少|缺乏|未提供|没有|暂无|尚无)/.test(clause);
    return !mentionsComparison || referenceMissing;
  }));
}

// A known cumulative ROI settles its value and target attainment, not the
// trend, cause, or a different period/unit's ROI. Scope the denial to its own
// predicate so a neighboring window or history reference cannot excuse it.
export function hasKnownRoiContradiction(text: string) {
  return clauses(text).some((clause) => {
    const predicates = /(?:无法|不能|难以|不足以|尚不能|暂不能)[^，,。；;！？!?\n]{0,16}?(?:计算|判断|确认|确定)|(?:缺少|缺乏|没有|未提供)/g;
    const matches = [...clause.matchAll(predicates)];
    return matches.some((match, index) => {
      const after = clause.slice(match.index + match[0].length, matches[index + 1]?.index);
      const roi = /ROI/i.exec(after);
      if (roi && roi.index <= 40) {
        const subject = after.slice(0, roi.index);
        const question = after.slice(roi.index + roi[0].length).trim();
        if (isSeparateRoiScope(subject) || isRoiTrendOrCause(question)) return false;
        // Missing ancillary amount/price detail is not itself a denial of ROI.
        // Only treat a missing-reference predicate as conflicting when it names
        // the known ROI directly, not arbitrary data earlier in the sentence.
        if (/缺少|缺乏|没有|未提供/.test(match[0])) {
          return /^(?:当前|本场|累计|实际|全域|支付|目标|的|\s)*$/.test(subject);
        }
        return true;
      }
      if (/缺少|缺乏|没有|未提供/.test(match[0])) return false;
      // Also cover the subject-first form: “当前 ROI 是否达标无法判断”.
      const previous = matches[index - 1];
      const before = clause.slice(previous ? previous.index + previous[0].length : 0, match.index);
      const priorRoi = /^(.*)ROI(.{0,40})$/i.exec(before);
      return Boolean(priorRoi && !isSeparateRoiScope(priorRoi[1] ?? "") && !isRoiTrendOrCause((priorRoi[2] ?? "").trim()));
    });
  });
}

function isSeparateRoiScope(subject: string) {
  const scope = /(?:区间|窗口|分时段|分计划|单计划|单商品|增量|下一场|未来|历史)([^，,。；;！？!?\n]{0,24})$/.exec(subject);
  return Boolean(scope && !/(?:当前|累计|本场|整场|整体|实际)/.test(scope[1] ?? ""));
}

function isRoiTrendOrCause(question: string) {
  return /^(?:的)?(?:变化趋势|趋势|走势|变化的原因|未达(?:到)?目标的(?:具体)?原因|低于目标的(?:具体)?原因)/.test(question)
    || /^(?:和消耗|与消耗)?\s*(?:是|在|是否|是否在|是在)?\s*(?:改善|回落|上升|下降|变化|持续)/.test(question);
}
