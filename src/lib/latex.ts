import DOMPurify from "dompurify";

export function renderLatexPreview(input: string): string {
  const html: string[] = [];
  const listStack: Array<"itemize" | "enumerate"> = [];
  const orderedStack: number[] = [];
  let inVerbatim = false;
  let verbatimLines: string[] = [];
  let inQuote = false;

  function closeVerbatim() {
    if (!verbatimLines.length) {
      return;
    }
    html.push(`<pre><code>${escapeHtml(verbatimLines.join("\n"))}</code></pre>`);
    verbatimLines = [];
  }

  function closeListsTo(depth: number) {
    while (listStack.length > depth) {
      const kind = listStack.pop();
      if (kind === "enumerate") {
        orderedStack.pop();
      }
      html.push(kind === "enumerate" ? "</ol>" : "</ul>");
    }
  }

  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (trimmed === "\\begin{verbatim}") {
      closeListsTo(0);
      inVerbatim = true;
      continue;
    }
    if (trimmed === "\\end{verbatim}") {
      inVerbatim = false;
      closeVerbatim();
      continue;
    }
    if (inVerbatim) {
      verbatimLines.push(line);
      continue;
    }

    if (isDocumentMeta(trimmed)) {
      continue;
    }

    if (trimmed === "\\begin{quote}") {
      closeListsTo(0);
      inQuote = true;
      html.push("<blockquote>");
      continue;
    }
    if (trimmed === "\\end{quote}") {
      inQuote = false;
      html.push("</blockquote>");
      continue;
    }

    if (trimmed === "\\begin{itemize}" || trimmed === "\\begin{enumerate}") {
      const kind = trimmed === "\\begin{enumerate}" ? "enumerate" : "itemize";
      listStack.push(kind);
      if (kind === "enumerate") {
        orderedStack.push(1);
      }
      html.push(kind === "enumerate" ? "<ol>" : "<ul>");
      continue;
    }
    if (trimmed === "\\end{itemize}" || trimmed === "\\end{enumerate}") {
      closeListsTo(Math.max(0, listStack.length - 1));
      continue;
    }

    if (!trimmed) {
      closeListsTo(0);
      if (!inQuote) {
        html.push("<p></p>");
      }
      continue;
    }

    const command = latexBracedCommand(trimmed);
    if (command && ["section", "subsection", "subsubsection"].includes(command.name)) {
      closeListsTo(0);
      const level = command.name === "section" ? 1 : command.name === "subsection" ? 2 : 3;
      html.push(`<h${level}>${inlineLatexToHtml(command.content)}</h${level}>`);
      continue;
    }

    if (trimmed.startsWith("\\item")) {
      const content = trimmed.slice("\\item".length).trim();
      if (!listStack.length) {
        html.push(`<ul><li>${inlineLatexToHtml(content)}</li></ul>`);
      } else {
        html.push(`<li>${inlineLatexToHtml(content)}</li>`);
      }
      continue;
    }

    closeListsTo(0);
    if (isDisplayMath(trimmed)) {
      html.push(`<div class="latex-math">${inlineLatexToText(stripMathDelimiters(trimmed))}</div>`);
    } else if (inQuote) {
      html.push(`<p>${inlineLatexToHtml(trimmed)}</p>`);
    } else {
      html.push(`<p>${inlineLatexToHtml(trimmed)}</p>`);
    }
  }

  closeListsTo(0);
  closeVerbatim();
  if (inQuote) {
    html.push("</blockquote>");
  }

  return DOMPurify.sanitize(html.join("\n"));
}

function isDocumentMeta(line: string): boolean {
  return (
    line.startsWith("\\documentclass") ||
    line.startsWith("\\usepackage") ||
    line.startsWith("\\title") ||
    line.startsWith("\\author") ||
    line.startsWith("\\date") ||
    line === "\\begin{document}" ||
    line === "\\end{document}" ||
    line === "\\maketitle"
  );
}

