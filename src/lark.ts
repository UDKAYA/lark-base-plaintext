import { bitable } from '@lark-base-open/js-sdk';

// Tablo / alan / görünüm için sade meta tipi
export interface Meta {
  id: string;
  name: string;
  type?: number;
}

// Tek bir kayıt: kimlik + { alanId -> hücre değeri }
export interface Row {
  id: string;
  fields: Record<string, unknown>;
}

/** Base içindeki tüm tabloların meta listesi (id + ad). */
export async function getTableMetas(): Promise<Meta[]> {
  const metas = await bitable.base.getTableMetaList();
  return metas.map((m) => ({ id: m.id, name: m.name }));
}

/** O an ekranda açık olan tablonun id'si (yoksa null). */
export async function getActiveTableId(): Promise<string | null> {
  try {
    const table = await bitable.base.getActiveTable();
    return table.id;
  } catch {
    return null;
  }
}

/** Seçilen tablonun alanları (id, ad, tip). */
export async function getFieldMetas(tableId: string): Promise<Meta[]> {
  const table = await bitable.base.getTableById(tableId);
  const metas = await table.getFieldMetaList();
  return metas.map((m) => ({ id: m.id, name: m.name, type: m.type }));
}

/** Seçilen tablonun görünümleri (grid, kanban vb.). */
export async function getViewMetas(tableId: string): Promise<Meta[]> {
  const table = await bitable.base.getTableById(tableId);
  const metas = await table.getViewMetaList();
  return metas.map((m) => ({ id: m.id, name: m.name, type: (m as { type?: number }).type }));
}

/**
 * Tablodaki kayıtları sayfalayarak çeker.
 * viewId verilirse o görünümün Lark'taki filtre/sıralamasına saygı duyulur.
 */
export async function getRows(tableId: string, viewId?: string): Promise<Row[]> {
  const table = await bitable.base.getTableById(tableId);
  const rows: Row[] = [];
  let pageToken: string | undefined;

  do {
    const res = await table.getRecords({ pageSize: 500, pageToken, viewId });
    for (const rec of res.records) {
      const r = rec as { recordId?: string; id?: string; fields: Record<string, unknown> };
      rows.push({ id: r.recordId ?? r.id ?? '', fields: r.fields ?? {} });
    }
    pageToken = res.hasMore ? res.pageToken : undefined;
  } while (pageToken);

  return rows;
}

/**
 * Herhangi bir hücre değerini okunabilir düz metne çevirir.
 * Metin/sayı/checkbox, tekli-çoklu seçim, kişi, tarih, URL, e-posta,
 * telefon, bağlı kayıt gibi yaygın tiplerin hepsini güvenli şekilde işler.
 */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '✓' : '';
  if (Array.isArray(value)) {
    return value.map((v) => segToString(v)).filter((s) => s !== '').join(', ');
  }
  return segToString(value);
}

function segToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '✓' : '';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    // En yaygın alan tiplerinin metin taşıyan anahtarları:
    for (const key of ['text', 'name', 'enName', 'fullAddress', 'title', 'link']) {
      if (typeof o[key] === 'string') return o[key] as string;
    }
    if (o.value !== undefined) return segToString(o.value);
  }
  return '';
}
