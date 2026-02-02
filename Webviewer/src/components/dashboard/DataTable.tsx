import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ChevronDown, ChevronUp, ChevronsUpDown, Search, Filter } from 'lucide-react';

export interface Column<T> {
    key: keyof T;
    label: string;
    sortable?: boolean;
    render?: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    searchKey?: keyof T; // Simple search on one column
}

export function DataTable<T extends { id: string | number }>({ data, columns, searchKey }: DataTableProps<T>) {
    const [sortConfig, setSortConfig] = useState<{ key: keyof T; direction: 'asc' | 'desc' } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Filtering
    const filteredData = React.useMemo(() => {
        if (!searchTerm || !searchKey) return data;
        return data.filter((item) => {
            const value = item[searchKey];
            return String(value).toLowerCase().includes(searchTerm.toLowerCase());
        });
    }, [data, searchTerm, searchKey]);

    // Sorting
    const sortedData = React.useMemo(() => {
        if (!sortConfig) return filteredData;
        return [...filteredData].sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredData, sortConfig]);

    const requestSort = (key: keyof T) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                {searchKey && (
                    <div className="flex items-center py-4 relative max-w-sm w-full">
                        <Search className="absolute left-3 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Zoeken..."
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            className="pl-9"
                        />
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {columns.map((col) => (
                                <TableHead key={String(col.key)}>
                                    {col.sortable ? (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="-ml-3 h-8 data-[state=open]:bg-accent"
                                            onClick={() => requestSort(col.key)}
                                        >
                                            <span>{col.label}</span>
                                            {sortConfig?.key === col.key ? (
                                                sortConfig.direction === 'asc' ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />
                                            ) : (
                                                <ChevronsUpDown className="h-4 w-4 ml-2" />
                                            )}
                                        </Button>
                                    ) : (
                                        col.label
                                    )}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedData.length > 0 ? (
                            sortedData.map((row) => (
                                <TableRow key={row.id}>
                                    {columns.map((col) => (
                                        <TableCell key={`${row.id}-${String(col.key)}`}>
                                            {col.render ? col.render(row) : (row[col.key] as React.ReactNode)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center">
                                    Geen resultaten gevonden.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Simple Footer/Pagination info */}
            <div className="text-xs text-muted-foreground">
                Totaal {sortedData.length} items
            </div>
        </div>
    );
}
