import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { dashboard, DashboardState } from '@lark-base-open/js-sdk';
import '@lark-base-open/js-sdk/dist/style/dashboard.css';
import {
  cellToString,
  extractUserIds,
  getActiveTableId,
  getCurrentUserId,
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

// Kişi (User) tipi alanların FieldType değerleri: User=11, CreatedUser=1003, ModifiedUser=1004
const USER_FIELD_TYPES = [11, 1003, 1004];

let condKeyCounter = 1;

/* ---------------- Kalıcı yapılandırma (customConfig) ---------------- */

interface WidgetConfig {
  title: string;
  tableId: string;
  viewId: string;
  conjunction: 'and' | 'or';
  conditions: Condition[];
  onlyMine: boolean;
  mineFieldId: string;
  displayFieldIds: string[];
  recordSepIdx: number;
  fieldSepIdx: number;
  showFieldNames: boolean;
  removeEmpty: boolean;
  dedupe: boolean;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  align: 'left' | 'center' | 'right';
  fontFamily: 'sans' | 'serif' | 'mono';
  color: string;
}

const DEFAULT_CONFIG: WidgetConfig = {
  title: '',
  tableId: '',
  viewId: '',
  conjunction: 'and',
  conditions: [],
  onlyMine: false,
  mineFieldId: '',
  displayFieldIds: [],
  recordSepIdx: 0,
  fieldSepIdx: 0,
  showFieldNames: false,
  removeEmpty: true,
  dedupe: false,
  fontSize: 16,
  fontWeight: 400,
  lineHeight: 1.5,
  letterSpacing: 0,
  align: 'left',
  fontFamily: 'sans',
  color: '#1f2329',
};

/* ---------------- Yardımcı bileşen ---------------- */

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
  const [dashState, setDashState] = useState<DashboardState | null>(null);
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG);

  const [tables, setTables] = useState<Meta[]>([]);
  const [fields, setFields] = useState<Meta[]>([]);
  const [views, setViews] = useState<Meta[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = useCallback(
    (p: Partial<WidgetConfig>) => setConfig((c) => ({ ...c, ...p })),
    [],
  );

  // Kaydedilmiş customConfig'i state'e uygula (koşul anahtarlarını garanti et)
  const applyCustomConfig = useCallback((cc: Record<string, unknown> | undefined | null) => {
    if (!cc) return;
    setConfig((prev) => {
      const merged = { ...prev, ...(cc as Partial<WidgetConfig>) };
      merged.conditions = (merged.conditions ?? []).map((c) => ({
        ...c,
        key: c.key ?? condKeyCounter++,
      }));
      return merged;
    });
  }, []);

  const isConfigMode =
    dashState === null ||
    dashState === DashboardState.Config ||
    dashState === DashboardState.Create;

  /* ---- İlk yükleme ---- */
  useEffect(() => {
    let cancelled = false;
    const withTimeout = <T,>(p: Promise<T>, ms: number) =>
      Promise.race([
        p,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
      ]);

    // Dashboard host'unda mıyız? (senkron okuma)
    let st: DashboardState | null = null;
    try {
      st = dashboard && dashboard.state != null ? dashboard.state : null;
    } catch {
      st = null;
    }
    setDashState(st);

    (async () => {
      try {
        const metas = await withTimeout(getTableMetas(), 6000);
        if (cancelled) return;
        setTables(metas);

        if (st !== null && st !== DashboardState.Create) {
          // Kaydedilmiş yapılandırmayı yükle
          const cfg = await dashboard.getConfig().catch(() => null);
          if (cfg && (cfg as { customConfig?: Record<string, unknown> }).customConfig) {
            applyCustomConfig((cfg as { customConfig?: Record<string, unknown> }).customConfig);
          }
        } else {
          // Yeni widget ya da panel modu: aktif tabloyu varsayılan yap
          const active = await getActiveTableId().catch(() => null);
          const initial =
            active && metas.some((m) => m.id === active) ? active : metas[0]?.id ?? '';
          patch({ tableId: initial });
        }

        setPhase('ready');
        getCurrentUserId()
          .then((id) => {
            if (!cancelled) setCurrentUserId(id);
          })
          .catch(() => {});
      } catch {
        if (!cancelled) setPhase('no-host');
      }
    })();

    // Yapılandırma değişikliklerini dinle (dashboard host)
    let off: (() => void) | undefined;
    if (st !== null) {
      try {
        off = dashboard.onConfigChange((r) => {
          const cc = (r as { data?: { customConfig?: Record<string, unknown> } })?.data
            ?.customConfig;
          if (!cancelled) applyCustomConfig(cc);
        });
      } catch {
        /* yoksay */
      }
    }

    return () => {
      cancelled = true;
      if (off) {
        try {
          off();
        } catch {
          /* yoksay */
        }
      }
    };
  }, [applyCustomConfig, patch]);

  /* ---- Tablo değişince alanları + görünümleri yükle ---- */
  useEffect(() => {
    if (!config.tableId) {
      setFields([]);
      setViews([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [f, v] = await Promise.all([
          getFieldMetas(config.tableId),
          getViewMetas(config.tableId),
        ]);
        if (cancelled) return;
        setFields(f);
        setViews(v);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.tableId]);

  /* ---- Alanlar yüklenince boş varsayılanları doldur (yalnızca tablo değişiminde) ---- */
  useEffect(() => {
    if (!fields.length) return;
    setConfig((c) => {
      let next = c;
      if (c.displayFieldIds.length === 0) {
        next = { ...next, displayFieldIds: [fields[0].id] };
      }
      if (!c.mineFieldId) {
        const uf = fields.filter((m) => m.type !== undefined && USER_FIELD_TYPES.includes(m.type));
        next = { ...next, mineFieldId: (uf[0] ?? fields[0])?.id ?? '' };
      }
      return next;
    });
  }, [fields]);

  /* ---- Kayıtları yükle ---- */
  const reloadRows = useCallback(async () => {
    if (!config.tableId) return;
    setLoadingRows(true);
    setError('');
    try {
      const r = await getRows(config.tableId, config.viewId || undefined);
      setRows(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingRows(false);
    }
  }, [config.tableId, config.viewId]);

  useEffect(() => {
    reloadRows();
  }, [reloadRows]);

  const fieldName = useCallback(
    (id: string) => fields.find((f) => f.id === id)?.name ?? id,
    [fields],
  );

  const userFields = useMemo(() => {
    const u = fields.filter((f) => f.type !== undefined && USER_FIELD_TYPES.includes(f.type));
    return u.length ? u : fields;
  }, [fields]);

  /* ---- Filtre uygula ---- */
  const filteredRows = useMemo(() => {
    const active = config.conditions.filter(
      (c) => c.fieldId && (NO_VALUE_OPS.includes(c.op) || c.value.trim() !== ''),
    );
    return rows.filter((row) => {
      if (config.onlyMine && config.mineFieldId) {
        const ids = extractUserIds(row.fields[config.mineFieldId]);
        if (!currentUserId || !ids.includes(currentUserId)) return false;
      }
      if (active.length === 0) return true;
      const results = active.map((c) =>
        testCondition(cellToString(row.fields[c.fieldId]), c.op, c.value),
      );
      return config.conjunction === 'and' ? results.every(Boolean) : results.some(Boolean);
    });
  }, [rows, config.conditions, config.conjunction, config.onlyMine, config.mineFieldId, currentUserId]);

  const fieldSep = FIELD_SEPS[config.fieldSepIdx].value;
  const recordSep = RECORD_SEPS[config.recordSepIdx].value;

  const lines = useMemo(() => {
    let ls = filteredRows.map((row) =>
      config.displayFieldIds
        .map((fid) => {
          const s = cellToString(row.fields[fid]);
          return config.showFieldNames ? `${fieldName(fid)}: ${s}` : s;
        })
        .join(fieldSep),
    );
    if (config.removeEmpty) ls = ls.filter((s) => s.trim() !== '');
    if (config.dedupe) ls = Array.from(new Set(ls));
    return ls;
  }, [
    filteredRows,
    config.displayFieldIds,
    config.showFieldNames,
    fieldSep,
    config.removeEmpty,
    config.dedupe,
    fieldName,
  ]);

  const outputText = useMemo(() => lines.join(recordSep), [lines, recordSep]);

  /* ---- View modunda host'a "çizildi" bildir (ekran görüntüsü için) ---- */
  useEffect(() => {
    if (dashState !== null && !isConfigMode && !loadingRows) {
      try {
        dashboard.setRendered();
      } catch {
        /* yoksay */
      }
    }
  }, [dashState, isConfigMode, loadingRows, outputText]);

  /* ---- Eylemler ---- */
  const onTableChange = (id: string) =>
    patch({
      tableId: id,
      viewId: '',
      conditions: [],
      displayFieldIds: [],
      onlyMine: false,
      mineFieldId: '',
    });

  const addCondition = () =>
    patch({
      conditions: [
        ...config.conditions,
        { key: condKeyCounter++, fieldId: fields[0]?.id ?? '', op: 'contains', value: '' },
      ],
    });

  const updateCondition = (key: number, p: Partial<Condition>) =>
    patch({ conditions: config.conditions.map((c) => (c.key === key ? { ...c, ...p } : c)) });

  const removeCondition = (key: number) =>
    patch({ conditions: config.conditions.filter((c) => c.key !== key) });

  const toggleDisplayField = (id: string) =>
    patch({
      displayFieldIds: config.displayFieldIds.includes(id)
        ? config.displayFieldIds.filter((x) => x !== id)
        : [...config.displayFieldIds, id],
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* pano yoksa geç */
    }
  };

  const handleSave = async () => {
    try {
      await dashboard.saveConfig({
        customConfig: config as unknown as Record<string, unknown>,
        dataConditions: [],
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const textStyle: CSSProperties = {
    fontSize: config.fontSize,
    fontWeight: config.fontWeight,
    lineHeight: config.lineHeight,
    letterSpacing: `${config.letterSpacing}px`,
    textAlign: config.align,
    fontFamily: FONTS[config.fontFamily],
    color: config.color,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
  };

  /* ---- Ekranlar ---- */
  if (phase === 'loading') {
    return <div className="state">Lark'a bağlanılıyor…</div>;
  }

  if (phase === 'no-host') {
    return (
      <div className="state">
        <h3>Bu bileşen Lark içinde çalışır</h3>
        <p>
          Sayfayı doğrudan tarayıcıda açtın. Veriyi görmek için bunu bir Lark Base tablosuna
          ya da Base App sayfasına <b>özel eklenti</b> olarak ekle. Adımlar README'de.
        </p>
      </div>
    );
  }

  // VIEW modu: sadece temiz veri (widget)
  if (dashState !== null && !isConfigMode) {
    return (
      <div className="widget">
        {config.title && <div className="widget-title">{config.title}</div>}
        <div className="widget-body" style={textStyle}>
          {outputText || '—'}
        </div>
      </div>
    );
  }

  // CONFIG / panel modu: önizleme + ayarlar (+ dashboard ise Kaydet)
  return (
    <div className="app">
      <header className="app-head">
        <h1>Düz Metin Görüntüleyici</h1>
        <p className="sub">Ayarla → Kaydet → ana ekranda widget olarak görünsün</p>
      </header>

      {/* Canlı önizleme */}
      <section className="card">
        <div className="card-title">
          Önizleme
          <span className="count">
            {lines.length} kayıt{loadingRows ? ' · yükleniyor…' : ''}
          </span>
        </div>
        <div className="preview">
          {config.title && <div className="widget-title">{config.title}</div>}
          <div style={textStyle}>{outputText || '—'}</div>
        </div>
        {error && <p className="err">{error}</p>}
        <button className="btn ghost" onClick={copy} disabled={!outputText}>
          {copied ? '✓ Kopyalandı' : 'Panoya kopyala'}
        </button>
      </section>

      {/* Kaynak */}
      <section className="card">
        <div className="card-title">1 · Kaynak</div>

        <label className="field">
          <span>Başlık (opsiyonel)</span>
          <input
            type="text"
            placeholder="ör. Ekibim"
            value={config.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </label>

        <label className="field">
          <span>Tablo</span>
          <select value={config.tableId} onChange={(e) => onTableChange(e.target.value)}>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Görünüm (Lark filtresini uygular)</span>
          <select value={config.viewId} onChange={(e) => patch({ viewId: e.target.value })}>
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
          {config.conditions.length > 1 && (
            <div className="seg">
              <button
                className={config.conjunction === 'and' ? 'on' : ''}
                onClick={() => patch({ conjunction: 'and' })}
              >
                VE
              </button>
              <button
                className={config.conjunction === 'or' ? 'on' : ''}
                onClick={() => patch({ conjunction: 'or' })}
              >
                VEYA
              </button>
            </div>
          )}
        </div>

        <div className="mine">
          <label className="mine-toggle">
            <input
              type="checkbox"
              checked={config.onlyMine}
              onChange={(e) => patch({ onlyMine: e.target.checked })}
            />
            Sadece geçerli kullanıcının (Current User) kayıtları
          </label>
          {config.onlyMine && (
            <>
              <label className="field">
                <span>Eşleştirilecek kişi alanı</span>
                <select
                  value={config.mineFieldId}
                  onChange={(e) => patch({ mineFieldId: e.target.value })}
                >
                  {userFields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint">Geçerli kullanıcı kimliği: {currentUserId || '—'}</p>
            </>
          )}
        </div>

        {config.conditions.length === 0 && <p className="hint">Ek koşul yok.</p>}

        {config.conditions.map((cond) => {
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
            <label
              key={f.id}
              className={`chip ${config.displayFieldIds.includes(f.id) ? 'on' : ''}`}
            >
              <input
                type="checkbox"
                checked={config.displayFieldIds.includes(f.id)}
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
            <select
              value={config.recordSepIdx}
              onChange={(e) => patch({ recordSepIdx: Number(e.target.value) })}
            >
              {RECORD_SEPS.map((s, i) => (
                <option key={s.label} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Alan ayracı</span>
            <select
              value={config.fieldSepIdx}
              onChange={(e) => patch({ fieldSepIdx: Number(e.target.value) })}
            >
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
              checked={config.showFieldNames}
              onChange={(e) => patch({ showFieldNames: e.target.checked })}
            />
            Alan adını göster
          </label>
          <label>
            <input
              type="checkbox"
              checked={config.removeEmpty}
              onChange={(e) => patch({ removeEmpty: e.target.checked })}
            />
            Boşları gizle
          </label>
          <label>
            <input
              type="checkbox"
              checked={config.dedupe}
              onChange={(e) => patch({ dedupe: e.target.checked })}
            />
            Tekrarları kaldır
          </label>
        </div>
      </section>

      {/* Metin stili */}
      <section className="card">
        <div className="card-title">5 · Metin görünümü</div>
        <Slider
          label="Boyut"
          value={config.fontSize}
          min={8}
          max={96}
          step={1}
          unit="px"
          onChange={(v) => patch({ fontSize: v })}
        />
        <Slider
          label="Kalınlık"
          value={config.fontWeight}
          min={100}
          max={900}
          step={100}
          onChange={(v) => patch({ fontWeight: v })}
        />
        <Slider
          label="Satır yüksekliği"
          value={config.lineHeight}
          min={1}
          max={3}
          step={0.1}
          onChange={(v) => patch({ lineHeight: v })}
        />
        <Slider
          label="Harf aralığı"
          value={config.letterSpacing}
          min={-2}
          max={12}
          step={0.5}
          unit="px"
          onChange={(v) => patch({ letterSpacing: v })}
        />
        <div className="grid2">
          <label className="field">
            <span>Hizalama</span>
            <select
              value={config.align}
              onChange={(e) => patch({ align: e.target.value as WidgetConfig['align'] })}
            >
              <option value="left">Sola</option>
              <option value="center">Ortala</option>
              <option value="right">Sağa</option>
            </select>
          </label>
          <label className="field">
            <span>Yazı tipi</span>
            <select
              value={config.fontFamily}
              onChange={(e) => patch({ fontFamily: e.target.value as WidgetConfig['fontFamily'] })}
            >
              <option value="sans">Sans (sistem)</option>
              <option value="serif">Serif</option>
              <option value="mono">Monospace</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Renk</span>
          <input
            type="color"
            value={config.color}
            onChange={(e) => patch({ color: e.target.value })}
          />
        </label>
      </section>

      {/* Kaydet (yalnızca dashboard/Base App bağlamında) */}
      {dashState !== null && (
        <div className="save-bar">
          <button className="btn primary" onClick={handleSave}>
            {saved ? '✓ Kaydedildi' : "Kaydet ve widget'a uygula"}
          </button>
          <p className="hint">
            Kaydettikten sonra bileşen görünüm modunda yalnızca veriyi gösterir; herkes bunu
            görür.
          </p>
        </div>
      )}
    </div>
  );
}
