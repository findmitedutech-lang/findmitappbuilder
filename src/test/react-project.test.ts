import { describe, expect, it } from "vitest";
import { parseGeneratedProject, parseProjectSource, serializeProjectFiles } from "@/lib/react-project";
import { validateReactFiles } from "@/lib/validate-react-project.server";

describe("multi-file React projects", () => {
  it("round-trips every generated file without losing its contents", () => {
    const files = {
      "/App.tsx": "export default function App() { return <main>Chat</main>; }",
      "/components/Login.tsx": "export function Login() { return <button>Sign in</button>; }",
      "/index.tsx": "import App from './App';",
    };

    const source = parseProjectSource(serializeProjectFiles(files));

    expect(source).toEqual({ kind: "react", files });
  });

  it("keeps existing single-file HTML apps readable and publishable", () => {
    const html = "<!doctype html><title>Legacy app</title><button>Sign in</button>";

    expect(parseProjectSource(html)).toEqual({ kind: "html", code: html });
  });

  it("accepts fenced Gemini JSON and normalizes generated file paths", () => {
    const result = parseGeneratedProject('```json\n{"files":{"App.tsx":"export default function App() { return null; }","components/Chat.tsx":"export function Chat() { return null; }"}}\n```');

    expect(result.files["/App.tsx"]).toContain("function App");
    expect(result.files["/components/Chat.tsx"]).toContain("function Chat");
  });

  it("rejects a generated project without the required App component", () => {
    expect(() => parseGeneratedProject('{"files":{"/index.tsx":"console.log(1)"}}')).toThrow("must include /App.tsx");
  });

  it("catches mismatched JSX before generated code reaches the preview", () => {
    const issues = validateReactFiles({ "/App.tsx": "export default function App() { return <Link>Home</Link理论>; }" });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("/App.tsx:");
  });

  it("accepts syntactically valid React TypeScript files", () => {
    expect(validateReactFiles({ "/App.tsx": "export default function App() { return <main>Ready</main>; }" })).toEqual([]);
  });
});
