import React, { useState, useEffect } from "react";
import { useDashboard } from "../../context/DashboardContext";
import { Card, EmptyState, Button } from "../common";
import { fetchTableData, updateTableData } from "../../api/connections";

export const TableDataGrid: React.FC = () => {
    const { selectedClusterId, selectedDatabaseId, selectedSchemaId, tableDefinition, addToast } = useDashboard();
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
    const [editedRowData, setEditedRowData] = useState<any | null>(null);

    useEffect(() => {
        if (!selectedClusterId || !selectedSchemaId || !tableDefinition?.tableName) {
            setData([]);
            return;
        }

        let isMounted = true;
        const load = async () => {
            setLoading(true);
            setEditingRowIndex(null);
            setEditedRowData(null);
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
    }, [selectedClusterId, selectedSchemaId, tableDefinition?.tableName, addToast]);

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

    const handleEditClick = (index: number, row: any) => {
        setEditingRowIndex(index);
        setEditedRowData({ ...row });
    };

    const handleCancelEdit = () => {
        setEditingRowIndex(null);
        setEditedRowData(null);
    };

    const handleSaveRow = async (index: number) => {
        if (!selectedClusterId || !selectedSchemaId || !tableDefinition?.tableName) return;
        try {
            await updateTableData(selectedClusterId, selectedSchemaId, tableDefinition.tableName, data[index], editedRowData, selectedDatabaseId);

            const newData = [...data];
            newData[index] = editedRowData;
            setData(newData);

            addToast("success", "Row updated successfully!");
            setEditingRowIndex(null);
            setEditedRowData(null);
        } catch (err) {
            addToast("error", "Failed to update row. Make sure changes match data types and constraints.");
            console.error(err);
        }
    };

    const handleInputChange = (col: string, val: string) => {
        setEditedRowData((prev: any) => ({ ...prev, [col]: val }));
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
                            const isEditing = editingRowIndex === i;
                            return (
                                <tr key={i} className={`border-b border-slate-50 transition-colors ${isEditing ? "bg-amber-50" : "hover:bg-slate-50"}`}>
                                    <td className="px-4 py-3 align-middle border-r border-slate-100 bg-white sticky left-0 z-10 drop-shadow-sm">
                                        {isEditing ? (
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="primary" onClick={() => handleSaveRow(i)}>Save</Button>
                                                <Button size="sm" variant="ghost" onClick={handleCancelEdit}>Cancel</Button>
                                            </div>
                                        ) : (
                                            <Button size="sm" variant="outline" onClick={() => handleEditClick(i, row)}>Edit</Button>
                                        )}
                                    </td>
                                    {columns.map((col) => (
                                        <td key={col} className={`px-4 py-3 text-sm text-slate-700 font-mono ${isEditing ? "p-2" : ""}`}>
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    className="w-full min-w-32 px-3 py-1.5 text-sm border border-slate-300 rounded shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    value={editedRowData[col] !== null ? editedRowData[col] : ""}
                                                    onChange={(e) => handleInputChange(col, e.target.value)}
                                                />
                                            ) : row[col] !== null ? (
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
        </Card>
    );
};
