import type { ConfigService } from '@nestjs/config';
import type { Job } from 'bull';

import { DocumentProcessingConsumer, ProcessDocumentJobData } from './document-processing.consumer';
import { DocumentProcessingService, ExtractionError } from './document-processing.service';

/** Builds a minimal single-page PDF; `text` = null gives a page with no text layer (like a scan). */
function makePdf(text: string | null): Buffer {
  const stream = text === null ? '' : `BT /F1 12 Tf 40 700 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function serviceReturning(file: Buffer): DocumentProcessingService {
  const config = { get: (_k: string, d: unknown) => d } as unknown as ConfigService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new DocumentProcessingService({} as any, config, {} as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(service as any, 'downloadFromS3').mockResolvedValue(file);
  return service;
}

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('DocumentProcessingService.extractText', () => {
  it('extracts the text layer of a PDF', async () => {
    const text = await serviceReturning(makePdf('Warranty lasts 18 months')).extractText('k', PDF, 'w.pdf');
    expect(text).toContain('Warranty lasts 18 months');
    expect(text).not.toMatch(/extraction failed/i);
  });

  it('rejects a corrupt PDF instead of storing placeholder text', async () => {
    const svc = serviceReturning(Buffer.from('%PDF-1.4 not really a pdf'));
    await expect(svc.extractText('k', PDF, 'bad.pdf')).rejects.toThrow(ExtractionError);
    await expect(svc.extractText('k', PDF, 'bad.pdf')).rejects.toThrow(/could not read pdf "bad\.pdf"/i);
  });

  it('rejects a PDF with no text layer (scanned) with an explanation', async () => {
    await expect(serviceReturning(makePdf(null)).extractText('k', PDF, 'scan.pdf')).rejects.toThrow(
      /no text found in "scan\.pdf"/i,
    );
  });

  it('rejects a corrupt Word document', async () => {
    await expect(
      serviceReturning(Buffer.from('not a zip')).extractText('k', DOCX, 'bad.docx'),
    ).rejects.toThrow(ExtractionError);
  });
});

describe('DocumentProcessingConsumer', () => {
  const data: ProcessDocumentJobData = {
    documentId: 'doc-1',
    organizationId: 'org-1',
    s3Key: 'k',
    mimeType: PDF,
    fileName: 'bad.pdf',
  };
  const job = (attemptsMade = 0) =>
    ({ data, attemptsMade, opts: { attempts: 3 }, progress: jest.fn(), discard: jest.fn() }) as unknown as Job<ProcessDocumentJobData> & {
      discard: jest.Mock;
    };

  function consumerWith(overrides: Partial<Record<keyof DocumentProcessingService, jest.Mock>>) {
    const service = {
      isDocumentProcessable: jest.fn().mockResolvedValue(true),
      extractText: jest.fn().mockResolvedValue('text'),
      chunkText: jest.fn().mockResolvedValue([]),
      generateEmbeddings: jest.fn().mockResolvedValue([]),
      storeChunks: jest.fn().mockResolvedValue(undefined),
      markDocumentFailed: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
    return { consumer: new DocumentProcessingConsumer(service as unknown as DocumentProcessingService), service };
  }

  it('fails an unreadable document on the first attempt without retrying', async () => {
    const { consumer, service } = consumerWith({
      extractText: jest.fn().mockRejectedValue(new ExtractionError('Could not read PDF "bad.pdf"')),
    });
    const j = job(0);
    await expect(consumer.handleProcessDocument(j)).rejects.toThrow(ExtractionError);
    expect(j.discard).toHaveBeenCalled();
    expect(service.markDocumentFailed).toHaveBeenCalledWith('doc-1', 'Could not read PDF "bad.pdf"');
  });

  it('leaves the document PROCESSING while a transient error is still being retried', async () => {
    const { consumer, service } = consumerWith({
      generateEmbeddings: jest.fn().mockRejectedValue(new Error('OpenAI 429')),
    });
    const j = job(0);
    await expect(consumer.handleProcessDocument(j)).rejects.toThrow('OpenAI 429');
    expect(j.discard).not.toHaveBeenCalled();
    expect(service.markDocumentFailed).not.toHaveBeenCalled();
  });

  it('skips a document that was deleted after the job was queued', async () => {
    const { consumer, service } = consumerWith({ isDocumentProcessable: jest.fn().mockResolvedValue(false) });
    await expect(consumer.handleProcessDocument(job())).resolves.toBeUndefined();
    expect(service.extractText).not.toHaveBeenCalled();
    expect(service.markDocumentFailed).not.toHaveBeenCalled();
  });
});
