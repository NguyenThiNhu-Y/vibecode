import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { getHealth } from "./api";
import { IconFolder, IconGauge, IconGear, IconMoon, IconPlus, IconSparkles, IconSun } from "./components/icons";
import Compare from "./pages/Compare";
import Eval from "./pages/Eval";
import History from "./pages/History";
import NewRequest from "./pages/NewRequest";
import RunView from "./pages/RunView";
import Settings from "./pages/Settings";
import { useTheme } from "./theme";

const NAV = [
  { to: "/history", label: "Hồ sơ", icon: IconFolder },
  { to: "/eval", label: "Đánh giá", icon: IconGauge },
  { to: "/settings", label: "Cài đặt", icon: IconGear },
];

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 font-medium transition-colors ${
    isActive ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
  }`;

function BackendStatus() {
  const [provider, setProvider] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    getHealth()
      .then((h) => setProvider(h.llm_provider))
      .catch(() => setProvider(null));
  }, []);
  if (provider === undefined) return null;
  return (
    <span className="flex items-center gap-2 text-sm text-subtle" title={provider ? "Backend đang chạy" : "Không kết nối được backend"}>
      <span className={`h-2 w-2 rounded-full ${provider ? "bg-success" : "bg-danger"}`} />
      {provider ? (
        <>
          LLM: <b className="font-mono font-medium text-fg">{provider}</b>
        </>
      ) : (
        "Backend chưa chạy"
      )}
    </span>
  );
}

function ThemeToggle() {
  const [theme, toggle] = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      title={theme === "dark" ? "Giao diện sáng" : "Giao diện tối"}
      className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
    >
      {theme === "dark" ? <IconSun /> : <IconMoon />}
    </button>
  );
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm text-on-accent">
        <IconSparkles />
      </span>
      <span className="font-semibold text-fg">ScopeAI</span>
    </Link>
  );
}

export default function App() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[220px_1fr]">
      {/* Sidebar (desktop) / top bar (mobile) */}
      <aside className="sticky top-0 z-30 border-b border-line bg-surface lg:h-screen lg:border-r lg:border-b-0">
        <div className="flex items-center gap-3 px-4 py-3 lg:h-full lg:flex-col lg:items-stretch lg:gap-1 lg:py-4">
          <div className="lg:mb-4 lg:px-1">
            <Logo />
          </div>
          <Link to="/" className="hidden items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-on-accent hover:brightness-105 lg:mb-3 lg:flex">
            <IconPlus />
            Tạo hồ sơ
          </Link>
          <nav className="flex flex-1 items-center gap-1 lg:flex-none lg:flex-col lg:items-stretch" aria-label="Điều hướng chính">
            <NavLink to="/" end className={({ isActive }) => `${navClass({ isActive })} lg:hidden`} aria-label="Tạo hồ sơ">
              <IconPlus />
            </NavLink>
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={navClass}>
                <Icon className="shrink-0" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2 lg:mt-auto lg:justify-between lg:border-t lg:border-line lg:px-1 lg:pt-3">
            <span className="hidden lg:inline">
              <BackendStatus />
            </span>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <Routes>
          <Route path="/" element={<NewRequest />} />
          <Route path="/runs/:id" element={<RunView mode="run" />} />
          <Route path="/replay/:name" element={<RunView mode="replay" />} />
          <Route path="/history" element={<History />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/eval" element={<Eval />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<p className="p-10 text-center text-muted">Không tìm thấy trang.</p>} />
        </Routes>
      </div>
    </div>
  );
}
