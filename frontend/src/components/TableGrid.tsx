import React from 'react';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  rowKey?: (row: T) => string;
}

export function TableGrid<T>({ columns, data, rowKey }: Props<T>) {
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          {columns.map(c => (
            <th key={c.key} style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>{c.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map(row => (
          <tr key={rowKey ? rowKey(row) : JSON.stringify(row)}>
            {columns.map(c => (
              <td key={c.key} style={{ border: '1px solid #ddd', padding: 8 }}>{c.render ? c.render(row) : (row as any)[c.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
