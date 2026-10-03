import { useEffect, useId, useState } from "react";
import { useCurrentTheme } from "../theme";

const THEMES = {
  light: { background: "#ffffff", primaryColor: "#fff4ed", primaryBorderColor: "#e8590c", primaryTextColor: "#15181d", lineColor: "#6b7280" },
  dark: { background: "#161a20", primaryColor: "#1d222a", primaryBorderColor: "#ff7a2f", primaryTextColor: "#e7eaee", lineColor: "#8a93a0" },
};

/** Renders a Mermaid flowchart; mermaid is code-split and loaded only when needed. */
function download(name: string, href: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
}

function downloadSvg(svg: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  download("kien_truc.svg", url);
  URL.revokeObjectURL(url);
}

function downloadPng(svg: string) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  const box = doc.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [0, 0, 1200, 600];
  const scale = 2;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = box[2] * scale;
    canvas.height = box[3] * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--surface") || "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    download("kien_truc.png", canvas.toDataURL("image/png"));
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function MermaidDiagram({ code }: { code: string }) {
  const theme = useCurrentTheme();
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, "")}-${theme}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          fontFamily: '"Be Vietnam Pro", ui-sans-serif, system-ui, sans-serif',
          themeVariables: { darkMode: theme === "dark", fontSize: "13px", ...THEMES[theme] },
          flowchart: { curve: "basis", padding: 10, htmlLabels: false },
        });
        const result = await mermaid.render(id, code);
        if (!cancelled) setSvg(result.svg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id, theme]);

  if (failed) {
    return (
      <pre className="overflow-x-auto rounded-md border border-line bg-surface-2 p-3 font-mono text-sm text-muted">
        {code}
      </pre>
    );
  }
  if (!svg) return <div className="shimmer h-32 rounded-md" aria-label="Đang vẽ sơ đồ" />;
  return (
    <div className="relative">
      <div
        className="overflow-x-auto rounded-md border border-line bg-surface p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
        role="img"
        aria-label="Sơ đồ kiến trúc"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="mt-1.5 flex justify-end gap-1 text-sm">
        <button type="button" onClick={() => downloadSvg(svg)} className="rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-fg">
          Tải SVG
        </button>
        <button type="button" onClick={() => downloadPng(svg)} className="rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-fg">
          Tải PNG
        </button>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(code).catch(() => undefined)}
          className="rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-fg"
        >
          Copy Mermaid
        </button>
      </div>
    </div>
  );
}
