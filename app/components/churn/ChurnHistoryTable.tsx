'use client';

import { CHURN_COLUMNS, formatChurnDate, formatChurnFee } from '@/app/config/churnSheet';
import type { ChurnRecordView } from '@/app/types/client';

type Props = {
  records: ChurnRecordView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function ChurnHistoryTable({ records, selectedId, onSelect }: Props) {
  if (records.length === 0) {
    return (
      <p className="text-sm text-gray-500 rounded-xl border border-gray-100 bg-white px-4 py-8 text-center">
        유출 이력이 없습니다.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <div className="overflow-x-auto max-h-[calc(100vh-20rem)] overflow-y-auto">
        <table className="w-full min-w-[52rem] text-sm border-collapse">
          <thead className="sticky top-0 z-20">
            <tr className="bg-red-50 border-b border-red-100">
              {CHURN_COLUMNS.map(col => (
                <th
                  key={col.key}
                  className={`px-2 py-2 text-left text-[10px] font-bold text-red-800 whitespace-nowrap ${
                    col.sticky ? 'sticky left-0 z-30 bg-red-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]' : ''
                  }`}
                  style={{ minWidth: col.width }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map(record => {
              const active = record.id === selectedId;
              return (
                <tr
                  key={record.id}
                  onClick={() => onSelect(record.id)}
                  className={`border-b border-gray-50 cursor-pointer transition-colors ${
                    active ? 'bg-red-50' : 'hover:bg-gray-50'
                  }`}
                >
                  {CHURN_COLUMNS.map(col => {
                    const cellCls = `px-2 py-2 text-xs whitespace-nowrap max-w-[10rem] truncate ${
                      col.sticky
                        ? `sticky left-0 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] ${active ? 'bg-red-50' : 'bg-white'}`
                        : ''
                    }`;

                    let value = '-';
                    switch (col.key) {
                      case 'companyName':
                        value = record.companyName;
                        break;
                      case 'churnedAt':
                        value = formatChurnDate(record.churnedAt);
                        break;
                      case 'feeAmount':
                        value = formatChurnFee(record.feeAmount);
                        break;
                      case 'dataCleanup':
                        value = record.dataCleanup || '-';
                        break;
                      case 'churnType':
                        value = record.churnType || '-';
                        break;
                      case 'earlySign':
                        value = record.earlySign || '-';
                        break;
                      case 'reason':
                        value = record.reason || '-';
                        break;
                      case 'manager':
                        value = record.manager || '-';
                        break;
                    }

                    return (
                      <td key={col.key} className={cellCls} title={value}>
                        <span className={col.key === 'companyName' ? 'font-bold text-gray-900' : 'text-gray-700'}>
                          {value}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
