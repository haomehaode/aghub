import { useEffect, useState } from "react";
import type { Theme, ThemeProviderProps } from "../contexts/theme";
import { ThemeContext } from "../contexts/theme";

function getSystemTheme(): "light" | "dark" {
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function applyTheme(theme: Theme) {
	const resolved = theme === "system" ? getSystemTheme() : theme;
	document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function ThemeProvider({ children }: ThemeProviderProps) {
	const [themeState, setThemeState] = useState<Theme>(() => {
		const stored = localStorage.getItem("theme") as Theme | null;
		return stored ?? "system";
	});

	const setTheme = (newTheme: Theme) => {
		setThemeState(newTheme);
		localStorage.setItem("theme", newTheme);
		applyTheme(newTheme);
	};

	useEffect(() => {
		applyTheme(themeState);

		if (themeState === "system") {
			const mq = window.matchMedia("(prefers-color-scheme: dark)");
			const handler = () => applyTheme("system");
			mq.addEventListener("change", handler);
			return () => mq.removeEventListener("change", handler);
		}
	}, [themeState]);

	return (
		<ThemeContext value={{ theme: themeState, setTheme }}>
			{children}
		</ThemeContext>
	);
}
