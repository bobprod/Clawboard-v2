import React, { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

const MARKDOWN_STYLES = `
  .md-body { font-size: 0.9rem; line-height: 1.6; }
  .md-body p { margin: 4px 0; }
  .md-body ul, .md-body ol { margin: 6px 0; padding-left: 20px; }
  .md-body li { margin: 2px 0; }
  .md-body h1, .md-body h2, .md-body h3 { margin: 10px 0 4px; font-weight: 700; }
  .md-body h1 { font-size: 1.1em; }
  .md-body h2 { font-size: 1em; }
  .md-body h3 { font-size: 0.95em; color: var(--brand-accent); }
  .md-body blockquote { border-left: 3px solid var(--brand-accent); margin: 6px 0; padding: 2px 12px; color: var(--text-secondary); font-style: italic; }
  .md-body table { border-collapse: collapse; margin: 8px 0; width: 100%; font-size: 0.85em; }
  .md-body th { background: rgba(139,92,246,0.15); padding: 6px 10px; border: 1px solid var(--border-subtle); font-weight: 600; }
  .md-body td { padding: 5px 10px; border: 1px solid var(--border-subtle); }
  .md-body tr:nth-child(even) { background: rgba(255,255,255,0.03); }
  .md-body a { color: var(--brand-accent); text-decoration: underline; }
  .md-body hr { border: none; border-top: 1px solid var(--border-subtle); margin: 10px 0; }
  .md-body strong { font-weight: 700; }
  .md-body em { font-style: italic; opacity: 0.9; }
  .md-body code.inline-code { background: rgba(139,92,246,0.15); padding: 1px 6px; border-radius: 4px; font-family: monospace; font-size: 0.85em; color: var(--brand-accent); }
  .md-body pre { background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 12px; margin: 8px 0; overflow-x: auto; }
`;

interface MarkdownRendererProps {
  content: string;
  onTaskClick?: (id: string) => void;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  onTaskClick,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  // Replace tsk_XXX with markdown links
  const withLinks = content.replace(/\b(tsk_\w+)\b/g, "[$1](/tasks/$1)");

  useEffect(() => {
    if (!ref.current || !onTaskClick) return;
    const links = ref.current.querySelectorAll<HTMLAnchorElement>('a[href^="/tasks/"]');
    links.forEach((a) => {
      a.style.cssText = "color:var(--brand-accent);font-weight:600;text-decoration:none;border-bottom:1px dashed currentColor;cursor:pointer;";
      a.onclick = (e) => {
        e.preventDefault();
        const id = a.getAttribute("href")?.split("/tasks/")[1];
        if (id) onTaskClick(id);
      };
    });
  }, [content, onTaskClick]);

  return (
    <>
      <style>{MARKDOWN_STYLES}</style>
      <div ref={ref} className="md-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          components={{
            code({ node, inline, className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || "");
              return !inline && match ? (
                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={match[1]}
                  PreTag="div"
                  {...props}
                >
                  {String(children).replace(/\n$/, "")}
                </SyntaxHighlighter>
              ) : (
                <code className="inline-code" {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {withLinks}
        </ReactMarkdown>
      </div>
    </>
  );
};

export const renderMarkdown = (text: string, onTaskClick?: (id: string) => void) => (
  <MarkdownRenderer content={text} onTaskClick={onTaskClick} />
);
