import React, { useState, useEffect } from "react";
import { useDashboard } from "../../context/DashboardContext";
import { Card, EmptyState, Button } from "../common";
import { fetchTableData } from "../../api/connections";
import { EditRowDrawer } from "./EditRowDrawer";

export const TableDataGrid: React.FC = () => {
    const { selectedClusterId, selectedDatabaseId, selectedSchemaId, tableDefinition, addToast } = useDashboard();
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selectedRow, setSelectedRow] = useState<any | null>(null);

    useEffect(() => {
        if (!selectedClusterId || !selectedSchemaId || !tableDefinition?.tableName) {
            setData([]);
            return;
        }

        let isMounted = true;
        const load = async () => {
            setLoading(true);
            setIsDrawerOpen(false);
            setSelectedRow(null);
            try {
                const rows = await fetchTableData(selectedClusterId, selectedSchemaId, tableDefinition.tableName, selectedDatabaseId);
                if (isMounted) {
                    setData(rows);
                }
            } catch (err) {
                if (isMounted) {
                    setData([]);
                    addToast("error", "Failed to load table data");
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        load();
        return () => { isMounted = false; };
    }, [selectedClusterId, selectedDatabaseId, selectedSchemaId, tableDefinition?.tableName, addToast]);

    if (loading) {
        return (
            <Card>
                <EmptyState title="Loading Data" description="Fetching database rows..." />
            </Card>
        );
    }

    if (data.length === 0) {
        return (
            <Card>
                <EmptyState title="No Data" description="There are no records in this table or data cannot be previewed." />
            </Card>
        );
    }

    const columns = Object.keys(data[0]);

    const handleEditClick = (row: any) => {
        setSelectedRow(row);
        setIsDrawerOpen(true);
    };

    const handleDrawerClose = () => {
        setIsDrawerOpen(false);
        setSelectedRow(null);
    };

    const handleDrawerSuccess = () => {
        addToast("success", "Change request submitted successfully. It is pending architect review.");
    };

    return (
        <Card title="Data Preview & Editor" subtitle={`${data.length} rows (Top 100 max)`} noPadding>
            <div className="overflow-x-auto max-h-96 w-full">
                <table className="w-full whitespace-nowrap min-w-max">
                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                        <tr className="border-b border-slate-200">
                            <th className="px-4 py-3 text-left w-32 border-r border-slate-200 bg-slate-50 sticky left-0 z-20 font-semibold text-slate-600 text-xs tracking-wide">
                                Actions
                            </th>
                            {columns.map((col) => (
                                <th key={col} className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, i) => {
                            return (
                                <tr key={i} className={`border-b border-slate-50 transition-colors hover:bg-slate-50`}>
                                    <td className="px-4 py-3 align-middle border-r border-slate-100 bg-white sticky left-0 z-10 drop-shadow-sm">
                                        <Button size="sm" variant="outline" onClick={() => handleEditClick(row)}>Edit</Button>
                                    </td>
                                    {columns.map((col) => (
                                        <td key={col} className={`px-4 py-3 text-sm text-slate-700 font-mono`} onClick={() => handleEditClick(row)}>
                                            {row[col] !== null ? (
                                                String(row[col])
                                            ) : (
                                                <span className="text-slate-400 italic">null</span>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            
            <EditRowDrawer
                isOpen={isDrawerOpen}
                onClose={handleDrawerClose}
                rowData={selectedRow}
                columns={columns.map(c => ({ name: c, isPrimaryKey: c.toLowerCase() === 'id' }))}
                tableName={tableDefinition?.tableName || ''}
                connectionId={selectedClusterId || ''}
                databaseName={selectedDatabaseId || undefined}
                schemaName={selectedSchemaId || undefined}
                onSuccess={handleDrawerSuccess}
            />
        </Card>
    );
};
