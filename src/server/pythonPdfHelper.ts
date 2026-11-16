import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface PythonPage {
  pageNumber: number;
  text: string;
}

let pythonChecked = false;
let pythonSupported: boolean | null = null;

export async function checkPythonSupport(): Promise<boolean> {
  if (pythonChecked && pythonSupported !== null) return pythonSupported;

  return new Promise((resolve) => {
    try {
      const proc = spawn('python', ['-c', 'import fitz; print("OK")']);
      let output = '';
      proc.stdout.on('data', (d) => (output += d.toString()));
      proc.on('close', (code) => {
        pythonChecked = true;
        pythonSupported = code === 0 && output.includes('OK');
        resolve(pythonSupported);
      });
      proc.on('error', () => {
        pythonChecked = true;
        pythonSupported = false;
        resolve(false);
      });
    } catch {
      pythonChecked = true;
      pythonSupported = false;
      resolve(false);
    }
  });
}

export function childProcessExists(): boolean {
  return typeof spawn === 'function';
}

/**
 * Runs PyMuPDF (fitz) or pdfplumber if Python is installed and available.
 */
export async function runPythonScriptIfAvailable(
  pdfBuffer: Buffer
): Promise<PythonPage[] | null> {
  const isAvailable = await checkPythonSupport();
  if (!isAvailable) return null;

  const tempFilePath = path.join(
    os.tmpdir(),
    `gapfinder_ingest_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`
  );

  const pythonScript = `
import sys, json
try:
    import fitz
    doc = fitz.open(sys.argv[1])
    pages = []
    for idx, page in enumerate(doc):
        text = page.get_text()
        pages.append({"pageNumber": idx + 1, "text": text})
    print(json.dumps(pages))
except Exception as e:
    sys.exit(1)
`;

  try {
    fs.writeFileSync(tempFilePath, pdfBuffer);

    return await new Promise<PythonPage[] | null>((resolve) => {
      const proc = spawn('python', ['-c', pythonScript, tempFilePath]);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => (stdout += data.toString()));
      proc.stderr.on('data', (data) => (stderr += data.toString()));

      proc.on('close', (code) => {
        try {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        } catch {}

        if (code === 0 && stdout.trim()) {
          try {
            const pages = JSON.parse(stdout.trim()) as PythonPage[];
            resolve(pages);
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });

      proc.on('error', () => {
        try {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        } catch {}
        resolve(null);
      });
    });
  } catch {
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch {}
    return null;
  }
}

