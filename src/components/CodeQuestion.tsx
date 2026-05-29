import { useEffect, useMemo, useRef } from "react";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("json", json);

export function CodeQuestion({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  // Sanitize incoming HTML before injecting it into the DOM. Defends against
  // stored XSS if question content ever becomes user- or CMS-sourced.
  const safeHtml = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ["pre", "code", "br", "span", "strong", "em", "p"],
        ALLOWED_ATTR: ["class"],
      }),
    [html],
  );

  useEffect(() => {
    if (!ref.current) return;
    ref.current.querySelectorAll("pre code").forEach((el) => {
      hljs.highlightElement(el as HTMLElement);
    });
  }, [safeHtml]);

  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}
