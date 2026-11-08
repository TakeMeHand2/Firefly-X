/**
 * 环境变量解析工具
 *
 * 起因：`display-settings-utils.ts` 与 `page-toggle-utils.ts` 各抄了一份完全相同
 * 的 `parseBooleanEnv`（连常量数组都逐字一致）。两份实现的问题不是代码量，
 * 而是「以后只改一处」——比如某天需要支持 "y"/"n"，改漏的那一边会静默地
 * 把一个已开启的开关当成未设置。
 *
 * 只收「布尔」这一种：数值/枚举型环境变量尚未出现第二种用法，
 * 提前抽象反而会造出一个谁都不用的万能解析器。
 */

const TRUTHY_VALUES: readonly string[] = [
	"true",
	"1",
	"on",
	"yes",
	"enable",
	"enabled",
];

const FALSY_VALUES: readonly string[] = [
	"false",
	"0",
	"off",
	"no",
	"disable",
	"disabled",
];

/**
 * 解析布尔类型的环境变量。
 *
 * 入参取 `unknown` 是因为调用方拿到的是 `import.meta.env` 的索引结果，
 * 静态类型上是 `string | boolean | undefined`，构建脚本里还可能是 `undefined`。
 *
 * @returns 命中真值表为 `true`、假值表为 `false`；未设置或无法识别为 `undefined`
 *          （调用方据此回退到配置默认值，而不是当作 false）。
 */
export function parseBooleanEnv(raw: unknown): boolean | undefined {
	if (typeof raw !== "string") return undefined;
	const value = raw.trim().toLowerCase();
	if (TRUTHY_VALUES.includes(value)) return true;
	if (FALSY_VALUES.includes(value)) return false;
	return undefined;
}
