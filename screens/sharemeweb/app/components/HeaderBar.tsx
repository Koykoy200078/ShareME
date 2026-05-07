"use client";

import { useApp } from "../context/AppContext";

export default function HeaderBar() {
  const { theme, toggleTheme } = useApp();
  return (
    <header>
      <h1>📁 ShareME</h1>
      <p className="subtitle">Local Network File Sharing</p>
      <button
        className="btn btn-theme"
        id="themeToggle"
        title="Toggle Dark/Light Mode"
        type="button"
        onClick={toggleTheme}
      >
        {theme === "light" ? "🌙" : "☀️"}
      </button>
    </header>
  );
}
