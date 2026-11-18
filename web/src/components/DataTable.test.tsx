import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../i18n/lang';
import { downloadCsv, toCsv } from '../lib/download';
import { findMatch, fold, matchRank } from '../lib/textMatch';
import { DataTable, type DataColumn } from './DataTable';

vi.mock('../lib/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/download')>()),
  downloadCsv: vi.fn(),
}));

interface Row {
  id: string;
  name: string;
  chunks: number | null;
}

const ROWS: Row[] = [
  { id: 'b', name: 'Özgün graph networks', chunks: 12 },
  { id: 'a', name: 'Alpha retrieval', chunks: null },
  { id: 'c', name: 'Climate models', chunks: 40 },
];

const COLUMNS: DataColumn<Row>[] = [
  { id: 'name', header: 'Name', rowHeader: true, sortValue: (r) => r.name, cell: (r) => r.name },
  { id: 'chunks', header: 'Chunks', numeric: true, firstDir: 'desc', sortValue: (r) => r.chunks, cell: (r) => r.chunks ?? '—' },
  { id: 'note', header: 'Note', cell: () => 'n/a' },
];

const searchText = (r: Row) => `${r.id} ${r.name}`;

function renderTable(extra: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  const user = userEvent.setup();
  render(
    <DataTable<Row>
      rows={ROWS}
      columns={COLUMNS}
      rowKey={(r) => r.id}
      caption="Test rows"
      searchLabel="Search rows"
      searchText={searchText}
      {...extra}
    />,
  );
  return { user };
}

/** The row-header text of every body row, in order. */
const order = () =>
  within(screen.getByRole('table'))
    .getAllByRole('rowheader')
    .map((c) => c.textContent);