function latexBracedCommand(line: string): { name: string; content: string } | null {
  const match = /^\\([a-zA-Z]+)\s*\{([\s\S]*)\}$/.exec(line);
  if (!match) {
    return null;
  }
  return { name: match[1], content: match[2] };
}

function inlineLatexToHtml(input: string): string {
  let text = escapeHtml(input.trim());
  text = replaceLatexCommand(text, "textbf", (content) => `<strong>${content}</strong>`);
  text = replaceLatexCommand(text, "emph", (content) => `<em>${content}</em>`);
  text = replaceLatexCommand(text, "textit", (content) => `<em>${content}</em>`);
  text = replaceLatexCommand(text, "underline", (content) => `<u>${content}</u>`);
  text = replaceLatexCommand(text, "texttt", (content) => `<code>${content}</code>`);
  text = replaceLatexFrac(text);
  text = replaceInlineMath(text);
  return restoreEscapedLatex(text).replace(/\\\\/g, "<br />");
}

function inlineLatexToText(input: string): string {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = inlineLatexToHtml(input);
  return wrapper.textContent ?? "";
}

function replaceLatexCommand(input: string, command: string, render: (content: string) => string): string {
  const pattern = `\\${command}{`;
  let output = "";
  let rest = input;

  while (true) {
    const start = rest.indexOf(pattern);
    if (start < 0) {
      return output + rest;
    }
    output += rest.slice(0, start);
    const contentStart = start + pattern.length;
    const contentEnd = findMatchingBrace(rest, contentStart);
    if (contentEnd < 0) {
      return output + rest.slice(start);
    }
    output += render(rest.slice(contentStart, contentEnd));
    rest = rest.slice(contentEnd + 1);
  }
}

function replaceLatexFrac(input: string): string {
  let output = "";
  let rest = input;

  while (true) {
    const start = rest.indexOf("\\frac{");
    if (start < 0) {
      return output + rest;
    }
    output += rest.slice(0, start);
    const numeratorStart = start + "\\frac{".length;
    const numeratorEnd = findMatchingBrace(rest, numeratorStart);
    if (numeratorEnd < 0 || rest[numeratorEnd + 1] !== "{") {
      return output + rest.slice(start);
    }
    const denominatorStart = numeratorEnd + 2;
    const denominatorEnd = findMatchingBrace(rest, denominatorStart);
    if (denominatorEnd < 0) {
      return output + rest.slice(start);
    }
    output += `<span class="latex-frac"><span>${rest.slice(numeratorStart, numeratorEnd)}</span><span>${rest.slice(denominatorStart, denominatorEnd)}</span></span>`;
    rest = rest.slice(denominatorEnd + 1);
  }
}

function replaceInlineMath(input: string): string {
  return input
    .replace(/\\\((.*?)\\\)/g, (_, content: string) => `<span class="latex-inline-math">${restoreEscapedLatex(content)}</span>`)
    .replace(/\$(.+?)\$/g, (_, content: string) => `<span class="latex-inline-math">${restoreEscapedLatex(content)}</span>`);
}

function restoreEscapedLatex(input: string): string {
  return input
    .replace(/\\%/g, "%")
    .replace(/\\&/g, "&")
    .replace(/\\#/g, "#")
    .replace(/\\_/g, "_")
    .replace(/\\\{/g, "{")
    .replace(/\\\}/g, "}")
    .replace(/~/g, " ");
}

function isDisplayMath(line: string): boolean {
  return (line.startsWith("\\[") && line.endsWith("\\]")) || (line.startsWith("$$") && line.endsWith("$$"));
}

function stripMathDelimiters(line: string): string {
  if (line.startsWith("\\[") && line.endsWith("\\]")) {
    return line.slice(2, -2).trim();
  }
  if (line.startsWith("$$") && line.endsWith("$$")) {
    return line.slice(2, -2).trim();
  }
  return line;
}

function findMatchingBrace(input: string, contentStart: number): number {
  let depth = 1;
  for (let index = contentStart; index < input.length; index += 1) {
    const character = input[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
