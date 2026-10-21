import { useEffect, useState } from 'react';
import { saveBlob } from '../api';
import { ErrorAlert, Loading } from './ui';

/**
 * Shows a PDF inside the app before downloading it.
 * `load` resolves to { blob, fileName }; the same blob is what "Download" saves.
 */
export function PdfPreview({ title, load, onClose }) {
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    let live = true;
    load()
      .then((f) => {
        if (!live) return;
        objectUrl = URL.createObjectURL(f.blob);
        setFile(f);
        setUrl(objectUrl);
      })
      .catch((err) => live && setError(err));
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal pdf-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {file && <div className="muted small mono">{file.fileName}</div>}
          </div>
          <div className="actions">
            <button className="btn" disabled={!url} onClick={() => window.open(url, '_blank', 'noopener')}>Open in new tab</button>
            <button className="btn btn-primary" disabled={!file} onClick={() => saveBlob(file.blob, file.fileName)}>Download</button>
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>
        <div className="pdf-frame">
          {error ? (
            <div style={{ padding: 20 }}><ErrorAlert error={error} /></div>
          ) : url ? (
            <iframe title={title} src={`${url}#toolbar=0&view=FitH`} />
          ) : (
            <Loading label="Rendering PDF…" />
          )}
        </div>
      </div>
    </div>
  );
}

/** Loads a stored invoice PDF through its signed URL as a blob. */
export async function loadSignedPdf(fetchSigned) {
  const { pdfUrl, fileName } = await fetchSigned();
  const res = await fetch(pdfUrl.url);
  if (!res.ok) throw new Error(`Could not load the PDF (${res.status})`);
  return { blob: await res.blob(), fileName };
}
