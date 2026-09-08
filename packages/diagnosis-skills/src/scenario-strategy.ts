import type { DiagnosisScenario } from "@douyin-local-life/shared";
import type { DiagnosisSkillId } from "@douyin-local-life/shared/diagnosis";

type DomainSkillId = Exclude<DiagnosisSkillId, "audit_data_readiness" | "retrieve_similar_cases">;

type ScenarioStrategy = {
  scenario: DiagnosisScenario;
  title: string;
  domainOrder: readonly DomainSkillId[];
  domainQuestions: Record<DomainSkillId, string>;
  synthesisInstruction: string;
};

const scenarioStrategies: Record<DiagnosisScenario, ScenarioStrategy> = {
  UNSPECIFIED: {
    scenario: "UNSPECIFIED",
    title: "当前证据诊断",
    domainOrder: ["diagnose_traffic_acquisition", "diagnose_live_room_conversion", "diagnose_product_structure", "diagnose_delivery_units", "diagnose_activity_and_compliance"],
    domainQuestions: {
      diagnose_traffic_acquisition: "确认可用流量来源和统计范围；未指定用途，不假设需要直播中干预。",
      diagnose_live_room_conversion: "区分累计成交与瞬时在线，说明当前承接能确认什么、还不能定位什么。",
      diagnose_product_structure: "核对商品明细是否支持贡献拆解，不假设整场商品表现已完整。",
      diagnose_delivery_units: "先确认同口径目标结果与投放数据范围，不能由达标推断策略有效。",
      diagnose_activity_and_compliance: "优先识别已核验的权益、履约与合规风险，缺失保留未知。"
    },
    synthesisInstruction: "本次未指定使用场景。说明可用数据范围、最有依据的经营判断和一个会改变判断的检查问题，不猜测直播状态，不混写实时干预与整场复盘。"
  },
  LIVE_MONITORING: {
    scenario: "LIVE_MONITORING",
    title: "直播中诊断",
    domainOrder: ["diagnose_activity_and_compliance", "diagnose_traffic_acquisition", "diagnose_live_room_conversion", "diagnose_delivery_units", "diagnose_product_structure"],
    domainQuestions: {
      diagnose_traffic_acquisition: "关注当前流量进入是否有可验证的变化及来源拆解；仅有累计值时不能推断正在断流。说明需要哪一段同口径观察才能区分流量变化与采集问题。",
      diagnose_live_room_conversion: "结合在线、观看时长、成交与本领域趋势，回答当前承接的哪一环有直接证据、哪一环仅是假设。在线为零仅是采集时点事实；不得推断下播，也不得把单次累计成交当作当前转化速度。",
      diagnose_product_structure: "检查当前可见商品的点击与成交关联，提出本轮需要核对的商品承接问题；无商品明细时不猜测主推款或立即换品。",
      diagnose_delivery_units: "分别判断累计目标结果与最近两个完整窗口的产出变化。累计 ROI 达标不能证明最近窗口仍达标；窗口产出比不能直接与全场目标比较。缺少完整窗口时说明下一次应核对的成交和消耗，不直接调整预算或出价。",
      diagnose_activity_and_compliance: "先检查本轮已核验的优惠承诺、库存和履约风险是否影响继续承接；无证据时不声称正在违规，不生成平台操作。"
    },
    synthesisInstruction: "采用直播中检查方式：回答当前最值得关注的经营环节、支持及冲突证据、下一完整观察窗口要核对什么以及什么结果会改变判断。区分累计达标与近期变化；缺少实时趋势时不能说表现稳定。最终唯一方案围绕本轮人工核对，不能把未确认原因直接转成调整。"
  },
  POST_LIVE_REVIEW: {
    scenario: "POST_LIVE_REVIEW",
    title: "场后复盘",
    domainOrder: ["diagnose_delivery_units", "diagnose_product_structure", "diagnose_live_room_conversion", "diagnose_traffic_acquisition", "diagnose_activity_and_compliance"],
    domainQuestions: {
      diagnose_traffic_acquisition: "回看已采集范围内自然与商业流量的贡献线索，区分来源差异与因果贡献；缺分时来源时不要把总观看量当作流量质量结论。",
      diagnose_live_room_conversion: "从本次成交规模、观看时长、商品转化及同口径对照解释承接的已知结果与尚待验证机制。不要把场后在线人数为零列为经营问题，也不要把确认当前是否开播当作复盘主线；场次是否完整仍需独立证据。",
      diagnose_product_structure: "使用已有商品明细检查成交贡献与点击到成交的对应关系，提出下一场可验证的商品问题；无明细时点明应核对哪类商品数据，不能虚构爆款。",
      diagnose_delivery_units: "复核本次可用投放期间的全域成交、消耗、ROI 与目标，区分达标、规模与利润。用已有同口径历史解释变化线索，缺少整场覆盖时只能说已采集范围，不能宣称整场结束或策略有效。",
      diagnose_activity_and_compliance: "回看已记录的活动、退款与履约风险，区分支付结果和后续经营质量；没有核销、结算和成本证据时不推算利润。"
    },
    synthesisInstruction: "采用场后复盘方式：先说明本次可用范围和目标结果，再解释投放、承接与商品之间有哪些有据的联系及替代解释，最后只选下一场最值得验证的一个问题。不得把瞬时在线为零或要求当前直播重新开始作为复盘主问题；场后用途不证明已下播或数据覆盖整场。无对照时不把达标写成策略有效。"
  }
};

export function getDiagnosisScenarioStrategy(scenario: DiagnosisScenario = "UNSPECIFIED"): ScenarioStrategy {
  return scenarioStrategies[scenario];
}
