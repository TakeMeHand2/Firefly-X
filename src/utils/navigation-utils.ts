/**
 * 导航工具函数
 * 提供统一的页面导航功能，支持 Swup 无刷新跳转
 *
 * 这里曾经还导出了 getCurrentPath / isHomePage / isPostPage / pathsEqual。
 * 它们没有任何调用方，且与别处的同名实现语义不一致（例如 pathsEqual 只去尾
 * 斜杠、区分大小写，而 url-utils 的版本会去掉首尾斜杠并转小写）。
 * 零引用的同名副本比没有更危险：后来者按名字挑一个用，行为就悄悄变了。
 * 真正在用的同义能力分别在：
 *   - isHomePage(pathname)  → utils/layout-utils.ts
 *   - isPostPage()          → utils/toc-utils.ts
 *   - pathsEqual(a, b)      → utils/url-utils.ts
 */

/**
 * 导航到指定页面
 * @param url 目标页面URL
 * @param options 导航选项
 */
export function navigateToPage(
	url: string,
	options?: {
		replace?: boolean;
		force?: boolean;
	},
): void {
	// 检查 URL 是否有效
	if (!url || typeof url !== "string") {
		console.warn("navigateToPage: Invalid URL provided");
		return;
	}

	// 如果是外部链接，直接跳转
	if (
		url.startsWith("http://") ||
		url.startsWith("https://") ||
		url.startsWith("//")
	) {
		window.open(url, "_blank");
		return;
	}

	// 如果是锚点链接，滚动到对应位置
	if (url.startsWith("#")) {
		const element = document.getElementById(url.slice(1));
		if (element) {
			element.scrollIntoView({ behavior: "smooth" });
		}
		return;
	}

	// 检查 Swup 是否可用
	if (typeof window !== "undefined" && window.swup) {
		try {
			// 使用 Swup 进行无刷新跳转
			if (options?.replace) {
				window.swup.navigate(url, { history: false });
			} else {
				window.swup.navigate(url);
			}
		} catch (error) {
			console.error("Swup navigation failed:", error);
			// 降级到普通跳转
			fallbackNavigation(url, options);
		}
	} else {
		// Swup 不可用时的降级处理
		fallbackNavigation(url, options);
	}
}

/**
 * 降级导航函数
 * 当 Swup 不可用时使用普通的页面跳转
 */
function fallbackNavigation(
	url: string,
	options?: {
		replace?: boolean;
		force?: boolean;
	},
): void {
	if (options?.replace) {
		window.location.replace(url);
	} else {
		window.location.href = url;
	}
}
