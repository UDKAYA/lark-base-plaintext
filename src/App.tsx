import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  cellToString,
  getActiveTableId,
  getFieldMetas,
  getRows,
  getTableMetas,
  getViewMetas,
} from './lark';
import type { Meta, Row } from './lark';

/* ---------------- Filtre operatörleri ---------------- */

type Op =
  | 'contains'
  | 'notContains'
  | 'eq'
  | 'neq'
  | 'empty'
  | 'notEmpty'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

const OP_LABELS: Record<Op, string> = {
  contains: 'içerir',
  notContains: 'içermez',
  eq: 'eşittir',
  neq: 'eşit değildir',
  empty: 'boş',
  notEmpty: 'dolu',
  gt: '> (büyüktür)',
  gte: '≥ (büyük/eşit)',
  lt: '< (küçüktür)',
  lte: '≤ (küçük/eşit)',
};

// Değer kutusu gerektirmeyen operatörler
const NO_VALUE_OPS: Op[] = ['empty', 'notEmpty'];

interface Condition {
  key: number;
  fieldId: string;
  op: Op;
  value: string;
}

function testCondition(cellStr: string, op: Op, value: string): boolean {
  const a = cellStr.trim().toLowerCase();
  const b = value.trim().toLowerCase();
  switch (op) {
    case 'contains':
      return a.includes(b);
    case 'notContains':
      return !a.includes(b);
    case 'eq':
      return a === b;
    case 'neq':
      return a !== b;
    case 'empty':
      return a === '';
    case 'notEmpty':
      return a !== '';
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const na = parseFloat(cellStr);
      const nb = parseFloat(value);
      if (Number.isNaN(na) || Number.isNaN(nb)) return false;
      if (op === 'gt') return na > nb;
      if (op === 'gte') return na >= nb;
      if (op === 'lt') return na < nb;
      return na <= nb;
    }
  }
}

/* ---------------- Çıktı / stil sabitleri ---------------- */

const RECORD_SEPS = [
  { label: 'Yeni satır', value: '\n' },
  { label: 'Virgül', value: ', ' },
  { label: 'Noktalı virgül', value: '; ' },
  { label: 'Boşluk', value: ' ' },
  { label: 'Tab', value: '\t' },
  { label: 'Dikey çizgi', value: ' | ' },
];

const FIELD_SEPS = [
  { label: 'Uzun tire ( — )', value: ' — ' },
  { label: 'Orta nokta ( · )', value: ' · ' },
  { label: 'Virgül', value: ', ' },
  { label: 'Boşluk', value: ' ' },
  { label: 'Tab', value: '\t' },
  { label: 'Dikey çizgi', value: ' | ' },
];

const FONTS: Record<'sans' | 'serif' | 'mono', string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

let condKeyCounter = 1;

/* ---------------- Küçük yardımcı bileşenler ---------------- */

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="ctrl">
      <span className="ctrl-label">
        {props.label}
        <b>
          {props.value}
          {props.unit ?? ''}
        </b>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

/* ---------------- Ana bileşen ---------------- */

