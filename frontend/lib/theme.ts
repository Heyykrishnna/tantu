export type Theme = "light" | "dark";

interface ThemeRoot {
  dataset: { theme?: string };
  classList: { toggle: (token: string, force: boolean) => unknown };
  style: { colorScheme: string };
}

export function applyTheme(theme: Theme, root: ThemeRoot = document.documentElement): void {
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}
