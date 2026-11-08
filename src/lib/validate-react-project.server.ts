import { parse, type ParserPlugin } from "@babel/parser";
import type { ProjectFiles } from "@/lib/react-project";

export function validateReactFiles(files: ProjectFiles): string[] {
  const issues: string[] = [];

  for (const [path, contents] of Object.entries(files)) {
    if (!/\.[jt]sx?$/.test(path)) continue;
    const isTypeScript = path.endsWith(".ts") || path.endsWith(".tsx");
    const supportsJsx = path.endsWith(".tsx") || path.endsWith(".jsx") || path.endsWith(".js");
    const plugins: ParserPlugin[] = [
      ...(isTypeScript ? (["typescript"] as const) : []),
      ...(supportsJsx ? (["jsx"] as const) : []),
    ];

    try {
      parse(contents, { sourceType: "module", plugins, errorRecovery: false });
    } catch (error) {
      issues.push(`${path}: ${error instanceof Error ? error.message : "Invalid JavaScript or TypeScript syntax"}`);
    }
  }

  return issues;
}
