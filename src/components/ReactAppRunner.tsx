import { useMemo } from "react";
import { SandpackPreview, SandpackProvider } from "@codesandbox/sandpack-react";
import type { ProjectFiles } from "@/lib/react-project";
import { buildSdkFile } from "@/lib/findmit-sdk";

const dependencies = {
  react: "19.2.0",
  "react-dom": "19.2.0",
  "lucide-react": "0.575.0",
  "@tanstack/react-router": "1.170.41",
};

export default function ReactAppRunner({ files, apiKey = "", bare = false }: { files: ProjectFiles; apiKey?: string; bare?: boolean }) {
  const sandpackFiles = useMemo(() => {
    const base = typeof window === "undefined" ? "" : `${window.location.origin}/api/public/v1`;
    const out = Object.fromEntries(Object.entries(files).map(([path, code]) => [path, { code }]));
    out["/findmit.ts"] = { code: buildSdkFile(base, apiKey) };
    return out;
  }, [files, apiKey]);
  const packageDependencies = useMemo(() => {
    try {
      const pkg = JSON.parse(files["/package.json"] ?? "{}") as { dependencies?: Record<string, string> };
      return pkg.dependencies ?? {};
    } catch {
      return {};
    }
  }, [files]);

  return (
    <div className={`h-full min-h-0 w-full overflow-hidden bg-card [&_.sp-loading]:hidden [&_.sp-preview-container]:h-full [&_.sp-wrapper]:h-full ${bare ? "" : "rounded-xl border border-border"}`}>
      <SandpackProvider
        template="react-ts"
        files={sandpackFiles}
        customSetup={{ dependencies: { ...packageDependencies, ...dependencies } }}
        style={{ height: "100%" }}
        options={{ externalResources: ["https://cdn.tailwindcss.com"], recompileMode: "delayed", recompileDelay: 500 }}
      >
        <SandpackPreview showRefreshButton={false} showOpenInCodeSandbox={false} showSandpackErrorOverlay style={{ height: "100%", minHeight: 300 }} />
      </SandpackProvider>
    </div>
  );
}
