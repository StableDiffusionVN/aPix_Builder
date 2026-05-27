import { Download } from "lucide-react";

export function OutputGallery({ outputs = [], onDownload }) {
  return (
    <section className="panel gallery">
      <h3>Output</h3>
      <div className="thumbRow">
        {outputs.map(output => (
          <div className="thumbItem" key={`${output.nodeId}-${output.filename}`}>
            <a href={output.url} target="_blank" rel="noreferrer">
              <img src={output.url} alt={output.filename} />
            </a>
            <button className="thumbDownload" onClick={() => onDownload(output)} title="Tải ảnh xuống">
              <Download size={14} />
            </button>
          </div>
        ))}
        {!outputs.length ? <span>Chưa có output image.</span> : null}
      </div>
    </section>
  );
}
