import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { issueDateLabel } from './project-invoice-calculator';

// Geometry measured from the reference invoice S2534 (A4, points, top-left origin).
const FRAME = { left: 24.5, top: 24.5, right: 570.8, bottom: 817.4 };
const LEFT = 36.1;
const TABLE = { left: 36.3, divider: 461.2, right: 561.3, padX: 10.1 };
const INFO_RIGHT = 503.5; // right edge of "INVOICE NO" / "Date"
const TITLE_CENTER = 296.3;
const PAGE_CENTER = 297.8;
const HEADER_FILL = '#DAE3F0';
const LINK_BLUE = '#0563C1';
const SIZE = 10;
const LINE = 11.64; // DejaVu Sans line height at 10pt
const ASCENT = 9.28; // DejaVu Sans ascender at 10pt
const SUP_SIZE = 5.8;
const SUP_RISE = 3.9;
const BODY_PAD = 9.28; // vertical padding in body rows (30.2pt for one line)
const EDGE_PAD = 6.38; // vertical padding in header and total rows (24.4pt)
const PAGE_LIMIT = 790;

const FONT_DIR = path.resolve(__dirname, '../../assets/fonts');
const FONTS = {
  regular: [path.join(FONT_DIR, 'DejaVuSans.ttf'), 'Helvetica'],
  bold: [path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'), 'Helvetica-Bold'],
};

const SYMBOLS = { USD: '$', EUR: '€', GBP: '£', INR: '₹' };
const ORDINAL = /^([^\dA-Za-z]*)(\d+)(st|nd|rd|th)([^A-Za-z]*)$/i;

/** '$3383.00' (no thousands separators, as on the reference invoice). */
const lineAmount = (amount, currency) => {
  const value = Number(amount);
  const body = Math.abs(value).toFixed(2);
  return `${value < 0 ? '-' : ''}${SYMBOLS[currency] ?? `${currency} `}${body}`;
};

function loadImage(file) {
  if (!file) return null;
  const resolved = path.resolve(process.cwd(), file);
  return fs.existsSync(resolved) ? fs.readFileSync(resolved) : null;
}

/**
 * Client invoice in the layout of invoice S2534.
 * @param {object} invoice { invoiceNumber, issueDate, dueDate, currency, project, calc, company, bank }
 */
export function renderProjectInvoicePdf(invoice) {
  const { calc, project, company, bank, currency } = invoice;
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true, info: { Title: `INVOICE ${invoice.invoiceNumber}` } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  for (const [name, [file, fallback]] of Object.entries(FONTS)) {
    doc.registerFont(name, fs.existsSync(file) ? file : fallback);
  }

  // -------------------------------------------------------------------------
  // Text helpers. `baseline` is the y of the text baseline.
  // -------------------------------------------------------------------------
  const put = (text, x, baseline, { font = 'regular', size = SIZE, color = 'black' } = {}) => {
    doc.font(font).fontSize(size).fillColor(color).text(text, x, baseline, { baseline: 'alphabetic', lineBreak: false, features: { kern: false } });
    return width(text, font, size);
  };
  // No kerning, like the reference (and so copied text has no split words).
  const width = (text, font = 'regular', size = SIZE) => doc.font(font).fontSize(size).widthOfString(text, { features: { kern: false } });

  // Words with an ordinal ("24th", "17TH") render the suffix as a superscript.
  const wordWidth = (word, font) => {
    const m = word.match(ORDINAL);
    if (!m) return width(word, font);
    return width(m[1] + m[2], font) + width(m[3], font, SUP_SIZE) + width(m[4], font);
  };
  const putWord = (word, x, baseline, font) => {
    const m = word.match(ORDINAL);
    if (!m) return put(word, x, baseline, { font });
    let dx = put(m[1] + m[2], x, baseline, { font });
    dx += put(m[3], x + dx, baseline - SUP_RISE, { font, size: SUP_SIZE });
    if (m[4]) dx += put(m[4], x + dx, baseline, { font });
    return dx;
  };

  /** Wraps rich text into lines that fit `maxWidth`. Runs of spaces are kept inside a line. */
  const wrap = (text, maxWidth, font) => {
    const tokens = text.split(/( +)/).filter((t) => t !== '');
    const lines = [];
    let line = [];
    let lineW = 0;
    for (const token of tokens) {
      const isSpace = token.trim() === '';
      const w = isSpace ? width(token, font) : wordWidth(token, font);
      if (!isSpace && line.length && lineW + w > maxWidth) {
        while (line.length && line[line.length - 1].trim() === '') line.pop();
        lines.push(line);
        line = [];
        lineW = 0;
      }
      if (isSpace && !line.length) continue;
      line.push(token);
      lineW += w;
    }
    if (line.length) lines.push(line);
    return lines;
  };
  const putLine = (tokens, x, baseline, font) => {
    let dx = 0;
    for (const t of tokens) dx += t.trim() === '' ? width(t, font) : putWord(t, x + dx, baseline, font);
    return dx;
  };
  const richWidth = (text, font) => text.split(/( +)/).reduce((w, t) => w + (t.trim() === '' ? width(t, font) : wordWidth(t, font)), 0);

  const drawFrame = () => {
    doc.lineWidth(1).strokeColor('black').rect(FRAME.left, FRAME.top, FRAME.right - FRAME.left, FRAME.bottom - FRAME.top).stroke();
  };

  // -------------------------------------------------------------------------
  // Header
  // -------------------------------------------------------------------------
  drawFrame();
  const title = `INVOICE-  ${(project.invoice_title || `DEVELOPMENT WORK ${project.name}`).toUpperCase()}`;
  put(title, TITLE_CENTER - width(title, 'bold', 14) / 2, 49.0, { font: 'bold', size: 14 });

  const logo = loadImage(company.logoPath);
  if (logo) doc.image(logo, 36.0, 67.3, { width: 48.7, height: 48.7 });

  put(company.name, LEFT, 135.4, { font: 'bold' });
  if (company.contactName) put(company.contactName, LEFT, 147.0);
  let y = 164.7;
  for (const line of company.addressLines) {
    put(line, LEFT, y);
    y += LINE - 0.04;
  }
  if (company.email) {
    const label = `Email: ${company.email}`;
    const w = put(label, LEFT, y, { color: LINK_BLUE });
    doc.link(LEFT, y - ASCENT, w, LINE, `mailto:${company.email}`);
    doc.lineWidth(0.5).strokeColor(LINK_BLUE).moveTo(LEFT, y + 0.4).lineTo(LEFT + w, y + 0.4).stroke();
    y += LINE - 0.04;
  }
  if (company.phone) {
    put(`Ph: ${company.phone}`, LEFT, y);
    y += LINE - 0.04;
  }

  const numberText = `INVOICE NO: ${invoice.invoiceNumber}`;
  const dateText = `Date: ${issueDateLabel(invoice.issueDate)}`;
  put(numberText, INFO_RIGHT - width(numberText), 135.4);
  put(dateText, INFO_RIGHT - width(dateText), 147.0);

  // "To" block: 26.7pt below the last company line, as on the reference.
  y = Math.max(y, 199.6 + LINE) + 15.06;
  put('To', LEFT, y, { font: 'bold' });
  put((project.client_contact || project.client_name || '').toUpperCase(), LEFT, y + 11.6, { font: 'bold' });

  // -------------------------------------------------------------------------
  // Particulars table
  // -------------------------------------------------------------------------
  let top = y + 11.6 + 12.4;
  const textWidth = TABLE.divider - TABLE.left - TABLE.padX * 2;
  const amountCenter = (TABLE.divider + TABLE.right) / 2;

  const drawRow = (left, right, { font = 'regular', pad = BODY_PAD, fill = null } = {}) => {
    const lines = wrap(left, textWidth, font);
    const height = lines.length * LINE + pad * 2;
    if (top + height > PAGE_LIMIT) {
      doc.addPage({ size: 'A4', margin: 0 });
      drawFrame();
      top = 40;
      drawHeader();
    }
    if (fill) doc.rect(TABLE.left, top, TABLE.right - TABLE.left, height).fill(fill);
    doc.lineWidth(0.5).strokeColor('black').rect(TABLE.left, top, TABLE.right - TABLE.left, height).stroke();
    doc.moveTo(TABLE.divider, top).lineTo(TABLE.divider, top + height).stroke();
    lines.forEach((tokens, i) => putLine(tokens, TABLE.left + TABLE.padX, top + pad + ASCENT + i * LINE, font));
    const amountBaseline = top + height / 2 - LINE / 2 + ASCENT;
    put(right, amountCenter - richWidth(right, font) / 2, amountBaseline, { font });
    top += height;
  };
  const drawHeader = () =>
    drawRow(`PARTICULARS (${calc.periodLabel})`, `TOTAL (${currency})`, { font: 'bold', pad: EDGE_PAD, fill: HEADER_FILL });

  drawHeader();
  [...calc.lines, ...calc.extraLines].forEach((line, i) => drawRow(`${i + 1}. ${line.text}`, lineAmount(line.amount, currency)));
  drawRow('TOTAL DUE', `${currency} ${Number(calc.totalAmount).toFixed(2)}`, { font: 'bold', pad: EDGE_PAD });

  // -------------------------------------------------------------------------
  // Bank details, due date, signature
  // -------------------------------------------------------------------------
  const bankRows = [
    ['Account Name', bank.accountName],
    ['Bank Name', bank.bankName],
    ['Branch', bank.branch],
    ['Account Number', bank.accountNumber],
    ['SWIFT Code', bank.swiftCode],
    ['Account Type', bank.accountType],
    ['Currency', currency],
  ].filter(([, v]) => v);
  const footerHeight = 29.5 + (bankRows.length + 1) * 11.65 + 27.3 + 38.2 + 25;
  if (top + footerHeight > FRAME.bottom - 10) {
    doc.addPage({ size: 'A4', margin: 0 });
    drawFrame();
    top = 40;
  }

  y = top + 29.5;
  put('BANK ACCOUNT DETAILS:', LEFT, y, { font: 'bold' });
  for (const [label, value] of bankRows) {
    y += 11.65;
    put(`${label}: ${value}`, LEFT, y);
  }
  if (invoice.dueDate) {
    y += 11.65;
    putLine(wrap(`Invoice Due Date: ${issueDateLabel(invoice.dueDate)}`, 500, 'bold')[0], LEFT, y, 'bold');
  }

  const signature = loadImage(company.signaturePath);
  if (signature) doc.image(signature, 36.0, y + 27.3, { width: 97.5, height: 38.2 });
  const thanks = 'Thanks for your Business';
  put(thanks, PAGE_CENTER - width(thanks, 'bold') / 2, y + 79.9, { font: 'bold' });

  doc.end();
  return done;
}
