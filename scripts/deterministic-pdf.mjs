function objectBuffer(number, body) {
  return Buffer.concat([
    Buffer.from(`${number} 0 obj\n`, 'latin1'),
    Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'),
    Buffer.from('\nendobj\n', 'latin1'),
  ]);
}

export function buildSinglePageJpegPdf(jpeg, width, height) {
  if (!Buffer.isBuffer(jpeg) || jpeg.length === 0) {
    throw new TypeError('A non-empty JPEG buffer is required');
  }
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new TypeError('Positive integer PDF dimensions are required');
  }

  const content = Buffer.from(`q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`, 'latin1');
  const objects = [
    objectBuffer(1, '<< /Type /Catalog /Pages 2 0 R >>'),
    objectBuffer(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    objectBuffer(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`),
    objectBuffer(4, Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'),
      content,
      Buffer.from('endstream', 'latin1'),
    ])),
    objectBuffer(5, Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, 'latin1'),
      jpeg,
      Buffer.from('\nendstream', 'latin1'),
    ])),
    objectBuffer(6, '<< /Producer (KRISEVA ATTEST deterministic local capture) /Title (KRISEVA ATTEST Wireframes) >>'),
  ];

  const header = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1');
  const offsets = [];
  let cursor = header.length;
  for (const object of objects) {
    offsets.push(cursor);
    cursor += object.length;
  }

  const xrefOffset = cursor;
  const xref = [
    'xref',
    '0 7',
    '0000000000 65535 f ',
    ...offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
    'trailer',
    '<< /Size 7 /Root 1 0 R /Info 6 0 R >>',
    'startxref',
    String(xrefOffset),
    '%%EOF',
    '',
  ].join('\n');

  return Buffer.concat([header, ...objects, Buffer.from(xref, 'latin1')]);
}
