export function toDay(val: any): string {
  if (!val) return '';
  let d: Date;
  if (typeof val === 'string') {
    if (val.length <= 10) return val;          // already "YYYY-MM-DD"
    d = new Date(val);
  } else if (typeof val.toDate === 'function') {
    d = val.toDate();
  } else if (val instanceof Date) {
    d = val;
  } else {
    return '';
  }
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}