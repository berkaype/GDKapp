export function toLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromLocalDateString(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) {
    return new Date(NaN);
  }
  return new Date(year, month - 1, day);
}