describe('DataTable', () => {
  it('is a captioned table whose sortable headers are buttons with aria-sort', async () => {
    const { user } = renderTable({ initialSort: { column: 'name', dir: 'asc' } });
    const table = screen.getByRole('table', { name: /Test rows, sorted by Name, ascending/ });
    expect(order()).toEqual(['Alpha retrieval', 'Climate models', 'Özgün graph networks']);

    const nameHeader = within(table).getByRole('columnheader', { name: 'Name' });
    const chunksHeader = within(table).getByRole('columnheader', { name: 'Chunks' });
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
    // Only the sorted column says so; the others carry no aria-sort at all.
    expect(chunksHeader).not.toHaveAttribute('aria-sort');
    // An unsortable column has no button and no aria-sort.
    const note = within(table).getByRole('columnheader', { name: 'Note' });
    expect(note).not.toHaveAttribute('aria-sort');
    expect(within(note).queryByRole('button')).not.toBeInTheDocument();

    await user.click(within(nameHeader).getByRole('button', { name: 'Name' }));
    expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
    expect(order()).toEqual(['Özgün graph networks', 'Climate models', 'Alpha retrieval']);

    // A numeric column starts high-to-low; missing values sort last both ways.
    await user.click(within(chunksHeader).getByRole('button', { name: 'Chunks' }));
    expect(chunksHeader).toHaveAttribute('aria-sort', 'descending');
    expect(nameHeader).not.toHaveAttribute('aria-sort');
    expect(order()).toEqual(['Climate models', 'Özgün graph networks', 'Alpha retrieval']);
    await user.click(within(chunksHeader).getByRole('button', { name: 'Chunks' }));
    expect(chunksHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(order()).toEqual(['Özgün graph networks', 'Climate models', 'Alpha retrieval']);
  });

  it('right-aligns numeric columns', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: 'Chunks' })).toHaveAttribute('data-numeric', 'true');
    expect(screen.getByRole('cell', { name: '40' })).toHaveAttribute('data-numeric', 'true');
  });

  it('filters as you type, ignoring case and accents, with a live count', async () => {
    const { user } = renderTable();
    const count = screen.getByRole('status');
    expect(count).toHaveTextContent('3 rows');

    await user.type(screen.getByRole('searchbox', { name: 'Search rows' }), 'OZGUN');
    expect(order()).toEqual(['Özgün graph networks']);
    expect(count).toHaveTextContent('1 of 3');
    expect(screen.getByRole('table', { name: /filtered by “OZGUN”/ })).toBeInTheDocument();
  });

  it('shows an empty state that clears the search when nothing matches', async () => {
    const { user } = renderTable();
    const search = screen.getByRole('searchbox', { name: 'Search rows' });
    await user.type(search, 'zzz');
    expect(screen.getByText('Nothing matches “zzz”')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0 of 3');

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
    expect(order()).toHaveLength(3);
  });

  it('Escape in the search box clears it', async () => {
    const { user } = renderTable();
    const search = screen.getByRole('searchbox', { name: 'Search rows' });
    await user.type(search, 'clim{Escape}');
    expect(search).toHaveValue('');
  });

  it('exports the rows shown, in the order shown, as CSV', async () => {
    const { user } = renderTable({
      initialSort: { column: 'name', dir: 'desc' },
      csv: {
        filename: 'rows.csv',
        columns: [
          { header: 'Id', value: (r) => r.id },
          { header: 'Chunks', value: (r) => r.chunks },
        ],
      },
    });
    await user.type(screen.getByRole('searchbox', { name: 'Search rows' }), 'o');
    await user.click(screen.getByRole('button', { name: 'Export the 2 rows shown as CSV' }));
    expect(downloadCsv).toHaveBeenCalledWith('rows.csv', ['Id', 'Chunks'], [
      ['b', 12],
      ['c', 40],
    ]);
  });

  it('calls onRowClick for clicks on the row, not on its buttons', async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    render(
      <DataTable<Row>
        rows={ROWS}
        columns={[...COLUMNS, { id: 'act', header: 'Actions', headerHidden: true, cell: (r) => <button type="button">Act {r.id}</button> }]}
        rowKey={(r) => r.id}
        caption="Rows"
        searchLabel="Search"
        searchText={searchText}
        onRowClick={onRowClick}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Act a' }));
    expect(onRowClick).not.toHaveBeenCalled();
    await user.click(screen.getByRole('cell', { name: '40' }));
    expect(onRowClick).toHaveBeenCalledWith(ROWS[2]);
  });

  it('speaks Turkish', async () => {
    const user = userEvent.setup();
    render(
      <LangProvider initial="tr">
        <DataTable<Row>
          rows={ROWS}
          columns={COLUMNS}
          rowKey={(r) => r.id}
          caption="Satırlar"
          searchLabel="Satır ara"
          searchText={searchText}
          initialSort={{ column: 'chunks', dir: 'desc' }}
          csv={{ filename: 'x.csv', columns: [] }}
        />
      </LangProvider>,
    );
    expect(screen.getByRole('table', { name: 'Satırlar, Chunks sütununa göre azalan sıralı' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('3 satır');
    expect(screen.getByRole('button', { name: 'Gösterilen 3 satırı CSV olarak dışa aktar' })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Satır ara' }), 'qq');
    expect(screen.getByText('“qq” için sonuç yok')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aramayı temizle' })).toBeInTheDocument();
  });
});

describe('toCsv', () => {
  it('quotes, doubles quotes, keeps numbers as numbers and defuses spreadsheet formulas', () => {
    const csv = toCsv(
      ['Title', 'Score', 'Note'],
      [
        ['Graphs, "fast" ones', 0.5, null],
        ['=HYPERLINK("x")', -1, 'line\nbreak'],
        ['-dash', 3, true],
      ],
    );
    expect(csv).toBe(
      'Title,Score,Note\r\n"Graphs, ""fast"" ones",0.5,\r\n"\'=HYPERLINK(""x"")",-1,"line\nbreak"\r\n\'-dash,3,true\r\n',
    );
  });
});

describe('text matching', () => {
  it('folds case, accents and the Turkish i', () => {
    expect(fold('  İstanbul  ÖZGÜN ışık ')).toBe('istanbul ozgun isik');
    expect(matchRank('Graph attention networks', 'att')).toBe(1);
    expect(matchRank('Graph attention networks', 'gra')).toBe(0);
    expect(matchRank('Graph attention networks', 'tion')).toBe(2);
    expect(matchRank('Graph attention networks', 'xyz')).toBeNull();
  });

  it('maps a folded match back to the original characters', () => {
    const text = 'Özgün İddia';
    const m = findMatch(text, 'ozgun i');
    expect(m).not.toBeNull();
    expect(text.slice(m!.start, m!.end)).toBe('Özgün İ');
  });
});
