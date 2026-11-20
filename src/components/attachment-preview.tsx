"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Button } from "./ui/button";
export function AttachmentPreview({
  id,
  filename,
  contentType,
}: {
  id: string;
  filename: string;
  contentType: string;
}) {
  const url = `/api/attachments/${encodeURIComponent(id)}/preview`;
  const [error, setError] = useState(""),
    [text, setText] = useState<string | null>(null),
    [truncated, setTruncated] = useState(false);
  useEffect(() => {
    if (contentType !== "text/plain") return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            "Could not load the preview. Download the file or try again.",
          );
        setTruncated(r.headers.get("X-Preview-Truncated") === "true");
        setText(await r.text());
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [url, contentType]);
  return (
    <section
      aria-label={`Preview of ${filename}`}
      className="mt-4 min-w-0 rounded-lg border border-border p-4"
    >
      {error ? (
        <p role="alert" className="subtle">
          {error}
        </p>
      ) : contentType.startsWith("image/") ? (
        <img
          src={url}
          alt={filename}
          className="mx-auto max-h-96 max-w-full rounded-md object-contain"
          onError={() =>
            setError("Could not load the image. Download it or try again.")
          }
        />
      ) : contentType === "application/pdf" ? (
        <PdfPreview url={url} filename={filename} />
      ) : contentType === "text/plain" ? (
        text === null ? (
          <p role="status" className="subtle">
            Loading text…
          </p>
        ) : (
          <>
            <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
              {text}
            </pre>
            {truncated && (
              <p className="subtle mt-4">
                Preview limited to the first 200 KB. Download the file for the
                complete text.
              </p>
            )}
          </>
        )
      ) : (
        <p className="subtle">Download this file to open it.</p>
      )}
      <a
        href={`/api/attachments/${encodeURIComponent(id)}`}
        className="mt-4 inline-block text-sm text-primary underline"
      >
        Download {filename}
      </a>
    </section>
  );
}
function PdfPreview({ url, filename }: { url: string; filename: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [width, setWidth] = useState(0),
    [error, setError] = useState("");
  const [rendering, setRendering] = useState(true);
  const container = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.floor(entries[0].contentRect.width)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    let task: { destroy: () => Promise<void> } | undefined;
    import("pdfjs-dist")
      .then((pdf) => {
        if (!active) return;
        pdf.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const load = pdf.getDocument({
          url,
          withCredentials: true,
          enableXfa: false,
          cMapUrl: "/pdf-assets/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdf-assets/standard_fonts/",
          wasmUrl: "/pdf-assets/wasm/",
          iccUrl: "/pdf-assets/iccs/",
        });
        task = load;
        return load.promise.then((value) => {
          if (active) setDoc(value);
        });
      })
      .catch(() => {
        if (active)
          setError(
            "Could not open this PDF. It may require a password or be damaged. Download it to open it in another reader.",
          );
      });
    return () => {
      active = false;
      void task?.destroy().catch(() => {});
    };
  }, [url]);
  useEffect(() => {
    if (!doc || !width || !canvas.current) return;
    let active = true;
    let render: RenderTask | undefined;
    setRendering(true);
    doc
      .getPage(page)
      .then((pdfPage) => {
        if (!active || !canvas.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({
          scale:
            (width / base.width) * Math.min(window.devicePixelRatio || 1, 2),
        });
        canvas.current.width = Math.floor(viewport.width);
        canvas.current.height = Math.floor(viewport.height);
        render = pdfPage.render({ canvas: canvas.current, viewport });
        return render.promise;
      })
      .then(() => {
        if (active) setRendering(false);
      })
      .catch((e) => {
        if (active && e.name !== "RenderingCancelledException")
          setError("Could not render this page. Download the PDF to open it.");
      });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [doc, page, width]);
  return (
    <div ref={container} className="min-w-0">
      {error ? (
        <p role="alert" className="subtle">
          {error}
        </p>
      ) : (
        <>
          {rendering && (
            <p role="status" className="subtle mb-4">
              Loading PDF page…
            </p>
          )}
          <canvas
            ref={canvas}
            role="img"
            aria-label={`${filename}, page ${page}`}
            className="h-auto w-full rounded-md"
          />
          {doc && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Button
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous page
              </Button>
              <span className="subtle">
                Page {page} of {doc.numPages}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={page >= doc.numPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next page
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
