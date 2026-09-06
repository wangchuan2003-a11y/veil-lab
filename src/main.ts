import "./style.css";
import {
  DEFAULT,
  RULES,
  allocate,
  evaluate,
  drawRole,
  encode,
  decode,
  toJSON,
  fromJSON,
  type Model,
  type Rule,
} from "./model";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const names = ["A", "B", "C", "D", "E", "F"];
const descriptions: Record<
  Rule,
  { name: string; short: string; formula: string }
> = {
  equal: {
    name: "每人一样多",
    short: "资源均分，不看需求与收益。",
    formula: "xᵢ = B / 6。每个位置获得相同资源。",
  },
  needs: {
    name: "基本需求优先",
    short: "先按需求保障，余量再均分。",
    formula:
      "若 B ≤ Σn：xᵢ = B nᵢ / Σn；否则 xᵢ = nᵢ + (B − Σn) / 6。不足时按需求比例缩减。",
  },
  floor: {
    name: "提高最低覆盖",
    short: "让最少的需求覆盖率尽可能高。",
    formula: "xᵢ = B nᵢ / Σn。最大化 min(xᵢ / nᵢ)，使所有位置的覆盖率相同。",
  },
  total: {
    name: "最大化总收益",
    short: "资源给收益系数最高的位置。",
    formula:
      "最大化 Σ(rᵢ xᵢ)。全部资源给最高 r；并列最高者均分。假设线性收益、没有饱和上限。",
  },
};
let model: Model = decode(location.hash) ?? structuredClone(DEFAULT);
let revealed = false;
let revision = 0;
const fmt = (n: number) =>
  n.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
const pct = (n: number) => fmt(n * 100) + "%";
function report(text: string) {
  $("status").textContent = text;
}
function changed() {
  revealed = false;
  revision++;
  render();
  report("假设已更新，位置重新隐藏；同一种子仍会抽到相同位置。");
}
function rebuildInputs() {
  $("assumption-rows").innerHTML = names
    .map(
      (n, i) =>
        `<tr><th scope="row"><span class="position-mark">${n}</span>虚构位置 ${n}</th><td><input type="number" min="1" max="60" step="1" data-need="${i}" aria-label="位置 ${n} 基本需求" value="${model.needs[i]}"></td><td><input type="number" min="0.2" max="3" step="0.1" data-return="${i}" aria-label="位置 ${n} 每单位收益" value="${model.returns[i]}"></td><td id="allocation-${i}"></td><td id="coverage-${i}"></td><td id="outcome-${i}"></td></tr>`,
    )
    .join("");
  $("assumption-rows")
    .querySelectorAll<HTMLInputElement>("input")
    .forEach((input) =>
      input.addEventListener("change", () => {
        const value = Number(input.value);
        if (!input.value || !input.validity.valid || !Number.isFinite(value)) {
          report("请输入输入框范围内的数字。当前模型未改变。");
          rebuildInputs();
          return;
        }
        if (input.dataset.need !== undefined)
          model.needs[Number(input.dataset.need)] = value;
        else model.returns[Number(input.dataset.return)] = value;
        changed();
      }),
    );
}
function render() {
  const result = evaluate(model);
  const own = revealed ? drawRole(model.seed) : -1;
  $("rules")
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.rule === model.rule)),
    );
  $("budget-value").textContent = String(model.budget);
  $<HTMLInputElement>("budget").value = String(model.budget);
  $<HTMLInputElement>("budget-number").value = String(model.budget);
  $<HTMLInputElement>("seed").value = String(model.seed);
  $("formula").textContent = descriptions[model.rule].formula;
  const sum = model.needs.reduce((a, b) => a + b, 0);
  $("shortage").textContent =
    model.budget < sum
      ? `总需求 ${sum}，预算不足 ${sum - model.budget}。任何规则都无法同时满足全部需求。`
      : `总需求 ${sum}，预算余量 ${model.budget - sum}；是否每个人够用仍取决于规则。`;
  const scale = Math.max(...result.allocations, ...model.needs, 1);
  $("people").innerHTML = names
    .map(
      (n, i) =>
        `<article class="person ${own === i ? "is-you" : ""}" aria-label="位置 ${n}${own === i ? "，你的位置" : ""}"><div class="person-title"><span>${n}</span><small>${own === i ? "你在这里" : "虚构位置"}</small></div><div class="vessel" aria-hidden="true"><div class="resource" style="transform:scaleY(${result.allocations[i] / scale})"></div><div class="need-line" style="bottom:${(model.needs[i] / scale) * 100}%"></div></div><strong>${fmt(result.allocations[i])}</strong><span class="coverage">需求覆盖 ${pct(result.coverage[i])}</span></article>`,
    )
    .join("");
  $("floor").textContent = pct(result.minCoverage);
  $("utility").textContent = fmt(result.totalOutcome);
  $("gini").textContent =
    result.gini === null ? "未定义" : result.gini.toFixed(3);
  $("gap").textContent = fmt(result.gap);
  for (let i = 0; i < 6; i++) {
    $(`allocation-${i}`).textContent = fmt(result.allocations[i]);
    $(`coverage-${i}`).textContent = pct(result.coverage[i]);
    $(`outcome-${i}`).textContent = fmt(result.outcomes[i]);
  }
  $("comparison-rows").innerHTML = RULES.map((rule) => {
    const r = evaluate({ ...model, rule });
    return `<tr class="${rule === model.rule ? "chosen" : ""}"><th scope="row">${descriptions[rule].name}${rule === model.rule ? " · 当前" : ""}</th><td>${pct(r.minCoverage)}</td><td>${fmt(r.totalOutcome)}</td><td>${r.gini === null ? "未定义" : r.gini.toFixed(3)}</td><td>${fmt(r.gap)}</td></tr>`;
  }).join("");
  $("veil-state").textContent = revealed
    ? `位置 ${names[own]} 已揭晓`
    : "你的位置尚未揭晓";
  $<HTMLButtonElement>("reveal").disabled = revealed;
  $("reveal-result").textContent = revealed
    ? `你在位置 ${names[own]}：获得 ${fmt(result.allocations[own])}，需求 ${model.needs[own]}，覆盖 ${pct(result.coverage[own])}。你仍愿意接受“${descriptions[model.rule].name}”吗？`
    : "结果会改变你的判断吗？";
}
function adopt(next: Model, message: string) {
  model = next;
  revealed = false;
  revision++;
  rebuildInputs();
  render();
  report(message);
}
for (const rule of RULES) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.rule = rule;
  button.innerHTML = `<strong>${descriptions[rule].name}</strong><span>${descriptions[rule].short}</span>`;
  button.onclick = () => {
    model.rule = rule;
    changed();
  };
  $("rules").append(button);
}
$("math-notes").innerHTML =
  RULES.map(
    (rule) =>
      `<p><strong>${descriptions[rule].name}</strong>：${descriptions[rule].formula}</p>`,
  ).join("") +
  "<p>B 为预算，n 为需求，r 为收益系数，x 为分配资源。Gini = ΣᵢΣⱼ|xᵢ−xⱼ| / (2 × 6 × Σx)。</p>";
