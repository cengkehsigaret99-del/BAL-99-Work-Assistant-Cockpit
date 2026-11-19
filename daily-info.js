/* BAL PPIC Info Harian: presentation only. No business calculations or network access. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PpicDailyInfo = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WIDTH = 1080;
  const MARGIN = 56;
  const INNER = WIDTH - MARGIN * 2;
  const MAX_HEIGHT = 12000;
  const MAX_ROWS = 500;
  const MAX_CHARACTERS = 100000;
  const FONT = 'Arial, "Liberation Sans", "DejaVu Sans", Helvetica, sans-serif';
  const COLOR = {
    paper: '#ffffff', ink: '#16334b', teal: '#087b82', muted: '#536b7a',
    rule: '#d7e2e8', head: '#eef5f7', total: '#edf7f5', status: '#77501c'
  };
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function text(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback || '';
    return String(value).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const parsed = new Date(value + 'T12:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  function dateText(value) {
    if (!validDate(value)) return 'Tanggal belum tersedia';
    const parts = value.split('-');
    return Number(parts[2]) + ' ' + MONTHS[Number(parts[1]) - 1] + ' ' + parts[0];
  }

  function normalize(model) {
    if (!model || typeof model !== 'object' || !Array.isArray(model.sections)) {
      throw new TypeError('Model Info Harian belum tersedia.');
    }
    if (!validDate(model.asOf)) throw new TypeError('Tanggal ringkasan Info Harian harus berupa YYYY-MM-DD yang valid.');
    if (model.sections.length > 5) throw new RangeError('Info Harian mendukung paling banyak lima bagian.');
    let characters = 0;
    let rowCount = 0;
    const take = function (value, fallback) {
      const result = text(value, fallback);
      characters += result.length;
      if (characters > MAX_CHARACTERS) throw new RangeError('Isi Info Harian terlalu panjang untuk satu gambar. Tidak ada baris yang dipotong.');
      return result;
    };
    const sections = model.sections.map(function (source, index) {
      if (!source || typeof source !== 'object') throw new TypeError('Bagian Info Harian tidak valid.');
      const sourceRows = Array.isArray(source.rows) ? source.rows : [];
      rowCount += sourceRows.length;
      if (rowCount > MAX_ROWS) throw new RangeError('Terlalu banyak baris untuk satu gambar Info Harian. Tidak ada baris yang dipotong.');
      const columns = Array.isArray(source.columns) && source.columns.length ? source.columns : ['Merek / jenis', 'Stok / hasil'];
      if (columns.length < 2 || columns.length > 3) throw new RangeError('Tabel Info Harian memerlukan dua atau tiga kolom.');
      return {
        id: take(source.id, 'bagian-' + (index + 1)),
        title: take(source.title, 'Bagian ' + (index + 1)),
        dateLabel: take(source.dateLabel || source.sourceDate, 'Tanggal sumber belum tersedia'),
        columns: columns.map(function (label) { return take(label); }),
        rows: sourceRows.map(function (row) {
          if (!row || typeof row !== 'object') throw new TypeError('Baris Info Harian tidak valid.');
          return { label: take(row.label, '—'), value: take(row.value, '—'), detail: take(row.detail) };
        }),
        total: source.total ? { label: take(source.total.label, 'Total'), value: take(source.total.value, '—') } : null,
        notes: (Array.isArray(source.notes) ? source.notes : []).map(function (note) { return take(note); }).filter(Boolean),
        emptyText: take(source.emptyText, 'Belum ada data yang tersedia.')
      };
    });
    return {
      asOf: model.asOf,
      company: take(model.company, 'PR. Banyu Anyar Lestari'),
      title: take(model.title, 'Info Harian'),
      status: take(model.status, 'WORKING / OPEN RECON'),
      sections: sections
    };
  }

  function font(ctx, size, weight) {
    ctx.font = (weight || 400) + ' ' + size + 'px ' + FONT;
  }

  function graphemes(word) {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      return Array.from(new Intl.Segmenter('id', { granularity: 'grapheme' }).segment(word), function (part) { return part.segment; });
    }
    return Array.from(word);
  }

  function wrap(ctx, value, width, size, weight) {
    font(ctx, size, weight);
    const lines = [];
    text(value).split('\n').forEach(function (paragraph) {
      let line = '';
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); return; }
      words.forEach(function (word) {
        const candidate = line ? line + ' ' + word : word;
        if (ctx.measureText(candidate).width <= width) { line = candidate; return; }
        if (line) { lines.push(line); line = ''; }
        if (ctx.measureText(word).width <= width) { line = word; return; }
        graphemes(word).forEach(function (part) {
          if (ctx.measureText(part).width > width) throw new RangeError('Teks Info Harian tidak dapat dimuat pada lebar gambar.');
          if (line && ctx.measureText(line + part).width > width) { lines.push(line); line = ''; }
          line += part;
        });
      });
      if (line) lines.push(line);
    });
    return lines.length ? lines : [''];
  }

  function layout(ctx, model) {
    const commands = [];
    let y = 48;
    function room() {
      if (y > MAX_HEIGHT - 100) throw new RangeError('Info Harian terlalu tinggi untuk satu JPEG. Kurangi isi catatan atau pisahkan ringkasan; tidak ada baris yang dipotong.');
    }
    function line(x1, x2, at, color, thickness) {
      commands.push({ type: 'line', x1: x1, x2: x2, y: at, color: color || COLOR.rule, thickness: thickness || 1 });
    }
    function rectangle(x, at, width, height, color) {
      commands.push({ type: 'rect', x: x, y: at, width: width, height: height, color: color });
    }
    function words(lines, x, at, size, step, weight, color, align) {
      lines.forEach(function (value, index) {
        commands.push({ type: 'text', text: value, x: x, y: at + index * step,
          size: size, weight: weight || 400, color: color || COLOR.ink, align: align || 'left' });
      });
    }
    function paragraph(value, size, step, weight, color, space) {
      const lines = wrap(ctx, value, INNER, size, weight);
      words(lines, MARGIN, y, size, step, weight, color);
      y += lines.length * step + (space || 0);
      room();
    }
    paragraph(model.company, 24, 32, 600, COLOR.ink, 8);
    paragraph(model.title, 48, 58, 700, COLOR.ink, 10);
    paragraph('Tanggal ringkasan: ' + dateText(model.asOf), 24, 32, 400, COLOR.muted, 6);
    if (model.status) paragraph(model.status, 21, 28, 600, COLOR.status, 12);
    line(MARGIN, WIDTH - MARGIN, y, COLOR.teal, 4);
    y += 30;

    model.sections.forEach(function (section, sectionIndex) {
      if (sectionIndex) y += 30;
      paragraph(section.title, 30, 39, 700, COLOR.teal, 3);
      paragraph(section.dateLabel, 22, 29, 400, COLOR.muted, 14);
      const three = section.columns.length === 3;
      const gap = 24;
      const available = INNER - gap * (three ? 2 : 1);
      const widths = three ? [available * 0.42, available * 0.30, available * 0.28] : [available * 0.58, available * 0.42];
      const starts = [MARGIN, MARGIN + widths[0] + gap];
      if (three) starts.push(starts[1] + widths[1] + gap);

      if (section.rows.length) {
        const headers = section.columns.map(function (label, index) { return wrap(ctx, label, widths[index] - 12, 21, 600); });
        const headerHeight = Math.max.apply(Math, headers.map(function (lines) { return lines.length; })) * 28 + 18;
        rectangle(MARGIN, y, INNER, headerHeight, COLOR.head);
        headers.forEach(function (lines, index) {
          words(lines, index === 1 ? starts[index] + widths[index] - 6 : starts[index] + 6, y + 9,
            21, 28, 600, COLOR.ink, index === 1 ? 'right' : 'left');
        });
        y += headerHeight;
        section.rows.forEach(function (row) {
          const valueSize = section.id.toLowerCase() === 'batangan' && section.rows.length === 1 ? 38 : 28;
          const valueStep = valueSize === 38 ? 46 : 36;
          const label = wrap(ctx, row.label, widths[0] - 12, 27, 400);
          const value = wrap(ctx, row.value, widths[1] - 12, valueSize, 700);
          const detail = row.detail ? wrap(ctx, row.detail, three ? widths[2] - 12 : INNER - 12, 22, 400) : [];
          const mainHeight = Math.max(label.length * 35, value.length * valueStep, three ? detail.length * 29 : 0);
          const detailHeight = !three && detail.length ? detail.length * 29 + 4 : 0;
          const rowHeight = mainHeight + detailHeight + 18;
          words(label, starts[0] + 6, y + 9, 27, 35, 400, COLOR.ink);
          words(value, starts[1] + widths[1] - 6, y + 9, valueSize, valueStep, 700, COLOR.ink, 'right');
          if (detail.length) words(detail, three ? starts[2] + 6 : MARGIN + 6,
            y + 9 + (three ? 0 : mainHeight + 4), 22, 29, 400, COLOR.muted);
          y += rowHeight;
          line(MARGIN, WIDTH - MARGIN, y);
          room();
        });
      } else {
        paragraph(section.emptyText, 27, 36, 400, COLOR.muted, 3);
      }

      if (section.total) {
        const label = wrap(ctx, section.total.label, widths[0] - 16, 25, 700);
        const valueWidth = INNER - widths[0] - gap - 16;
        const value = wrap(ctx, section.total.value, valueWidth, 28, 700);
        const height = Math.max(label.length * 34, value.length * 36) + 22;
        rectangle(MARGIN, y + 6, INNER, height, COLOR.total);
        words(label, MARGIN + 8, y + 17, 25, 34, 700, COLOR.ink);
        words(value, WIDTH - MARGIN - 8, y + 17, 28, 36, 700, COLOR.ink, 'right');
        y += height + 6;
        room();
      }
      if (section.notes.length) {
        y += 12;
        section.notes.forEach(function (note, noteIndex) {
          paragraph(note, 22, 29, 400, COLOR.muted, noteIndex === section.notes.length - 1 ? 0 : 5);
        });
      }
      room();
    });
    y += 28;
    line(MARGIN, WIDTH - MARGIN, y);
    y += 17;
    paragraph('Tanggal data tercantum pada setiap bagian.', 20, 27, 400, COLOR.muted, 0);
    const height = Math.ceil(y + 35);
    if (height > MAX_HEIGHT) throw new RangeError('Info Harian terlalu tinggi untuk satu JPEG. Tidak ada baris yang dipotong.');
    return { commands: commands, height: height };
  }

  function render(canvas, source) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('Kanvas Info Harian tidak tersedia.');
    const model = normalize(source);
    const measuring = canvas.getContext('2d');
    if (!measuring) throw new Error('Perangkat ini tidak mendukung gambar kanvas.');
    const plan = layout(measuring, model);
    canvas.width = WIDTH;
    canvas.height = plan.height;
    const ctx = canvas.getContext('2d');
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = COLOR.paper;
      ctx.fillRect(0, 0, WIDTH, plan.height);
      ctx.textBaseline = 'top';
      plan.commands.forEach(function (command) {
        if (command.type === 'rect') {
          ctx.fillStyle = command.color;
          ctx.fillRect(command.x, command.y, command.width, command.height);
        } else if (command.type === 'line') {
          ctx.beginPath();
          ctx.strokeStyle = command.color;
          ctx.lineWidth = command.thickness;
          ctx.moveTo(command.x1, command.y);
          ctx.lineTo(command.x2, command.y);
          ctx.stroke();
        } else {
          font(ctx, command.size, command.weight);
          ctx.fillStyle = command.color;
          ctx.textAlign = command.align;
          ctx.fillText(command.text, command.x, command.y);
        }
      });
    } finally { ctx.restore(); }
    return { canvas: canvas, width: WIDTH, height: plan.height };
  }

  function mount(container, source) {
    if (!container || !container.ownerDocument || typeof container.replaceChildren !== 'function') {
      throw new TypeError('Wadah Info Harian tidak tersedia.');
    }
    const model = normalize(source);
    const doc = container.ownerDocument;
    const canvas = doc.createElement('canvas');
    const result = render(canvas, model);
    canvas.className = 'ppic-daily-info-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'display:block;width:100%;max-width:1080px;height:auto;margin:0 auto;background:#fff;border:1px solid #d7e2e8;box-sizing:border-box;';

    // Semantic text mirrors every displayed cell; no source string is inserted as HTML.
    const article = doc.createElement('article');
    article.className = 'ppic-daily-info-accessible';
    article.setAttribute('aria-label', model.title);
    article.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);clip-path:inset(50%);white-space:normal;border:0;';
    function add(parent, tag, value) {
      const element = doc.createElement(tag);
      element.textContent = value;
      parent.appendChild(element);
      return element;
    }
    add(article, 'p', model.company);
    add(article, 'h2', model.title);
    add(article, 'p', 'Tanggal ringkasan: ' + dateText(model.asOf));
    if (model.status) add(article, 'p', model.status);
    model.sections.forEach(function (section) {
      const block = doc.createElement('section');
      add(block, 'h3', section.title);
      add(block, 'p', section.dateLabel);
      if (section.rows.length) {
        const table = doc.createElement('table');
        const head = table.createTHead().insertRow();
        section.columns.forEach(function (label) { add(head, 'th', label).scope = 'col'; });
        const body = table.createTBody();
        section.rows.forEach(function (row) {
          const tr = body.insertRow();
          const label = add(tr, 'th', row.label);
          label.scope = 'row';
          add(tr, 'td', row.value);
          if (section.columns.length === 3) add(tr, 'td', row.detail);
          else if (row.detail) add(label, 'div', row.detail);
        });
        block.appendChild(table);
      } else add(block, 'p', section.emptyText);
      if (section.total) add(block, 'p', section.total.label + ': ' + section.total.value);
      section.notes.forEach(function (note) { add(block, 'p', note); });
      article.appendChild(block);
    });
    add(article, 'p', 'Tanggal data tercantum pada setiap bagian.');
    container.replaceChildren(canvas, article);
    return result;
  }

  function filename(model) {
    if (!model || !validDate(model.asOf)) throw new TypeError('Tanggal ringkasan Info Harian belum valid.');
    return 'BAL_PPIC_INFO_HARIAN_' + model.asOf + '.jpg';
  }

  function assertCurrent(options) {
    if (options && typeof options.isCurrent === 'function' && !options.isCurrent()) {
      const error = new Error('Ekspor Info Harian dibatalkan karena sesi atau data telah berubah.');
      error.name = 'AbortError';
      throw error;
    }
  }

  async function exportJpeg(model, options) {
    assertCurrent(options);
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      throw new Error('Unduhan JPEG hanya tersedia di peramban. Gunakan render(canvas, model) untuk kanvas Node.');
    }
    const canvas = document.createElement('canvas');
    let url = null;
    let anchor = null;
    try {
      const result = render(canvas, model);
      const name = filename(model);
      const blob = await new Promise(function (resolve, reject) {
        if (typeof canvas.toBlob !== 'function') { reject(new Error('Perangkat ini tidak mendukung ekspor JPEG.')); return; }
        canvas.toBlob(function (value) {
          if (value) resolve(value);
          else reject(new Error('JPEG Info Harian gagal dibuat. Silakan coba kembali.'));
        }, 'image/jpeg', 0.94);
      });
      assertCurrent(options);
      if (blob.type !== 'image/jpeg') throw new Error('Perangkat ini tidak menghasilkan format JPEG yang diminta.');
      url = URL.createObjectURL(blob);
      anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      assertCurrent(options);
      anchor.click();
      const completedUrl = url;
      setTimeout(function () { URL.revokeObjectURL(completedUrl); }, 1000);
      url = null;
      return { filename: name, width: result.width, height: result.height, blob: blob };
    } finally {
      if (anchor) anchor.remove();
      if (url) URL.revokeObjectURL(url);
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  return { render: render, mount: mount, exportJpeg: exportJpeg, filename: filename };
}));
