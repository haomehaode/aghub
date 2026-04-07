import { use } from "react";
import type { ThemeContextValue } from "../contexts/theme";
import { ThemeContext } from "../contexts/theme";

export function useTheme(): ThemeContextValue {
	const context = use(ThemeContext);
	if (!context) throw new Error("useTheme must be used within ThemeProvider");
	return context;
}