export default function App() {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'no-host'>('loading');
  const [error, setError] = useState('');

  const [tables, setTables] = useState<Meta[]>([]);
  const [tableId, setTableId] = useState('');
  const [fields, setFields] = useState<Meta[]>([]);
  const [views, setViews] = useState<Meta[]>([]);
  const [viewId, setViewId] = useState('');

  const [displayFieldIds, setDisplayFieldIds] = useState<string[]>([]);
  const [conjunction, setConjunction] = useState<'and' | 'or'>('and');
  const [conditions, setConditions] = useState<Condition[]>([]);

  const [rows, setRows] = useState<Row[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);

  // Çıktı seçenekleri
  const [recordSepIdx, setRecordSepIdx] = useState(0);
  const [fieldSepIdx, setFieldSepIdx] = useState(0);
  const [showFieldNames, setShowFieldNames] = useState(false);
  const [removeEmpty, setRemoveEmpty] = useState(true);
  const [dedupe, setDedupe] = useState(false);

  // Metin stili
  const [fontSize, setFontSize] = useState(16);
  const [fontWeight, setFontWeight] = useState(400);
  const [lineHeight, setLineHeight] = useState(1.5);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('left');
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('sans');
  const [color, setColor] = useState('#1f2329');

  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- İlk yükleme: Lark bağlantısını test et + tabloları al ---- */
  useEffect(() => {
    let cancelled = false;
    const withTimeout = <T,>(p: Promise<T>, ms: number) =>
      Promise.race([
        p,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
      ]);

    (async () => {
      try {
        const metas = await withTimeout(getTableMetas(), 6000);
        if (cancelled) return;
        const active = await getActiveTableId().catch(() => null);
        setTables(metas);
        const initial =
          active && metas.some((m) => m.id === active) ? active : metas[0]?.id ?? '';
        setTableId(initial);
        setPhase('ready');
      } catch {
        if (!cancelled) setPhase('no-host');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Tablo değişince alanları + görünümleri yükle ---- */
  useEffect(() => {
    if (!tableId) return;
    let cancelled = false;
    (async () => {
      try {
        const [f, v] = await Promise.all([getFieldMetas(tableId), getViewMetas(tableId)]);
        if (cancelled) return;
        setFields(f);
        setViews(v);
        setViewId('');
        setConditions([]);
        setDisplayFieldIds(f.length ? [f[0].id] : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  /* ---- Kayıtları yükle (tablo/görünüm değişince) ---- */
  const reloadRows = useCallback(async () => {
    if (!tableId) return;
    setLoadingRows(true);
    setError('');
    try {
      const r = await getRows(tableId, viewId || undefined);
      setRows(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingRows(false);
    }
  }, [tableId, viewId]);

  useEffect(() => {
    reloadRows();
  }, [reloadRows]);

  const fieldName = useCallback(
    (id: string) => fields.find((f) => f.id === id)?.name ?? id,
    [fields],
  );

  /* ---- Filtre uygula ---- */
  const filteredRows = useMemo(() => {
    const active = conditions.filter(
      (c) => c.fieldId && (NO_VALUE_OPS.includes(c.op) || c.value.trim() !== ''),
    );
    if (active.length === 0) return rows;
    return rows.filter((row) => {
      const results = active.map((c) =>
        testCondition(cellToString(row.fields[c.fieldId]), c.op, c.value),
      );
      return conjunction === 'and' ? results.every(Boolean) : results.some(Boolean);
    });
  }, [rows, conditions, conjunction]);

  /* ---- Satırları metne çevir ---- */
  const fieldSep = FIELD_SEPS[fieldSepIdx].value;
  const recordSep = RECORD_SEPS[recordSepIdx].value;

  const lines = useMemo(() => {
    let ls = filteredRows.map((row) =>
      displayFieldIds
        .map((fid) => {
          const s = cellToString(row.fields[fid]);
          return showFieldNames ? `${fieldName(fid)}: ${s}` : s;
        })
        .join(fieldSep),
    );
    if (removeEmpty) ls = ls.filter((s) => s.trim() !== '');
    if (dedupe) ls = Array.from(new Set(ls));
    return ls;
  }, [filteredRows, displayFieldIds, showFieldNames, fieldSep, removeEmpty, dedupe, fieldName]);

  const outputText = useMemo(() => lines.join(recordSep), [lines, recordSep]);

  /* ---- Eylemler ---- */
  const addCondition = () =>
    setConditions((c) => [
      ...c,
      { key: condKeyCounter++, fieldId: fields[0]?.id ?? '', op: 'contains', value: '' },
    ]);

  const updateCondition = (key: number, patch: Partial<Condition>) =>
    setConditions((c) => c.map((cond) => (cond.key === key ? { ...cond, ...patch } : cond)));

  const removeCondition = (key: number) =>
    setConditions((c) => c.filter((cond) => cond.key !== key));

  const toggleDisplayField = (id: string) =>
    setDisplayFieldIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* pano erişimi yoksa sessizce geç */
    }
  };

  /* ---- Ekranlar ---- */
  if (phase === 'loading') {
    return <div className="state">Lark Base'e bağlanılıyor…</div>;
  }

  if (phase === 'no-host') {
    return (
      <div className="state">
        <h3>Bu eklenti Lark Base içinde çalışır</h3>
        <p>
          Sayfayı doğrudan tarayıcıda açtın. Veriyi görmek için bu adresi bir Lark Base
          tablosunda <b>eklenti (uzantı)</b> olarak yükle. Adımlar README dosyasında.
        </p>
      </div>
    );
  }

  const textStyle: CSSProperties = {
    fontSize,
    fontWeight,
    lineHeight,
    letterSpacing: `${letterSpacing}px`,
    textAlign: align,
    fontFamily: FONTS[fontFamily],
    color,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
  };

  return (
    <div className="app">
      <header className="app-head">
        <h1>Düz Metin Görüntüleyici</h1>
        <p className="sub">Tablo → filtre → seçili alanları ölçeklenebilir metin olarak göster</p>
      </header>

      {/* Kaynak */}
      <section className="card">
        <div className="card-title">1 · Kaynak</div>

        <label className="field">
          <span>Tablo</span>
          <select value={tableId} onChange={(e) => setTableId(e.target.value)}>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Görünüm (Lark filtresini uygular)</span>
          <select value={viewId} onChange={(e) => setViewId(e.target.value)}>
            <option value="">Tüm kayıtlar (görünüm filtresi yok)</option>
            {views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>

        <button className="btn ghost" onClick={reloadRows} disabled={loadingRows}>
          {loadingRows ? 'Yükleniyor…' : '↻ Verileri yenile'}
        </button>
      </section>

      {/* Filtre */}
      <section className="card">
        <div className="card-title">
          2 · Filtre
          {conditions.length > 1 && (
            <div className="seg">
              <button
                className={conjunction === 'and' ? 'on' : ''}
                onClick={() => setConjunction('and')}
              >
                VE
              </button>
              <button
                className={conjunction === 'or' ? 'on' : ''}
                onClick={() => setConjunction('or')}
              >
                VEYA
              </button>
            </div>
          )}
        </div>

        {conditions.length === 0 && (
          <p className="hint">Koşul yok — tüm kayıtlar gösterilir.</p>
        )}

        {conditions.map((cond) => {
          const needsValue = !NO_VALUE_OPS.includes(cond.op);
          return (
            <div className="cond" key={cond.key}>
              <select
                value={cond.fieldId}
                onChange={(e) => updateCondition(cond.key, { fieldId: e.target.value })}
              >
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <select
                value={cond.op}
                onChange={(e) => updateCondition(cond.key, { op: e.target.value as Op })}
              >
                {(Object.keys(OP_LABELS) as Op[]).map((op) => (
                  <option key={op} value={op}>
                    {OP_LABELS[op]}
                  </option>
                ))}
              </select>
              {needsValue && (
                <input
                  type="text"
                  placeholder="değer"
                  value={cond.value}
                  onChange={(e) => updateCondition(cond.key, { value: e.target.value })}
                />
              )}
              <button className="x" onClick={() => removeCondition(cond.key)} title="Kaldır">
                ✕
              </button>
            </div>
          );
        })}

        <button className="btn ghost" onClick={addCondition} disabled={fields.length === 0}>
          + Koşul ekle
        </button>
      </section>

      {/* Gösterilecek alanlar */}
      <section className="card">
        <div className="card-title">3 · Gösterilecek alanlar</div>
        <div className="chips">
          {fields.map((f) => (
            <label key={f.id} className={`chip ${displayFieldIds.includes(f.id) ? 'on' : ''}`}>
              <input
                type="checkbox"
                checked={displayFieldIds.includes(f.id)}
                onChange={() => toggleDisplayField(f.id)}
              />
              {f.name}
            </label>
          ))}
        </div>
      </section>

      {/* Çıktı seçenekleri */}
      <section className="card">
        <div className="card-title">4 · Çıktı</div>
        <div className="grid2">
          <label className="field">
            <span>Kayıt ayracı</span>
            <select value={recordSepIdx} onChange={(e) => setRecordSepIdx(Number(e.target.value))}>
              {RECORD_SEPS.map((s, i) => (
                <option key={s.label} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Alan ayracı</span>
            <select value={fieldSepIdx} onChange={(e) => setFieldSepIdx(Number(e.target.value))}>
              {FIELD_SEPS.map((s, i) => (
                <option key={s.label} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="toggles">
          <label>
            <input
              type="checkbox"
              checked={showFieldNames}
              onChange={(e) => setShowFieldNames(e.target.checked)}
            />
            Alan adını göster
          </label>
          <label>
            <input
              type="checkbox"
              checked={removeEmpty}
              onChange={(e) => setRemoveEmpty(e.target.checked)}
            />
            Boşları gizle
          </label>
          <label>
            <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} />
            Tekrarları kaldır
          </label>
        </div>
      </section>

      {/* Metin stili */}
      <section className="card">
        <div className="card-title">5 · Metin görünümü</div>
        <Slider label="Boyut" value={fontSize} min={8} max={96} step={1} unit="px" onChange={setFontSize} />
        <Slider
          label="Kalınlık"
          value={fontWeight}
          min={100}
          max={900}
          step={100}
          onChange={setFontWeight}
        />
        <Slider
          label="Satır yüksekliği"
          value={lineHeight}
          min={1}
          max={3}
          step={0.1}
          onChange={setLineHeight}
        />
        <Slider
          label="Harf aralığı"
          value={letterSpacing}
          min={-2}
          max={12}
          step={0.5}
          unit="px"
          onChange={setLetterSpacing}
        />
        <div className="grid2">
          <label className="field">
            <span>Hizalama</span>
            <select value={align} onChange={(e) => setAlign(e.target.value as typeof align)}>
              <option value="left">Sola</option>
              <option value="center">Ortala</option>
              <option value="right">Sağa</option>
            </select>
          </label>
          <label className="field">
            <span>Yazı tipi</span>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value as typeof fontFamily)}
            >
              <option value="sans">Sans (sistem)</option>
              <option value="serif">Serif</option>
              <option value="mono">Monospace</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Renk</span>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
      </section>

      {/* Çıktı */}
      <section className="card output-card">
        <div className="card-title">
          Sonuç
          <span className="count">
            {lines.length} kayıt{loadingRows ? ' · yükleniyor…' : ''}
          </span>
        </div>
        {error && <p className="err">{error}</p>}
        {displayFieldIds.length === 0 ? (
          <p className="hint">Yukarıdan en az bir alan seç.</p>
        ) : (
          <div className="output" style={textStyle}>
            {outputText || '—'}
          </div>
        )}
        <button className="btn primary" onClick={copy} disabled={!outputText}>
          {copied ? '✓ Kopyalandı' : 'Panoya kopyala'}
        </button>
      </section>
    </div>
  );
}