for (const id of ["budget", "budget-number"])
  $<HTMLInputElement>(id).addEventListener(
    id === "budget" ? "input" : "change",
    () => {
      const input = $<HTMLInputElement>(id);
      if (!input.value || !input.validity.valid) {
        render();
        report("预算必须为 0–600 的整数。");
        return;
      }
      model.budget = Number(input.value);
      changed();
    },
  );
$("seed").addEventListener("change", () => {
  const input = $<HTMLInputElement>("seed");
  if (!input.value || !input.validity.valid) {
    render();
    report("种子必须为 0–4294967295 的整数。");
    return;
  }
  model.seed = Number(input.value);
  changed();
});
$("reveal").onclick = () => {
  revealed = true;
  render();
  report("规则没有变化，只揭晓你被分到的位置。修改假设或规则可重新比较。");
};
$("new-round").onclick = () => {
  model.seed = crypto.getRandomValues(new Uint32Array(1))[0];
  changed();
  report("新种子已生成。先选规则，再揭晓新位置。");
};
$("reset").onclick = () => adopt(structuredClone(DEFAULT), "已恢复初始模型。");
document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach(
  (button) =>
    (button.onclick = () => {
      const next = structuredClone(DEFAULT);
      if (button.dataset.preset === "symmetric") {
        next.needs = Array(6).fill(20);
        next.returns = Array(6).fill(1);
      } else next.budget = 60;
      adopt(next, "示例假设已加载。数值仅用于思想实验。");
    }),
);
$("share").onclick = async () => {
  const url = new URL(location.href);
  url.hash = encode(model);
  history.replaceState(null, "", url);
  try {
    await navigator.clipboard.writeText(url.href);
    report("实验链接已复制，包含完整模型参数和种子。");
  } catch {
    report("实验已写入地址栏，请手动复制浏览器地址。");
  }
};
$("export").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([toJSON(model)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "veil-lab-experiment.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  report("实验 JSON 已导出，可导入恢复。");
};
$("import").onclick = () => $<HTMLInputElement>("file").click();
$("file").addEventListener("change", async () => {
  const input = $<HTMLInputElement>("file");
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const before = revision;
  try {
    if (file.size > 4000) {
      report("文件过大。请导入 Veil Lab 导出的 JSON（最多 4 KB）。");
      return;
    }
    const next = fromJSON(await file.text());
    if (before !== revision) {
      report("读取时模型已改变，导入已取消。");
      return;
    }
    if (!next) {
      report("实验文件无效，当前模型未改变。");
      return;
    }
    adopt(next, "完整实验已恢复，位置回到未揭晓状态。");
  } catch {
    report("无法读取文件，当前模型未改变。");
  }
});
window.addEventListener("hashchange", () => {
  if (!location.hash.startsWith("#v")) return;
  const next = decode(location.hash);
  if (next) adopt(next, "已恢复链接中的实验设定。");
  else report("实验链接无效，当前模型未改变。");
});
rebuildInputs();
render();
if (location.hash.startsWith("#v"))
  report(
    decode(location.hash)
      ? "已加载分享实验。请先选规则，再揭晓位置。"
      : "实验链接无效，已载入初始模型。",
  );
