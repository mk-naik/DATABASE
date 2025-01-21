import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, Eye, Save, AlertTriangle, Download, ChevronUp, ChevronDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import _ from 'lodash';

const BarcodeSystem = () => {
  // Shared state
  const [barcodes, setBarcodes] = useState([]);
  const [error, setError] = useState('');
  
  // Manager view state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [selectedBarcodes, setSelectedBarcodes] = useState(new Set());
  const [bulkEdit, setBulkEdit] = useState({
    active: false,
    allocationDate: '',
    pdiDate: '',
    indentNumber: ''
  });

  // Upload form state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadData, setUploadData] = useState({
    fileData: null,
    formData: {
      customerName: '',
      allocationDate: '',
      pdiDate: '',
      indentNumber: '',
    },
    validationErrors: [],
    duplicates: [],
    uploadTime: new Date().toISOString()
  });

  // Barcode validation patterns
  const barcodePatterns = {
    'ICON-17': /^ICON\d{13}$/,
    'ICON-18': /^ICON\d{3}[A-Z]\d{10}$/,
    'ICON-20': /^ICON\d{5}[A-Z]\d{10}$/
  };

  const validateBarcode = (barcode) => {
    return Object.values(barcodePatterns).some(pattern => pattern.test(barcode));
  };

  const extractCustomerName = (filename, heading) => {
    let customerName = '';
    if (heading) {
      const headingMatch = heading.match(/\d+W\s*-\s*\d+\s*NOS\s*(.*)/);
      if (headingMatch) {
        customerName = headingMatch[1].trim();
      }
    }
    if (!customerName && filename) {
      const filenameMatch = filename.match(/\d+W\s*-?\s*\d+\s*NOS\s*(.*?)\.(xlsx|xls)$/i);
      if (filenameMatch) {
        customerName = filenameMatch[1].trim();
      }
    }
    return customerName;
  };

  const findBarcodes = (sheet) => {
    const barcodes = new Set();
    const invalidBarcodes = [];
    const duplicateBarcodes = [];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[cellAddress];
        
        if (cell && cell.v && typeof cell.v === 'string' && cell.v.startsWith('ICON')) {
          const barcode = cell.v.trim();
          if (!validateBarcode(barcode)) {
            invalidBarcodes.push({ barcode, cell: cellAddress });
            continue;
          }
          if (barcodes.has(barcode)) {
            duplicateBarcodes.push({ barcode, cell: cellAddress });
          } else {
            barcodes.add(barcode);
          }
        }
      }
    }
    
    return {
      validBarcodes: Array.from(barcodes),
      invalidBarcodes,
      duplicateBarcodes
    };
  };

  const handleUploadFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, {
        type: 'array',
        cellDates: true,
        cellStyles: true,
      });

      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const heading = firstSheet['A1']?.v || '';
      const customerName = extractCustomerName(file.name, heading);
      const { validBarcodes, invalidBarcodes, duplicateBarcodes } = findBarcodes(firstSheet);

      setUploadData(prev => ({
        ...prev,
        fileData: file.name,
        barcodes: validBarcodes,
        validationErrors: invalidBarcodes,
        duplicates: duplicateBarcodes,
        formData: {
          ...prev.formData,
          customerName
        }
      }));
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadInputChange = (e) => {
    const { name, value } = e.target;
    setUploadData(prev => ({
      ...prev,
      formData: {
        ...prev.formData,
        [name]: value
      }
    }));
  };

  const handleUploadSubmit = () => {
    const { formData, barcodes: newBarcodes, uploadTime } = uploadData;
    
    if (!formData.customerName.trim() || !formData.allocationDate) {
      setError('Required fields are missing');
      return;
    }

    const newEntries = newBarcodes.map(barcode => ({
      barcode,
      customerName: formData.customerName,
      allocationDate: formData.allocationDate,
      pdiDate: formData.pdiDate,
      indentNumber: formData.indentNumber,
      timestamp: uploadTime
    }));

    setBarcodes(prev => [...prev, ...newEntries]);
    setIsUploadOpen(false);
    setUploadData({
      fileData: null,
      formData: {
        customerName: '',
        allocationDate: '',
        pdiDate: '',
        indentNumber: '',
      },
      validationErrors: [],
      duplicates: [],
      uploadTime: new Date().toISOString()
    });
  };

  // Manager functions
  const updateBarcodeDetails = (barcode, field, value) => {
    setBarcodes(prev => prev.map(item => 
      item.barcode === barcode ? { ...item, [field]: value } : item
    ));
  };

  const handleBulkEdit = () => {
    setBarcodes(prev => prev.map(item => {
      if (selectedBarcodes.has(item.barcode)) {
        return {
          ...item,
          ...(bulkEdit.allocationDate && { allocationDate: bulkEdit.allocationDate }),
          ...(bulkEdit.pdiDate && { pdiDate: bulkEdit.pdiDate }),
          ...(bulkEdit.indentNumber && { indentNumber: bulkEdit.indentNumber })
        };
      }
      return item;
    }));
    setBulkEdit({ active: false, allocationDate: '', pdiDate: '', indentNumber: '' });
    setSelectedBarcodes(new Set());
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const exportData = () => {
    const ws = XLSX.utils.json_to_sheet(barcodes.map(item => ({
      Barcode: item.barcode,
      'Customer Name': item.customerName,
      'Allocation Date': item.allocationDate,
      'PDI Date': item.pdiDate,
      'Indent Number': item.indentNumber,
      'Upload Time': new Date(item.timestamp).toLocaleString()
    })));
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Barcodes');
    XLSX.writeFile(wb, 'barcode_database_export.xlsx');
  };

  const filteredBarcodes = barcodes.filter(item => 
    item.barcode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedBarcodes = _.orderBy(
    filteredBarcodes,
    [sortConfig.key || 'timestamp'],
    [sortConfig.direction]
  );

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {/* Header with title and actions */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Barcode Database Manager</h1>
        <div className="flex gap-2">
          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger asChild>
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                <Upload size={16} />
                Upload New
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Upload Barcodes</DialogTitle>
              </DialogHeader>
              <div className="mt-4">
                {/* Upload Form Content */}
                <div className="mb-6">
                  <label className="block mb-2 text-sm font-medium">Upload Excel File</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg cursor-pointer hover:bg-blue-600">
                      <Upload size={20} />
                      Choose File
                      <input
                        type="file"
                        className="hidden"
                        accept=".xlsx,.xls"
                        onChange={handleUploadFileSelect}
                      />
                    </label>
                    {uploadData.fileData && (
                      <span className="text-sm text-gray-600">{uploadData.fileData}</span>
                    )}
                  </div>
                </div>

                {/* Validation Errors */}
                {(uploadData.validationErrors.length > 0 || uploadData.duplicates.length > 0) && (
                  <Alert variant="destructive" className="mb-6">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="mt-2">
                        {uploadData.validationErrors.length > 0 && (
                          <div className="mb-2">
                            <strong>Invalid Barcodes:</strong>
                            <ul className="list-disc pl-5">
                              {uploadData.validationErrors.slice(0, 5).map((error, idx) => (
                                <li key={idx} className="text-sm">
                                  {error.barcode} (Cell: {error.cell})
                                </li>
                              ))}
                              {uploadData.validationErrors.length > 5 && (
                                <li>... and {uploadData.validationErrors.length - 5} more</li>
                              )}
                            </ul>
                          </div>
                        )}
                        {uploadData.duplicates.length > 0 && (
                          <div>
                            <strong>Duplicate Barcodes:</strong>
                            <ul className="list-disc pl-5">
                              {uploadData.duplicates.slice(0, 5).map((dup, idx) => (
                                <li key={idx} className="text-sm">
                                  {dup.barcode} (Cell: {dup.cell})
                                </li>
                              ))}
                              {uploadData.duplicates.length > 5 && (
                                <li>... and {uploadData.duplicates.length - 5} more</li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Form Fields */}
                {uploadData.fileData && (
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="block mb-2 text-sm font-medium">
                        Customer Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="customerName"
                        value={uploadData.formData.customerName}
                        onChange={handleUploadInputChange}
                        className="w-full p-2 border rounded"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-2 text-sm font-medium">
                        Allocation Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        name="allocationDate"
                        value={uploadData.formData.allocationDate}
                        onChange={handleUploadInputChange}
                        className="w-full p-2 border rounded"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-2 text-sm font-medium">PDI Date</label>
                      <input
                        type="date"
                        name="pdiDate"
                        value={uploadData.formData.pdiDate}
                        onChange={handleUploadInputChange}
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block mb-2 text-sm font-medium">Indent Number</label>
                      <input
                        type="text"
                        name="indentNumber"
                        value={uploadData.formData.indentNumber}
                        onChange={handleUploadInputChange}
                        className="w-full p-2 border rounded"
                      />
                    </div>
                  </div>
                )}

                {/* Preview Section */}
                {uploadData.barcodes?.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Eye size={20} />
                      <h3 className="font-medium">Data Preview</h3>
                    </div>
                    <div className="max-h-48 overflow-y-auto border rounded p-4">
                      <p>Total Valid Barcodes: {uploadData.barcodes.length}</p>
                      <p>First Few Barcodes:</p>
                      <ul className="list-disc pl-5">
                        {uploadData.barcodes.slice(0, 5).map((barcode, index) => (
                          <li key={index} className="text-sm text-gray-600">{barcode}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                {uploadData.fileData && (
                  <button
                    onClick={handleUploadSubmit}
                    disabled={
                      uploadData.validationErrors.length > 0 || 
                      uploadData.duplicates.length > 0 || 
                      !uploadData.formData.customerName.trim() || 
                      !uploadData.formData.allocationDate
                    }
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                      uploadData.validationErrors.length > 0 || uploadData.duplicates.length > 0
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-green-500 hover:bg-green-600'
                    } text-white`}
                  >
                    <Save size={20} />
                    Upload to Database
                  </button>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <button
            onClick={exportData}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search barcodes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 border rounded"
        />
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Bulk Edit Panel */}
      {selectedBarcodes.size > 0 && (
        <div className="mb-4 p-4 bg-gray-50 rounded">
          <h3 className="font-semibold mb-2">Bulk Edit ({selectedBarcodes.size} selected)</h3>
          <div className="grid grid-cols-4 gap-4">
            <input
              type="date"
              placeholder="Allocation Date"
              value={bulkEdit.allocationDate}
              onChange={(e) => setBulkEdit(prev => ({ ...prev, allocationDate: e.target.value }))}
              className="p-2 border rounded"
            />
            <input
              type="date"
              placeholder="PDI Date"
              value={bulkEdit.pdiDate}
              onChange={(e) => setBulkEdit(prev => ({ ...prev, pdiDate: e.target.value }))}
              className="p-2 border rounded"
            />
            <input
              type="text"
              placeholder="Indent Number"
              value={bulkEdit.indentNumber}
              onChange={(e) => setBulkEdit(prev => ({ ...prev, indentNumber: e.target.value }))}
              className="p-2 border rounded"
            />
            <button
              onClick={handleBulkEdit}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Apply to Selected
            </button>
          </div>
        </div>
      )}

      {/* Statistics */}
      <div className="mb-4 bg-gray-50 p-4 rounded">
        <p>Total Barcodes: {barcodes.length} | Filtered: {filteredBarcodes.length}</p>
      </div>

      {/* Barcodes Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 w-8">
                <input
                  type="checkbox"
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedBarcodes(new Set(filteredBarcodes.map(b => b.barcode)));
                    } else {
                      setSelectedBarcodes(new Set());
                    }
                  }}
                />
              </th>
              {['Barcode', 'Customer Name', 'Allocation Date', 'PDI Date', 'Indent Number', 'Upload Time'].map(header => (
                <th 
                  key={header}
                  className="p-2 text-left cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort(header.toLowerCase().replace(/\s+/g, ''))}
                >
                  <div className="flex items-center gap-1">
                    {header}
                    {sortConfig.key === header.toLowerCase().replace(/\s+/g, '') && (
                      sortConfig.direction === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedBarcodes.map((item, index) => (
              <tr key={index} className="border-t hover:bg-gray-50">
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selectedBarcodes.has(item.barcode)}
                    onChange={(e) => {
                      const newSelected = new Set(selectedBarcodes);
                      if (e.target.checked) {
                        newSelected.add(item.barcode);
                      } else {
                        newSelected.delete(item.barcode);
                      }
                      setSelectedBarcodes(newSelected);
                    }}
                  />
                </td>
                <td className="p-2 font-mono">{item.barcode}</td>
                <td className="p-2">
                  <input
                    type="text"
                    value={item.customerName}
                    onChange={(e) => updateBarcodeDetails(item.barcode, 'customerName', e.target.value)}
                    className="w-full p-1 border rounded"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="date"
                    value={item.allocationDate}
                    onChange={(e) => updateBarcodeDetails(item.barcode, 'allocationDate', e.target.value)}
                    className="w-full p-1 border rounded"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="date"
                    value={item.pdiDate}
                    onChange={(e) => updateBarcodeDetails(item.barcode, 'pdiDate', e.target.value)}
                    className="w-full p-1 border rounded"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={item.indentNumber}
                    onChange={(e) => updateBarcodeDetails(item.barcode, 'indentNumber', e.target.value)}
                    className="w-full p-1 border rounded"
                  />
                </td>
                <td className="p-2 text-sm text-gray-600">
                  {new Date(item.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BarcodeSystem;