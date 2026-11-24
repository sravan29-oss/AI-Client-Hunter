import React, { useState, useRef } from 'react';
import { Modal } from './Modal';
import { ApiError, apiClient, CsvImportResult } from '../api/client';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Info,
  RefreshCw,
} from 'lucide-react';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [useTextInput, setUseTextInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadSampleTemplate = () => {
    const csvContent =
      'Business Name,Website,Country,City,Industry,Business Email,Contact Name,Phone,Source,Opportunity Score,Lead Status,Suggested Services,Detected Problems,Notes\n' +
      '"Apex Health Care","https://apexhealthcare.in","India","Bengaluru","Healthcare & Clinics","contact@apexhealthcare.in","Dr. Rajesh Kumar","+91 9876543210","Inbound",88,"New","React Native mobile application; Admin dashboard","Slow mobile portal; No automated appointment reminder","Key hospital client in Koramangala"\n' +
      '"Horizon SaaS Ltd","https://horizonsaas.co.uk","United Kingdom","London","B2B SaaS & Cloud Platforms","alex@horizonsaas.co.uk","Alex Wright","+44 20 7946 0912","CSV Import",85,"Ready_to_Contact","Admin dashboard; Backend API development","Legacy PHP backend; Outdated reporting UI","Target for Q2 microservice re-architecture"\n' +
      '"Luxe Living Decor","https://luxeliving.com","United States","New York","E-commerce & Luxury Brands","partners@luxeliving.com","Sarah Miller","+1 212 555 0198","Outreach",92,"New","E-commerce website; AI application and integration","Slow Shopify checkout; No AI product recommendations","Looking for high-speed headless Next.js transition"';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'AI_Client_Hunter_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Simple CSV parser

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setError(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setRawText(content);
      };
      reader.readAsText(selected);
    }
  };

  const handleImport = async () => {
    if (!rawText.trim()) {
      setError('Paste or upload CSV content before importing.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await apiClient.importCsv(rawText);
      setResult(res);
      if (res.importedCount > 0) {
        onImportComplete();
      }
    } catch (err: any) {
      const issue = err instanceof ApiError && Array.isArray(err.details) ? err.details[0] : null;
      setError(issue?.row && issue?.error ? `Row ${issue.row}: ${issue.error}` : err.message || 'CSV import failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setRawText('');
    setResult(null);
    setError(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import Leads from CSV" size="lg">
      <div className="space-y-4">
        {/* Info & Template Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-navy-950/80 border border-slate-800 text-xs">
          <div className="flex items-start gap-2 text-slate-300">
            <Info className="h-4 w-4 text-electric-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Smart Duplicate Protection:</span>
              <p className="text-slate-400 text-[11px] mt-0.5">
                Existing website domains, registered business emails, or identical company names in the same country are automatically skipped.
              </p>
            </div>
          </div>
          <button
            onClick={downloadSampleTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold shrink-0 transition"
          >
            <Download className="h-3.5 w-3.5 text-electric-400" />
            <span>Download CSV Template</span>
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Results Overview if imported */}
        {result && (
          <div className="p-4 rounded-xl bg-navy-950/90 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Import Summary
              </h4>
              <button
                onClick={handleReset}
                className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                Import More
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/50">
                <div className="text-lg font-black text-emerald-300">{result.importedCount}</div>
                <div className="text-[10px] text-emerald-400 font-semibold uppercase">Added</div>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/50">
                <div className="text-lg font-black text-amber-300">{result.skippedCount}</div>
                <div className="text-[10px] text-amber-400 font-semibold uppercase">Duplicates Skipped</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-lg font-black text-slate-300">{result.errorCount}</div>
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Errors</div>
              </div>
            </div>

            {/* Skipped duplicates report */}
            {result.skippedDuplicates && result.skippedDuplicates.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <span className="text-[11px] font-semibold text-amber-300">
                  Duplicates Prevented ({result.skippedDuplicates.length}):
                </span>
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                  {result.skippedDuplicates.map((dup, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-navy-900 border border-slate-800/80 text-[11px] flex items-center justify-between"
                    >
                      <span className="font-semibold text-slate-200">
                        Row #{dup.row}: {dup.businessName}
                      </span>
                      <span className="text-amber-400/90 text-[10px] line-clamp-1 max-w-[240px]">
                        {dup.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!result && (
          <>
            {/* Input Switcher */}
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setUseTextInput(false)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  !useTextInput
                    ? 'bg-electric-500 text-white shadow-glow-blue'
                    : 'bg-navy-950 text-slate-400 border border-slate-800'
                }`}
              >
                Upload File (.csv)
              </button>
              <button
                type="button"
                onClick={() => setUseTextInput(true)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  useTextInput
                    ? 'bg-electric-500 text-white shadow-glow-blue'
                    : 'bg-navy-950 text-slate-400 border border-slate-800'
                }`}
              >
                Paste CSV Text
              </button>
            </div>

            {!useTextInput ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700/80 hover:border-electric-500/80 rounded-2xl p-8 text-center bg-navy-950/40 hover:bg-navy-950/70 transition cursor-pointer"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".csv,text/csv"
                  className="hidden"
                />
                <div className="flex flex-col items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-electric-500/10 border border-electric-500/30 text-electric-400 mb-2">
                    <FileSpreadsheet className="h-6 w-6" />
                  </div>
                  <span className="text-xs font-bold text-white">
                    {file ? file.name : 'Click to select or drop CSV file here'}
                  </span>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {file
                      ? `${(file.size / 1024).toFixed(1)} KB ready for import`
                      : 'Standard comma-separated file format'}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Paste Raw CSV Content
                </label>
                <textarea
                  rows={6}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Business Name,Website,Country,Industry&#10;Acme Inc,https://acme.com,India,Technology"
                  className="w-full rounded-xl bg-navy-950 border border-slate-700/80 p-3 text-xs text-white focus:outline-none focus:border-electric-500 font-mono resize-none"
                />
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-navy-950 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            {result ? 'Done' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={loading || !rawText.trim()}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-electric-500 to-violet-600 text-white text-xs font-bold shadow-glow-blue hover:opacity-95 transition disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  <span>Import Leads</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
