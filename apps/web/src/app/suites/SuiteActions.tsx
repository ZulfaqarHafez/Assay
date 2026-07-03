"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { assayApi } from "@/lib/api";
import { downloadJson, errorMessage } from "@/lib/derive";

type PackFormat = "json" | "yaml" | "yml";

export function SuiteImportControl({ count }: { count: number }) {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function handleImport(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    setBusy(true);
    try {
      const content = await file.text();
      const format: PackFormat = file.name.endsWith(".yml")
        ? "yml"
        : file.name.endsWith(".yaml")
          ? "yaml"
          : "json";
      const pack = await assayApi.importExamPackFile(content, format);
      setMessage(`Imported ${pack.name}`);
      router.refresh();
    } catch (exc) {
      setMessage(errorMessage(exc));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="ws-toolbar">
      <button
        type="button"
        className="ws-icon-button"
        onClick={() => fileInputRef.current?.click()}
        aria-label="Import suite"
        title="Import suite"
        disabled={busy}
      >
        <Upload size={15} />
      </button>
      <span className="ws-count">{message ?? `${count} suite${count === 1 ? "" : "s"}`}</span>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.yaml,.yml,application/json,text/yaml,text/x-yaml"
        hidden
        onChange={(event) => void handleImport(event.target.files?.[0])}
      />
    </div>
  );
}

export function SuiteExportButton({ packId }: { packId: string }) {
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function exportPack() {
    setMessage(null);
    setBusy(true);
    try {
      const payload = await assayApi.examPackExport(packId);
      downloadJson(`${packId}-assay-exam-pack.json`, payload);
    } catch (exc) {
      setMessage(errorMessage(exc));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="suite-export-action">
      <button
        type="button"
        className="ws-row-link as-button"
        disabled={busy}
        onClick={() => void exportPack()}
      >
        <Download size={13} /> {busy ? "Exporting" : "Export JSON"}
      </button>
      {message ? <span className="ws-surface-message" role="alert">{message}</span> : null}
    </div>
  );
}
