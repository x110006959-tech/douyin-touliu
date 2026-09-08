// Match the object of an adjustment, not every business noun mentioned in a
// procedure. Controls and measured outcomes are not additional interventions.
const changeVerb = "降低|提高|增加|减少|调整|修改|暂停|更换|替换|优化|改写|重写|上调|下调|调高|调低|改为|设为|改成|设置|切换|扩大|缩小|收窄|减半|翻倍";
const operationPattern = new RegExp(
  `(?<negate>(?:不|无需|无须|禁止|不要|避免|不得|暂不|未)(?:再|做|进行)?(?:(?:将|把)(?:其|它|该值))?(?:${changeVerb}))`
  + "|(?<control>保持|维持|固定)"
  + `|(?<observe>观察|记录|核对|对比|检查|统计|验证|用于|以便|从而)`
  + `|(?<change>${changeVerb})`,
  "g"
);

const variablePatterns = [
  ["出价", /出价|竞价/g],
  ["定向人群", /定向|人群/g],
  ["预算", /预算/g],
  ["直播话术", /脚本|内容|话术|讲解/g],
  ["商品", /商品/g],
  ["价格", /价格/g],
  ["优惠", /优惠/g]
] as const;

export function experimentVariableNames(text: string): string[] {
  // 商品讲解/优惠说明话术 describe content, not a simultaneous product/offer
  // change. Resolve the noun phrase before counting independent variables.
  const targets = text
    .replace(/(?:商品|价格|优惠|人群|预算)(?:的)?(?:卖点|权益|利益点|介绍|说明)*(?=脚本|内容|话术|讲解)/g, "")
    .replace(/商品(?=价格|优惠)/g, "");
  return variablePatterns.filter(([, pattern]) => {
    pattern.lastIndex = 0;
    return pattern.test(targets);
  }).map(([name]) => name);
}

export function changedExperimentVariables(steps: string[], options: { includeImplicitChanges?: boolean } = {}): Array<{ stepIndex: number; variables: string[]; unresolvedAdjustment?: true }> {
  return steps.flatMap((step, stepIndex) => {
    const changed = new Set<string>();
    let unresolvedAdjustment = false;
    // Do not split enumeration lists: “提高出价、预算” is two interventions.
    const clauses = step.split(/[，,。；;\n]|并且|并|同时|然后|随后|但是|但/);
    for (const clause of clauses) {
      const operations = [...clause.matchAll(operationPattern)];
      if (options.includeImplicitChanges !== false && !operations.length && !/(?:不变|照旧|沿用)/.test(clause)) {
        // Ambiguous shorthand is not proof of a read-only step. Preserve the
        // conservative gate unless a control or measurement is explicit.
        for (const variable of experimentVariableNames(clause)) changed.add(variable);
      }
      let negated = false;
      for (const [index, operation] of operations.entries()) {
        const before = clause.slice(
          index === 0 ? 0 : operations[index - 1]!.index! + operations[index - 1]![0].length,
          operation.index
        );
        negated = Boolean(operation.groups?.negate) || (negated && /(?:或|和|及|、)$/.test(before));
        if (!operation.groups?.change || negated) continue;
        const after = clause.slice(operation.index! + operation[0].length, operations[index + 1]?.index);
        // “保持经营设置不变” uses 设置 as a noun, not an instruction to set it.
        if (operation[0] === "设置" && operations[index - 1]?.groups?.control && /^不变/.test(after)) continue;
        const precedingTargets = experimentVariableNames(before);
        // Handle both “提高预算” and “将预算提高”; the following amount or
        // comparison is not another adjustment target in the latter form.
        const variables = precedingTargets.length && /(?:出价|竞价|定向|人群|预算|脚本|内容|话术|讲解|商品|价格|优惠)$/.test(before)
          ? precedingTargets
          : experimentVariableNames(after);
        // A known affirmative operation with an omitted/pronominal object is
        // still an adjustment. Never turn failed target parsing into permission.
        if (!variables.length) unresolvedAdjustment = true;
        for (const variable of variables) changed.add(variable);
      }
    }
    return changed.size || unresolvedAdjustment
      ? [{ stepIndex, variables: [...changed], ...(unresolvedAdjustment ? { unresolvedAdjustment: true as const } : {}) }]
      : [];
  });
}
