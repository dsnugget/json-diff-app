import React, { useState, useRef, useCallback, useEffect } from 'react';
import { diff_match_patch } from 'diff-match-patch';
import { Container, Row, Col, Form, Button, Card, Nav, Dropdown, Toast, ToastContainer, OverlayTrigger, Tooltip, Modal } from 'react-bootstrap';
import AceEditor from 'react-ace';
import ace from 'ace-builds';
import { FaCopy, FaCode, FaSitemap, FaTextWidth, FaExpand, FaCompress, FaFileCode, FaPlus, FaMinus, FaPaintBrush, FaPalette, FaQuestionCircle, FaTimes, FaCheck } from 'react-icons/fa';
import { unescapeString, parseRecursive } from './utils';
import { init, compress, decompress } from '@bokuweb/zstd-wasm';
import Header from './Header';
import Footer from './Footer';
import JsonTreeView from './JsonTreeView';

import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-dracula';
import 'ace-builds/src-noconflict/ext-searchbox';

ace.config.setModuleUrl('ace/mode/json_worker', '/static/js/worker-json.js');

function getDiffLines(leftLines, rightLines, leftMarkers, rightMarkers) {
  const maxLen = Math.max(leftLines.length, rightLines.length);
  const leftMarkerRows = new Set(leftMarkers.map(m => m.startRow));
  const rightMarkerRows = new Set(rightMarkers.map(m => m.startRow));
  const lines = [];
  for (let i = 0; i < maxLen; i++) {
    const left = leftLines[i] || '';
    const right = rightLines[i] || '';
    const leftClass = leftMarkerRows.has(i) ? 'diff-removed' : '';
    const rightClass = rightMarkerRows.has(i) ? 'diff-added' : '';
    lines.push({ left, right, leftClass, rightClass });
  }
  return lines;
}

function hasDiff(leftMarkers, rightMarkers) {
  return (leftMarkers && leftMarkers.length > 0) || (rightMarkers && rightMarkers.length > 0);
}

function getDiffHunks(leftLines, rightLines, leftMarkers, rightMarkers, context = 3) {
  // Returns an array of { type: 'hunk', start, end } or { type: 'collapsed', start, end }
  // where start/end are line indices
  const maxLen = Math.max(leftLines.length, rightLines.length);
  const diffRows = new Set([
    ...leftMarkers.map(m => m.startRow),
    ...rightMarkers.map(m => m.startRow),
  ]);
  let hunks = [];
  let i = 0;
  while (i < maxLen) {
    // Find next diff
    while (i < maxLen && !diffRows.has(i)) i++;
    if (i >= maxLen) break;
    // Start of hunk
    let hunkStart = Math.max(0, i - context);
    // Find end of hunk
    let hunkEnd = i;
    while (hunkEnd < maxLen && (diffRows.has(hunkEnd) || hunkEnd - i < context)) hunkEnd++;
    // Expand hunkEnd to include context after
    hunkEnd = Math.min(maxLen, hunkEnd + context);
    // Merge with previous hunk if overlapping
    if (hunks.length && hunks[hunks.length - 1].end >= hunkStart) {
      hunks[hunks.length - 1].end = hunkEnd;
    } else {
      hunks.push({ type: 'hunk', start: hunkStart, end: hunkEnd });
    }
    i = hunkEnd;
  }
  // Add collapsed sections
  let result = [];
  let lastEnd = 0;
  hunks.forEach((hunk, idx) => {
    if (hunk.start > lastEnd) {
      result.push({ type: 'collapsed', start: lastEnd, end: hunk.start });
    }
    result.push(hunk);
    lastEnd = hunk.end;
  });
  if (lastEnd < maxLen) {
    result.push({ type: 'collapsed', start: lastEnd, end: maxLen });
  }
  return result;
}

const App = () => {
  const [json1, setJson1] = useState('');
  const [json2, setJson2] = useState('');
  const [diff, setDiff] = useState(null);
  const [error, setError] = useState('');
  const [ignoreArrayOrder, setIgnoreArrayOrder] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [activeTab, setActiveTab] = useState('format');
  const [formatInput, setFormatInput] = useState('');
  const [formattedOutput, setFormattedOutput] = useState('');
  const [sampleJson, setSampleJson] = useState(JSON.stringify({
    "id": "0001",
    "type": "donut",
    "name": "Cake",
    "ppu": 0.55,
    "batters": {
      "batter": [
        { "id": "1001", "type": "Regular" },
        { "id": "1002", "type": "Chocolate" },
        { "id": "1003", "type": "Blueberry" },
        { "id": "1004", "type": "Devil's Food" }
      ]
    },
    "topping": [
      { "id": "5001", "type": "None" },
      { "id": "5002", "type": "Glazed" },
      { "id": "5005", "type": "Sugar" },
      { "id": "5007", "type": "Powdered" },
      { "id": "5006", "type": "Chocolate with Sprinkles" },
      { "id": "5003", "type": "Chocolate" },
      { "id": "5004", "type": "Maple" }
    ]
  }, null, 2));
  const [formattedViewMode, setFormattedViewMode] = useState('code'); // 'code' or 'tree'
  const [treeSearchTerm, setTreeSearchTerm] = useState('');
  const [formatError, setFormatError] = useState('');
  const [zstdInput, setZstdInput] = useState('');
  const [zstdOutput, setZstdOutput] = useState('');
  const [zstdError, setZstdError] = useState('');
  const [escapeInput, setEscapeInput] = useState('');
  const [unescapeOutput, setUnescapeOutput] = useState('');
  const [unescapeError, setUnescapeError] = useState('');
  const [compressInput, setCompressInput] = useState('');
  const [compressedOutput, setCompressedOutput] = useState('');
  const [compressError, setCompressError] = useState('');
  const [minifyInput, setMinifyInput] = useState('');
  const [minifiedOutput, setMinifiedOutput] = useState('');
  const [minifyError, setMinifyError] = useState('');
  const [validationInput, setValidationInput] = useState('');
  const [validationAnnotations, setValidationAnnotations] = useState([]);
  const [syncScroll, setSyncScroll] = useState(true);
  const [theme, setTheme] = useState('light');
  const [wrapTextEnabled, setWrapTextEnabled] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVariant, setToastVariant] = useState('success');
  const [expandedEditor, setExpandedEditor] = useState(null);

  // Add these to the top level of App, with other useState hooks
  const [jsonDiffInput1, setJsonDiffInput1] = useState('');
  const [jsonDiffInput2, setJsonDiffInput2] = useState('');
  const [jsonDiffResult, setJsonDiffResult] = useState(null);
  const [jsonDiffError, setJsonDiffError] = useState('');
  const [jsonDiffMarkers, setJsonDiffMarkers] = useState([]);

  // Add new state for side-by-side diff
  const [jsonDiffLeftLines, setJsonDiffLeftLines] = useState([]);
  const [jsonDiffRightLines, setJsonDiffRightLines] = useState([]);
  const [jsonDiffLeftMarkers, setJsonDiffLeftMarkers] = useState([]);
  const [jsonDiffRightMarkers, setJsonDiffRightMarkers] = useState([]);

  const [expandedSections, setExpandedSections] = useState(new Set());
  const [formatInputFontSize, setFormatInputFontSize] = useState(15);
  const [formatOutputFontSize, setFormatOutputFontSize] = useState(15);
  const [paintMode, setPaintMode] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#ff0000');
  const [annotations, setAnnotations] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const tabRefs = useRef({});

  const toggleWrapText = () => {
    setWrapTextEnabled((prev) => !prev);
  };

  const togglePaintMode = () => {
    setPaintMode(prev => !prev);
  };

  const handleColorSelect = (color) => {
    setSelectedColor(color);
  };

  const handleMouseDown = (event, editorName) => {
    if (!paintMode) return;
    
    setIsDrawing(true);
    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    setCurrentPath([{ x, y, color: selectedColor }]);
  };

  const handleMouseMove = (event, editorName) => {
    if (!paintMode || !isDrawing) return;
    
    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    setCurrentPath(prev => [...prev, { x, y, color: selectedColor }]);
  };

  const handleMouseUp = (event, editorName) => {
    if (!paintMode || !isDrawing) return;
    
    setIsDrawing(false);
    
    if (currentPath.length > 1) {
      const newAnnotation = {
        id: Date.now(),
        path: [...currentPath],
        editor: editorName,
        timestamp: new Date().toISOString()
      };
      
      setAnnotations(prev => [...prev, newAnnotation]);
    }
    
    setCurrentPath([]);
  };

  const clearAnnotations = () => {
    setAnnotations([]);
  };

  const leftEditorRef = useRef(null);
  const rightEditorRef = useRef(null);
  const isScrollingRef = useRef(false);
  // Add these for diff panel refs
  const diffLeftRef = useRef(null);
  const diffRightRef = useRef(null);

  const showNotification = (message, variant = 'success') => {
    setToastMessage(message);
    setToastVariant(variant);
    setShowToast(true);
  };

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      try {
        const decoded = atob(hash);
        const data = JSON.parse(decoded);
        if (data.json1) {
          setJson1(data.json1);
        }
        if (data.json2) {
          setJson2(data.json2);
        }
      } catch (e) {
        console.error('Error parsing hash:', e);
        showNotification('Error loading data from URL.', 'danger');
      }
    }
  }, []);

  useEffect(() => {
    document.body.className = theme;
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const handleCompare = () => {
    try {
      const parsedJson1 = JSON.parse(json1);
      const parsedJson2 = JSON.parse(json2);

      const sortedJson1 = JSON.stringify(sortObject(parsedJson1), null, 2).replace(/\r\n|\r/g, '\n');
      const sortedJson2 = JSON.stringify(sortObject(parsedJson2), null, 2).replace(/\r\n|\r/g, '\n');

      const dmp = new diff_match_patch();
      const diffs = dmp.diff_main(sortedJson1, sortedJson2);
      dmp.diff_cleanupSemantic(diffs);

      setDiff({ json1: sortedJson1, json2: sortedJson2, diffs });
      setError('');

      const data = { json1, json2 };
      const encoded = btoa(JSON.stringify(data));
      window.location.hash = encoded;
      showNotification('JSONs compared successfully!');
    } catch (e) {
      setError('Invalid JSON input. Please check your JSON and try again.');
      setDiff(null);
      showNotification('Error comparing JSONs: ' + e.message, 'danger');
    }
  };

  const handleFormat = () => {
    try {
      const parsedJson = JSON.parse(formatInput);
      setFormattedOutput(JSON.stringify(parsedJson, null, 2));
      setFormatError('');
      setError(''); // Clear general error
      showNotification('JSON formatted successfully!');
    } catch (e) {
      setFormatError(`Invalid JSON input: ${e.message}`);
      setFormattedOutput('');
      setError(''); // Clear general error
      showNotification(`Error formatting JSON: ${e.message}`, 'danger');
    }
  };

  const handleZstdDecompress = async () => {
    setZstdError('');
    setZstdOutput('');
    try {
      // Initialize Zstd WASM module
      await init();

      // Decode base64
      const binaryString = atob(zstdInput);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decompress Zstd using @bokuweb/zstd-wasm
      const decompressed = decompress(bytes);
      const decodedString = new TextDecoder().decode(decompressed);

      const parsedJson = JSON.parse(decodedString);
      setZstdOutput(JSON.stringify(parsedJson, null, 2));
      showNotification('Zstd decompressed successfully!');
    } catch (e) {
      setZstdError(`Decompression or JSON parsing error: ${e.message}`);
      showNotification(`Error decompressing Zstd: ${e.message}`, 'danger');
    }
  };

  const handleUnescapeJson = () => {
    setUnescapeError('');
    setUnescapeOutput('');
    try {
      const trimmedInput = escapeInput.trim();
      console.log('1. Original escapeInput:', escapeInput);
      console.log('2. Trimmed input:', trimmedInput);

      let parsedOutput;
      try {
        console.log('3. Attempting JSON.parse on trimmedInput:', trimmedInput);
        parsedOutput = JSON.parse(trimmedInput);
        console.log('4. Parsed directly:', parsedOutput);
      } catch (e) {
        console.log('5. Direct parse failed, attempting unescapeString on trimmedInput:', trimmedInput);
        const unescapedString = unescapeString(trimmedInput);
        console.log('6. After unescapeString:', unescapedString);
        parsedOutput = JSON.parse(unescapedString);
        console.log('7. Parsed after unescapeString:', parsedOutput);
      }

      // Recursively parse any nested JSON strings within the parsed object
      const finalOutput = parseRecursive(parsedOutput);
      console.log('8. After parseRecursive:', finalOutput);

      setUnescapeOutput(JSON.stringify(finalOutput, null, 2));
      console.log('9. Final output set to state:', JSON.stringify(finalOutput, null, 2));
      showNotification('JSON unescaped and formatted successfully!');
    } catch (e) {
      console.error('General error in handleUnescapeJson:', e);
      setUnescapeError(`Error unescaping or parsing JSON: ${e.message}`);
      showNotification(`Error unescaping JSON: ${e.message}`, 'danger');
    }
  };

  const handleJsonCompress = async () => {
    setCompressError('');
    setCompressedOutput('');
    try {
      await init(); // Ensure WASM is initialized

      const parsedJson = JSON.parse(compressInput);
      const jsonString = JSON.stringify(parsedJson);

      const encoder = new TextEncoder();
      const encoded = encoder.encode(jsonString);

      const compressed = compress(encoded);

      // Base64 encode the compressed data
      let binary = '';
      const bytes = new Uint8Array(compressed);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      setCompressedOutput(btoa(binary));
      showNotification('JSON compressed successfully!');
    } catch (e) {
      setCompressError(`Compression or JSON parsing error: ${e.message}`);
      showNotification(`Error compressing JSON: ${e.message}`, 'danger');
    }
  };

  const handleJsonMinify = () => {
    setMinifyError('');
    setMinifiedOutput('');
    try {
      const parsedJson = JSON.parse(minifyInput);
      setMinifiedOutput(JSON.stringify(parsedJson));
      showNotification('JSON minified successfully!');
    } catch (e) {
      setMinifyError(`Minification or JSON parsing error: ${e.message}`);
      showNotification(`Error minifying JSON: ${e.message}`, 'danger');
    }
  };

  const handleValidateJson = () => {
    setValidationAnnotations([]);
    try {
      JSON.parse(validationInput);
      showNotification('JSON is valid!', 'success');
    } catch (e) {
      const line = e.message.match(/at position (\d+)/);
      let row = 0;
      let column = 0;
      if (line) {
        const position = parseInt(line[1], 10);
        const lines = validationInput.substring(0, position).split('\n');
        row = lines.length - 1;
        column = lines[lines.length - 1].length;
      }
      setValidationAnnotations([
        {
          row: row,
          column: column,
          type: 'error',
          text: e.message,
        },
      ]);
      showNotification(`JSON is invalid: ${e.message}`, 'danger');
    }
  };

  const sortObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(sortObject).sort();
    }

    return Object.keys(obj)
      .sort()
      .reduce((result, key) => {
        result[key] = sortObject(obj[key]);
        return result;
      }, {});
  };

  const handleScroll = useCallback((editorName) => {
    if (!syncScroll || isScrollingRef.current) return;

    isScrollingRef.current = true;

    const leftEditor = leftEditorRef.current.editor;
    const rightEditor = rightEditorRef.current.editor;

    if (editorName === 'left') {
      rightEditor.session.setScrollTop(leftEditor.session.getScrollTop());
    } else {
      leftEditor.session.setScrollTop(rightEditor.session.getScrollTop());
    }

    setTimeout(() => {
      isScrollingRef.current = false;
    }, 100);
  }, [syncScroll]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const handleJsonDiff = () => {
    setExpandedSections(new Set()); // Reset expanded sections on new diff
    setJsonDiffError('');
    setJsonDiffResult(null);
    setJsonDiffMarkers([]);
    setJsonDiffLeftLines([]);
    setJsonDiffRightLines([]);
    setJsonDiffLeftMarkers([]);
    setJsonDiffRightMarkers([]);
    try {
      const parsed1 = JSON.parse(jsonDiffInput1);
      const parsed2 = JSON.parse(jsonDiffInput2);
      const sorted1 = JSON.stringify(sortObject(parsed1), null, 2);
      const sorted2 = JSON.stringify(sortObject(parsed2), null, 2);
      const dmp = new diff_match_patch();
      const diffs = dmp.diff_main(sorted1, sorted2);
      dmp.diff_cleanupSemantic(diffs);
      // Build side-by-side diff output
      let leftLines = [];
      let rightLines = [];
      let leftMarkers = [];
      let rightMarkers = [];
      let leftLineNum = 0;
      let rightLineNum = 0;
      diffs.forEach(part => {
        const lines = part[1].split('\n');
        lines.forEach((line, idx) => {
          if (idx === lines.length - 1 && line === '') return; // skip trailing empty
          if (part[0] === 0) {
            leftLines.push(line);
            rightLines.push(line);
          } else if (part[0] === -1) {
            leftLines.push(line);
            rightLines.push('');
            leftMarkers.push({ startRow: leftLineNum, endRow: leftLineNum, className: 'diff-marker-removed', type: 'fullLine' });
          } else if (part[0] === 1) {
            leftLines.push('');
            rightLines.push(line);
            rightMarkers.push({ startRow: rightLineNum, endRow: rightLineNum, className: 'diff-marker-added', type: 'fullLine' });
          }
          if (part[0] !== 1) leftLineNum++;
          if (part[0] !== -1) rightLineNum++;
        });
      });
      setJsonDiffLeftLines(leftLines);
      setJsonDiffRightLines(rightLines);
      setJsonDiffLeftMarkers(leftMarkers);
      setJsonDiffRightMarkers(rightMarkers);
    } catch (e) {
      setJsonDiffError('Invalid JSON input: ' + e.message);
    }
  };

  const renderDiff = () => {
    if (error) {
      return <Card body className="mt-3 text-danger">{error}</Card>;
    }

    if (!diff) {
      return null;
    }

    const { json1, json2, diffs } = diff;

    const markers1 = [];
    const markers2 = [];
    let lineNum1 = 0;
    let lineNum2 = 0;

    diffs.forEach(part => {
      const lines = part[1].split('\n');
      const lineCount = lines.length - 1;

      if (part[0] === -1) {
        markers1.push({ startRow: lineNum1, endRow: lineNum1 + lineCount, className: 'diff-marker-removed', type: 'fullLine' });
      }
      if (part[0] === 1) {
        markers2.push({ startRow: lineNum2, endRow: lineNum2 + lineCount, className: 'diff-marker-added', type: 'fullLine' });
      }

      if (part[0] !== 1) { // common or removed
        lineNum1 += lineCount;
      }
      if (part[0] !== -1) { // common or added
        lineNum2 += lineCount;
      }
    });

    return (
      <>
        <Row className="mt-3">
            <Col>
                <Form.Check 
                    type="switch"
                    id="custom-switch"
                    label="Synchronized Scrolling"
                    checked={syncScroll}
                    onChange={() => setSyncScroll(!syncScroll)}
                />
            </Col>
        </Row>
        <Row className="mt-3">
          <Col md={expandedEditor === 'diff_right' ? 0 : (expandedEditor === 'diff_left' ? 12 : 6)}>
            <div class="editor-header">
              <Form.Label>JSON 1 Diff</Form.Label>
              <div className="icon-group">
                <span class="copy-btn" onClick={toggleWrapText}>
                  <OverlayTrigger
                    placement="top"
                    overlay={<Tooltip id="tooltip-wrap-text-diff-left">Word Wrap</Tooltip>}
                  >
                    <FaTextWidth />
                  </OverlayTrigger>
                </span>
                <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'diff_left' ? null : 'diff_left')}>
                  <OverlayTrigger
                    placement="top"
                    overlay={<Tooltip id="tooltip-expand-diff-left">{expandedEditor === 'diff_left' ? 'Collapse' : 'Expand'}</Tooltip>}
                  >
                    {expandedEditor === 'diff_left' ? <FaCompress /> : <FaExpand /> }
                  </OverlayTrigger>
                </span>
                <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'diff_left' ? null : 'diff_left')}>
                  <OverlayTrigger
                    placement="top"
                    overlay={<Tooltip id="tooltip-expand-diff-left">{expandedEditor === 'diff_left' ? 'Collapse' : 'Expand'}</Tooltip>}
                  >
                    {expandedEditor === 'diff_left' ? <FaCompress /> : <FaExpand />}
                  </OverlayTrigger>
                </span>
              </div>
            </div>
            <AceEditor
              ref={leftEditorRef}
              mode="json"
              theme={theme === 'light' ? 'github' : 'dracula'}
              value={json1}
              name="diff_left"
              editorProps={{ $blockScrolling: true }}
              height={expandedEditor === 'diff_left' ? "800px" : "650px"}
              width="100%"
              readOnly
              setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
              markers={markers1}
              onScroll={() => handleScroll('left')}
            />
          </Col>
          <Col md={expandedEditor === 'diff_left' ? 0 : (expandedEditor === 'diff_right' ? 12 : 6)}>
            <div class="editor-header">
              <Form.Label>JSON 2 Diff</Form.Label>
              <div className="icon-group">
                <span class="copy-btn" onClick={toggleWrapText}>
                  <OverlayTrigger
                    placement="top"
                    overlay={<Tooltip id="tooltip-wrap-text-diff-right">Word Wrap</Tooltip>}
                  >
                    <FaTextWidth />
                  </OverlayTrigger>
                </span>
                <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'diff_right' ? null : 'diff_right')}>
                  <OverlayTrigger
                    placement="top"
                    overlay={<Tooltip id="tooltip-expand-diff-right">{expandedEditor === 'diff_right' ? 'Collapse' : 'Expand'}</Tooltip>}
                  >
                    {expandedEditor === 'diff_right' ? <FaCompress /> : <FaExpand />}
                  </OverlayTrigger>
                </span>
                <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'diff_right' ? null : 'diff_right')}>
                  <OverlayTrigger
                    placement="top"
                    overlay={<Tooltip id="tooltip-expand-diff-right">{expandedEditor === 'diff_right' ? 'Collapse' : 'Expand'}</Tooltip>}
                  >
                    {expandedEditor === 'diff_right' ? <FaCompress /> : <FaExpand />}
                  </OverlayTrigger>
                </span>
              </div>
            </div>
            <AceEditor
              ref={rightEditorRef}
              mode="json"
              theme={theme === 'light' ? 'github' : 'dracula'}
              value={json2}
              name="diff_right"
              editorProps={{ $blockScrolling: true }}
              height={expandedEditor === 'diff_right' ? "800px" : "650px"}
              width="100%"
              readOnly
              setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
              markers={markers2}
              onScroll={() => handleScroll('right')}
            />
          </Col>
        </Row>
      </>
    );
  };

  const handleDiffSyncScroll = (from) => {
    if (!diffLeftRef.current || !diffRightRef.current) return;
    if (from === 'left') {
      diffRightRef.current.scrollTop = diffLeftRef.current.scrollTop;
    } else {
      diffLeftRef.current.scrollTop = diffRightRef.current.scrollTop;
    }
  };

  const renderContent = () => {
    if (activeTab === 'diff') {
      const json1Col = expandedEditor === 'json2' ? 0 : (expandedEditor === 'json1' ? 12 : 5);
      const json2Col = expandedEditor === 'json1' ? 0 : (expandedEditor === 'json2' ? 12 : 5);
      const buttonCol = expandedEditor ? 0 : 2;

      return (
        <>
          <Row>
            {json1Col > 0 && <Col md={json1Col}>
              <Form.Group>
                <div class="editor-header">
                  <Form.Label>JSON 1</Form.Label>
                  <div className="icon-group">
                    <span class="copy-btn" onClick={() => copyToClipboard(json1)}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-copy-json1">Copy</Tooltip>}
                      >
                        <FaCopy />
                      </OverlayTrigger>
                    </span>
                    <span class="copy-btn" onClick={toggleWrapText}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-wrap-text-json1">Word Wrap</Tooltip>}
                      >
                        <FaTextWidth />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'json1' ? null : 'json1')}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-expand-json1">{expandedEditor === 'json1' ? 'Collapse' : 'Expand'}</Tooltip>}
                      >
                        {expandedEditor === 'json1' ? <FaCompress /> : <FaExpand />}
                      </OverlayTrigger>
                    </span>
                  </div>
                </div>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  onChange={(value) => setJson1(value)}
                  value={json1}
                  name="json1_editor"
                  editorProps={{ $blockScrolling: true }}
                  height="650px"
                  width="100%"
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>}
            {buttonCol > 0 && <Col md={buttonCol} className="d-flex flex-column align-items-center justify-content-center button-col-compact">
              <Button variant="primary" onClick={handleCompare} className="mb-2 action-button">
                Compare
              </Button>
            </Col>}
            {json2Col > 0 && <Col md={json2Col}>
              <Form.Group>
                <div class="editor-header">
                  <Form.Label>JSON 2</Form.Label>
                  <div className="icon-group">
                    <span class="copy-btn" onClick={() => copyToClipboard(json2)}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-copy-json2">Copy</Tooltip>}
                      >
                        <FaCopy />
                      </OverlayTrigger>
                    </span>
                    <span class="copy-btn" onClick={toggleWrapText}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-wrap-text-json2">Word Wrap</Tooltip>}
                      >
                        <FaTextWidth />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'json2' ? null : 'json2')}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-expand-json2">{expandedEditor === 'json2' ? 'Collapse' : 'Expand'}</Tooltip>}
                      >
                        {expandedEditor === 'json2' ? <FaCompress /> : <FaExpand />}
                      </OverlayTrigger>
                    </span>
                  </div>
                </div>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  onChange={(value) => setJson2(value)}
                  value={json2}
                  name="json2_editor"
                  editorProps={{ $blockScrolling: true }}
                  height="650px"
                  width="100%"
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>}
          </Row>
          {renderDiff()}
        </>
      );
    }

    if (activeTab === 'format') {
      const formatInputCol = expandedEditor === 'formatOutput' ? 0 : (expandedEditor === 'formatInput' ? 12 : 5);
      const formatOutputCol = expandedEditor === 'formatInput' ? 0 : (expandedEditor === 'formatOutput' ? 12 : 5);
      const formatButtonCol = expandedEditor ? 0 : 2;

      const handleInputFontSizeChange = (delta) => {
        setFormatInputFontSize((prev) => Math.max(10, Math.min(32, prev + delta)));
      };
      const handleOutputFontSizeChange = (delta) => {
        setFormatOutputFontSize((prev) => Math.max(10, Math.min(32, prev + delta)));
      };

      const colors = [
        '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
        '#ffa500', '#800080', '#008000', '#ffc0cb', '#a52a2a', '#000000'
      ];

      const renderPath = (path, color) => {
        if (path.length < 2) return null;
        
        const pathData = path.map((point, index) => {
          if (index === 0) return `M ${point.x} ${point.y}`;
          return `L ${point.x} ${point.y}`;
        }).join(' ');
        
        return (
          <path
            d={pathData}
            stroke={color}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      };

      return (
        <>
          <Row>
            {formatInputCol > 0 && <Col md={formatInputCol}>
              <Form.Group>
                <div className="editor-header">
                  <Form.Label>Input JSON</Form.Label>
                  <div className="icon-group">
                    <button className="copy-btn" type="button" onClick={() => handleInputFontSizeChange(1)} title="Increase font size"><FaPlus /></button>
                    <button className="copy-btn" type="button" onClick={() => handleInputFontSizeChange(-1)} title="Decrease font size"><FaMinus /></button>
                    <span className={`copy-btn ${paintMode ? 'active' : ''}`} onClick={togglePaintMode}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-paint-mode">{paintMode ? 'Disable Paint Mode' : 'Enable Paint Mode'}</Tooltip>}
                      >
                        <FaPaintBrush />
                      </OverlayTrigger>
                    </span>
                    {paintMode && (
                      <Dropdown>
                        <Dropdown.Toggle as="span" className="copy-btn">
                          <OverlayTrigger
                            placement="top"
                            overlay={<Tooltip id="tooltip-color-picker">Select Color</Tooltip>}
                          >
                            <FaPalette style={{ color: selectedColor }} />
                          </OverlayTrigger>
                        </Dropdown.Toggle>
                        <Dropdown.Menu>
                          <div className="color-grid">
                            {colors.map((color) => (
                              <div
                                key={color}
                                className={`color-option ${selectedColor === color ? 'selected' : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => handleColorSelect(color)}
                              />
                            ))}
                          </div>
                        </Dropdown.Menu>
                      </Dropdown>
                    )}
                    {paintMode && (
                      <span className="copy-btn" onClick={clearAnnotations}>
                        <OverlayTrigger
                          placement="top"
                          overlay={<Tooltip id="tooltip-clear-annotations">Clear Annotations</Tooltip>}
                        >
                          <span style={{ fontSize: '12px', fontWeight: 'bold' }}>×</span>
                        </OverlayTrigger>
                      </span>
                    )}
                    <span className="copy-btn" onClick={() => setFormatInput(sampleJson)}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-load-sample">Load Sample JSON</Tooltip>}
                      >
                        <FaFileCode />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={() => copyToClipboard(formatInput)}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-copy-format-input">Copy</Tooltip>}
                      >
                        <FaCopy />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={toggleWrapText}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-wrap-text-format-input">Word Wrap</Tooltip>}
                      >
                        <FaTextWidth />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'formatInput' ? null : 'formatInput')}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-expand-format-input">{expandedEditor === 'formatInput' ? 'Collapse' : 'Expand'}</Tooltip>}
                      >
                        {expandedEditor === 'formatInput' ? <FaCompress /> : <FaExpand />}
                      </OverlayTrigger>
                    </span>
                  </div>
                </div>
                <div className="editor-container" style={{ position: 'relative' }}>
                  <AceEditor
                    mode="json"
                    theme={theme === 'light' ? 'github' : 'dracula'}
                    onChange={(value) => setFormatInput(value)}
                    value={formatInput}
                    name="format_input_editor"
                    editorProps={{ $blockScrolling: true }}
                    height="850px"
                    width="100%"
                    fontSize={formatInputFontSize}
                    setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                  />
                  {paintMode && (
                    <div 
                      className="annotation-layer"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        pointerEvents: 'auto',
                        zIndex: 10
                      }}
                      onMouseDown={(e) => handleMouseDown(e, 'input')}
                      onMouseMove={(e) => handleMouseMove(e, 'input')}
                      onMouseUp={(e) => handleMouseUp(e, 'input')}
                      onMouseLeave={(e) => handleMouseUp(e, 'input')}
                    >
                      <svg
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          pointerEvents: 'none'
                        }}
                      >
                        {annotations.filter(ann => ann.editor === 'input').map((annotation) => 
                          renderPath(annotation.path, annotation.path[0]?.color || selectedColor)
                        )}
                        {currentPath.length > 1 && renderPath(currentPath, selectedColor)}
                      </svg>
                    </div>
                  )}
                </div>
              </Form.Group>
            </Col>}
            {formatButtonCol > 0 && <Col md={formatButtonCol} className="d-flex flex-column align-items-center justify-content-center button-col-compact">
              <Button variant="primary" onClick={handleFormat} className="mb-2 action-button">
                Format
              </Button>
            </Col>}
            {formatOutputCol > 0 && <Col md={formatOutputCol}>
              <Form.Group>
                <div className="editor-header">
                  <Form.Label className="mb-0">Formatted JSON</Form.Label>
                  <div className="icon-group">
                    <button className="copy-btn" type="button" onClick={() => handleOutputFontSizeChange(1)} title="Increase font size"><FaPlus /></button>
                    <button className="copy-btn" type="button" onClick={() => handleOutputFontSizeChange(-1)} title="Decrease font size"><FaMinus /></button>
                    <span className={`copy-btn ${paintMode ? 'active' : ''}`} onClick={togglePaintMode}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-paint-mode-output">{paintMode ? 'Disable Paint Mode' : 'Enable Paint Mode'}</Tooltip>}
                      >
                        <FaPaintBrush />
                      </OverlayTrigger>
                    </span>
                    {paintMode && (
                      <Dropdown>
                        <Dropdown.Toggle as="span" className="copy-btn">
                          <OverlayTrigger
                            placement="top"
                            overlay={<Tooltip id="tooltip-color-picker-output">Select Color</Tooltip>}
                          >
                            <FaPalette style={{ color: selectedColor }} />
                          </OverlayTrigger>
                        </Dropdown.Toggle>
                        <Dropdown.Menu>
                          <div className="color-grid">
                            {colors.map((color) => (
                              <div
                                key={color}
                                className={`color-option ${selectedColor === color ? 'selected' : ''}`}
                                style={{ backgroundColor: color }}
                                onClick={() => handleColorSelect(color)}
                              />
                            ))}
                          </div>
                        </Dropdown.Menu>
                      </Dropdown>
                    )}
                    {paintMode && (
                      <span className="copy-btn" onClick={clearAnnotations}>
                        <OverlayTrigger
                          placement="top"
                          overlay={<Tooltip id="tooltip-clear-annotations-output">Clear Annotations</Tooltip>}
                        >
                          <span style={{ fontSize: '12px', fontWeight: 'bold' }}>×</span>
                        </OverlayTrigger>
                      </span>
                    )}
                    <span className="copy-btn" onClick={() => setFormattedViewMode('code')} active={formattedViewMode === 'code'}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-view-code">View as Code</Tooltip>}
                      >
                        <FaCode />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={() => setFormattedViewMode('tree')} active={formattedViewMode === 'tree'}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-view-tree">View as Tree</Tooltip>}
                      >
                        <FaSitemap />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={() => copyToClipboard(formattedOutput)}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-copy-formatted-output">Copy</Tooltip>}
                      >
                        <FaCopy />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={toggleWrapText}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-wrap-text-formatted-output">Word Wrap</Tooltip>}
                      >
                        <FaTextWidth />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'formatOutput' ? null : 'formatOutput')}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-expand-format-output">{expandedEditor === 'formatOutput' ? 'Collapse' : 'Expand'}</Tooltip>}
                      >
                        {expandedEditor === 'formatOutput' ? <FaCompress /> : <FaExpand />}
                      </OverlayTrigger>
                    </span>
                  </div>
                </div>
                {formattedViewMode === 'code' ? (
                  <div className="editor-container" style={{ position: 'relative' }}>
                    <AceEditor
                      mode="json"
                      theme={theme === 'light' ? 'github' : 'dracula'}
                      value={formattedOutput}
                      name="formatted_output_editor"
                      editorProps={{ $blockScrolling: true }}
                      height="850px"
                      width="100%"
                      fontSize={formatOutputFontSize}
                      readOnly
                      setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                    />
                    {paintMode && (
                      <div 
                        className="annotation-layer"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          pointerEvents: 'auto',
                          zIndex: 10
                        }}
                        onMouseDown={(e) => handleMouseDown(e, 'output')}
                        onMouseMove={(e) => handleMouseMove(e, 'output')}
                        onMouseUp={(e) => handleMouseUp(e, 'output')}
                        onMouseLeave={(e) => handleMouseUp(e, 'output')}
                      >
                        <svg
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none'
                          }}
                        >
                          {annotations.filter(ann => ann.editor === 'output').map((annotation) => 
                            renderPath(annotation.path, annotation.path[0]?.color || selectedColor)
                          )}
                          {currentPath.length > 1 && renderPath(currentPath, selectedColor)}
                        </svg>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className={`json-tree-view-wrapper font-size-${formatOutputFontSize}`} style={{height: '850px', minHeight: '850px', maxHeight: '850px', position: 'relative'}}>
                      <Form.Control
                        type="text"
                        placeholder="Search in tree view..."
                        value={treeSearchTerm}
                        onChange={(e) => setTreeSearchTerm(e.target.value)}
                        className="mb-2"
                      />
                      <div className="json-tree-view-container">
                        <JsonTreeView data={formattedOutput} searchTerm={treeSearchTerm} />
                      </div>
                      {paintMode && (
                        <div 
                          className="annotation-layer"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            pointerEvents: 'auto',
                            zIndex: 10
                          }}
                          onMouseDown={(e) => handleMouseDown(e, 'tree')}
                          onMouseMove={(e) => handleMouseMove(e, 'tree')}
                          onMouseUp={(e) => handleMouseUp(e, 'tree')}
                          onMouseLeave={(e) => handleMouseUp(e, 'tree')}
                        >
                          <svg
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              pointerEvents: 'none'
                            }}
                          >
                            {annotations.filter(ann => ann.editor === 'tree').map((annotation) => 
                              renderPath(annotation.path, annotation.path[0]?.color || selectedColor)
                            )}
                            {currentPath.length > 1 && renderPath(currentPath, selectedColor)}
                          </svg>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </Form.Group>
            </Col>}
          </Row>
          {formatError && (
            <Row className="mt-3">
              <Col>
                <Card body className="text-danger">{formatError}</Card>
              </Col>
            </Row>
          )}
        </>
      );
    }

    if (activeTab === 'zstd') {
      const zstdInputCol = expandedEditor === 'zstdOutput' ? 0 : (expandedEditor === 'zstdInput' ? 12 : 5);
      const zstdOutputCol = expandedEditor === 'zstdInput' ? 0 : (expandedEditor === 'zstdOutput' ? 12 : 5);
      const zstdButtonCol = expandedEditor ? 0 : 2;

      return (
        <>
          <Row>
            {zstdInputCol > 0 && <Col md={zstdInputCol}>
              <Form.Group>
                <div class="editor-header">
                  <Form.Label>Base64 Zstd Compressed String</Form.Label>
                  <div className="icon-group">
                    <span class="copy-btn" onClick={() => copyToClipboard(zstdInput)}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-copy-zstd-input">Copy</Tooltip>}
                      >
                        <FaCopy />
                      </OverlayTrigger>
                    </span>
                    <span class="copy-btn" onClick={toggleWrapText}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-wrap-text-zstd-input">Word Wrap</Tooltip>}
                      >
                        <FaTextWidth />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'zstdInput' ? null : 'zstdInput')}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-expand-zstd-input">{expandedEditor === 'zstdInput' ? 'Collapse' : 'Expand'}</Tooltip>}
                      >
                        {expandedEditor === 'zstdInput' ? <FaCompress /> : <FaExpand />}
                      </OverlayTrigger>
                    </span>
                  </div>
                </div>
                <AceEditor
                  mode="text"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  onChange={(value) => setZstdInput(value)}
                  value={zstdInput}
                  name="zstd_input_editor"
                  editorProps={{ $blockScrolling: true }}
                  height={expandedEditor === 'zstdInput' ? "800px" : "650px"}
                  width="100%"
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>}
            {zstdButtonCol > 0 && <Col md={zstdButtonCol} className="d-flex flex-column align-items-center justify-content-center button-col-compact">
              <Button variant="primary" onClick={handleZstdDecompress} className="mb-2 action-button">
                Decompress
              </Button>
            </Col>}
            {zstdOutputCol > 0 && <Col md={zstdOutputCol}>
              <Form.Group>
                <div class="editor-header">
                  <Form.Label>Decompressed JSON</Form.Label>
                  <div className="icon-group">
                    <span class="copy-btn" onClick={() => copyToClipboard(zstdOutput)}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-copy-zstd-output">Copy</Tooltip>}
                      >
                        <FaCopy />
                      </OverlayTrigger>
                    </span>
                    <span class="copy-btn" onClick={toggleWrapText}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-wrap-text-zstd-output">Word Wrap</Tooltip>}
                      >
                        <FaTextWidth />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'zstdOutput' ? null : 'zstdOutput')}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-expand-zstd-output">{expandedEditor === 'zstdOutput' ? 'Collapse' : 'Expand'}</Tooltip>}
                      >
                        {expandedEditor === 'zstdOutput' ? <FaCompress /> : <FaExpand />}
                      </OverlayTrigger>
                    </span>
                  </div>
                </div>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  value={zstdOutput}
                  name="zstd_output_editor"
                  editorProps={{ $blockScrolling: true }}
                  height={expandedEditor === 'zstdOutput' ? "800px" : "650px"}
                  width="100%"
                  readOnly
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>}
          </Row>
          {zstdError && (
            <Row className="mt-3">
              <Col>
                <Card body className="text-danger">{zstdError}</Card>
              </Col>
            </Row>
          )}
        </>
      );
    }

    if (activeTab === 'unescape') {
      const unescapeInputCol = expandedEditor === 'unescapeOutput' ? 0 : (expandedEditor === 'unescapeInput' ? 12 : 5);
      const unescapeOutputCol = expandedEditor === 'unescapeInput' ? 0 : (expandedEditor === 'unescapeOutput' ? 12 : 5);
      const unescapeButtonCol = expandedEditor ? 0 : 2;

      return (
        <>
          <Row>
            {unescapeInputCol > 0 && <Col md={unescapeInputCol}>
              <Form.Group>
                <div class="editor-header">
                  <Form.Label>Escaped JSON String</Form.Label>
                  <div className="icon-group">
                    
                    <span class="copy-btn" onClick={() => copyToClipboard(escapeInput)}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-copy-escape-input">Copy</Tooltip>}
                      >
                        <FaCopy />
                      </OverlayTrigger>
                    </span>
                    <span class="copy-btn" onClick={toggleWrapText}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-wrap-text-escape-input">Word Wrap</Tooltip>}
                      >
                        <FaTextWidth />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'unescapeInput' ? null : 'unescapeInput')}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-expand-unescape-input">{expandedEditor === 'unescapeInput' ? 'Collapse' : 'Expand'}</Tooltip>}
                      >
                        {expandedEditor === 'unescapeInput' ? <FaCompress /> : <FaExpand />}
                      </OverlayTrigger>
                    </span>
                  </div>
                </div>
                <AceEditor
                  mode="text"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  onChange={(value) => setEscapeInput(value)}
                  value={escapeInput}
                  name="escape_input_editor"
                  editorProps={{ $blockScrolling: true }}
                  height={expandedEditor === 'unescapeInput' ? "800px" : "650px"}
                  width="100%"
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>}
            {unescapeButtonCol > 0 && <Col md={unescapeButtonCol} className="d-flex flex-column align-items-center justify-content-center button-col-compact">
              <Button variant="primary" onClick={handleUnescapeJson} className="mb-2 action-button">
                Unescape & Format
              </Button>
            </Col>}
            {unescapeOutputCol > 0 && <Col md={unescapeOutputCol}>
              <Form.Group>
                <div class="editor-header">
                  <Form.Label>Unescaped JSON</Form.Label>
                  <div className="icon-group">
                    <span class="copy-btn" onClick={() => copyToClipboard(unescapeOutput)}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-copy-unescape-output">Copy</Tooltip>}
                      >
                        <FaCopy />
                      </OverlayTrigger>
                    </span>
                    <span class="copy-btn" onClick={toggleWrapText}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-wrap-text-unescape-output">Word Wrap</Tooltip>}
                      >
                        <FaTextWidth />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'unescapeOutput' ? null : 'unescapeOutput')}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-expand-unescape-output">{expandedEditor === 'unescapeOutput' ? 'Collapse' : 'Expand'}</Tooltip>}
                      >
                        {expandedEditor === 'unescapeOutput' ? <FaCompress /> : <FaExpand />}
                      </OverlayTrigger>
                    </span>
                  </div>
                </div>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  value={unescapeOutput}
                  name="unescape_output_editor"
                  editorProps={{ $blockScrolling: true }}
                  height={expandedEditor === 'unescapeOutput' ? "800px" : "650px"}
                  width="100%"
                  readOnly
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>}
          </Row>
          {unescapeError && (
            <Row className="mt-3">
              <Col>
                <Card body className="text-danger">{unescapeError}</Card>
              </Col>
            </Row>
          )}
        </>
      );
    }

    if (activeTab === 'compress') {
      const compressInputCol = expandedEditor === 'compressedOutput' ? 0 : (expandedEditor === 'compressInput' ? 12 : 5);
      const compressedOutputCol = expandedEditor === 'compressInput' ? 0 : (expandedEditor === 'compressedOutput' ? 12 : 5);
      const compressButtonCol = expandedEditor ? 0 : 2;

      return (
        <>
          <Row>
            {compressInputCol > 0 && <Col md={compressInputCol}>
              <Form.Group>
                <div class="editor-header">
                  <Form.Label>Input JSON</Form.Label>
                  <div className="icon-group">
                    <span class="copy-btn" onClick={() => setCompressInput(sampleJson)}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-load-sample-compress">Load Sample JSON</Tooltip>}
                      >
                        <FaFileCode />
                      </OverlayTrigger>
                    </span>
                    <span class="copy-btn" onClick={() => copyToClipboard(compressInput)}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-copy-compress-input">Copy</Tooltip>}
                      >
                        <FaCopy />
                      </OverlayTrigger>
                    </span>
                    <span class="copy-btn" onClick={toggleWrapText}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-wrap-text-compress-input">Word Wrap</Tooltip>}
                      >
                        <FaTextWidth />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'compressInput' ? null : 'compressInput')}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-expand-compress-input">{expandedEditor === 'compressInput' ? 'Collapse' : 'Expand'}</Tooltip>}
                      >
                        {expandedEditor === 'compressInput' ? <FaCompress /> : <FaExpand />}
                      </OverlayTrigger>
                    </span>
                  </div>
                </div>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  onChange={(value) => setCompressInput(value)}
                  value={compressInput}
                  name="compress_input_editor"
                  editorProps={{ $blockScrolling: true }}
                  height={expandedEditor === 'compressInput' ? "800px" : "650px"}
                  width="100%"
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>}
            {compressButtonCol > 0 && <Col md={compressButtonCol} className="d-flex flex-column align-items-center justify-content-center button-col-compact">
              <Button variant="primary" onClick={handleJsonCompress} className="mb-2 action-button">
                Compress
              </Button>
            </Col>}
            {compressedOutputCol > 0 && <Col md={compressedOutputCol}>
              <Form.Group>
                <div class="editor-header">
                  <Form.Label>Compressed Base64 String</Form.Label>
                  <div className="icon-group">
                    <span class="copy-btn" onClick={() => copyToClipboard(compressedOutput)}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-copy-compressed-output">Copy</Tooltip>}
                      >
                        <FaCopy />
                      </OverlayTrigger>
                    </span>
                    <span class="copy-btn" onClick={toggleWrapText}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-wrap-text-compressed-output">Word Wrap</Tooltip>}
                      >
                        <FaTextWidth />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'compressedOutput' ? null : 'compressedOutput')}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-expand-compressed-output">{expandedEditor === 'compressedOutput' ? 'Collapse' : 'Expand'}</Tooltip>}
                      >
                        {expandedEditor === 'compressedOutput' ? <FaCompress /> : <FaExpand />}
                      </OverlayTrigger>
                    </span>
                  </div>
                </div>
                <AceEditor
                  mode="text"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  value={compressedOutput}
                  name="compressed_output_editor"
                  editorProps={{ $blockScrolling: true }}
                  height={expandedEditor === 'compressedOutput' ? "800px" : "650px"}
                  width="100%"
                  readOnly
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>}
          </Row>
          {compressError && (
            <Row className="mt-3">
              <Col>
                <Card body className="text-danger">{compressError}</Card>
              </Col>
            </Row>
          )}
        </>
      );
    }

    if (activeTab === 'minify') {
      const minifyInputCol = expandedEditor === 'minifiedOutput' ? 0 : (expandedEditor === 'minifyInput' ? 12 : 5);
      const minifiedOutputCol = expandedEditor === 'minifyInput' ? 0 : (expandedEditor === 'minifiedOutput' ? 12 : 5);
      const minifyButtonCol = expandedEditor ? 0 : 2;

      return (
        <>
          <Row>
            {minifyInputCol > 0 && <Col md={minifyInputCol}>
              <Form.Group>
                <div class="editor-header">
                  <Form.Label>Input JSON</Form.Label>
                  <div className="icon-group">
                    <span class="copy-btn" onClick={() => setMinifyInput(sampleJson)}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-load-sample-minify">Load Sample JSON</Tooltip>}
                      >
                        <FaFileCode />
                      </OverlayTrigger>
                    </span>
                    <span class="copy-btn" onClick={() => copyToClipboard(minifyInput)}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-copy-minify-input">Copy</Tooltip>}
                      >
                        <FaCopy />
                      </OverlayTrigger>
                    </span>
                    <span class="copy-btn" onClick={toggleWrapText}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-wrap-text-minify-input">Word Wrap</Tooltip>}
                      >
                        <FaTextWidth />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'minifyInput' ? null : 'minifyInput')}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-expand-minify-input">{expandedEditor === 'minifyInput' ? 'Collapse' : 'Expand'}</Tooltip>}
                      >
                        {expandedEditor === 'minifyInput' ? <FaCompress /> : <FaExpand />}
                      </OverlayTrigger>
                    </span>
                  </div>
                </div>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  onChange={(value) => setMinifyInput(value)}
                  value={minifyInput}
                  name="minify_input_editor"
                  editorProps={{ $blockScrolling: true }}
                  height={expandedEditor === 'minifyInput' ? "800px" : "650px"}
                  width="100%"
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>}
            {minifyButtonCol > 0 && <Col md={minifyButtonCol} className="d-flex flex-column align-items-center justify-content-center button-col-compact">
              <Button variant="primary" onClick={handleJsonMinify} className="mb-2 action-button">
                Minify
              </Button>
            </Col>}
            {minifiedOutputCol > 0 && <Col md={minifiedOutputCol}>
              <Form.Group>
                <div class="editor-header">
                  <Form.Label>Minified JSON</Form.Label>
                  <div className="icon-group">
                    <span class="copy-btn" onClick={() => copyToClipboard(minifiedOutput)}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-copy-minified-output">Copy</Tooltip>}
                      >
                        <FaCopy />
                      </OverlayTrigger>
                    </span>
                    <span class="copy-btn" onClick={toggleWrapText}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-wrap-text-minified-output">Word Wrap</Tooltip>}
                      >
                        <FaTextWidth />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'minifiedOutput' ? null : 'minifiedOutput')}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-expand-minified-output">{expandedEditor === 'minifiedOutput' ? 'Collapse' : 'Expand'}</Tooltip>}
                      >
                        {expandedEditor === 'minifiedOutput' ? <FaCompress /> : <FaExpand />}
                      </OverlayTrigger>
                    </span>
                  </div>
                </div>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  value={minifiedOutput}
                  name="minified_output_editor"
                  editorProps={{ $blockScrolling: true }}
                  height={expandedEditor === 'minifiedOutput' ? "800px" : "650px"}
                  width="100%"
                  readOnly
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>}
          </Row>
          {minifyError && (
            <Row className="mt-3">
              <Col>
                <Card body className="text-danger">{minifyError}</Card>
              </Col>
            </Row>
          )}
        </>
      );
    }

    if (activeTab === 'validate') {
      const validationInputCol = expandedEditor === 'validationInput' ? 12 : 12;

      return (
        <>
          <Row>
            {validationInputCol > 0 && <Col md={validationInputCol}>
              <Form.Group>
                <div class="editor-header">
                  <Form.Label>Input JSON for Validation</Form.Label>
                  <div className="icon-group">
                    <span class="copy-btn" onClick={() => copyToClipboard(validationInput)}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-copy-validation-input">Copy</Tooltip>}
                      >
                        <FaCopy />
                      </OverlayTrigger>
                    </span>
                    <span class="copy-btn" onClick={toggleWrapText}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-wrap-text-validation-input">Word Wrap</Tooltip>}
                      >
                        <FaTextWidth />
                      </OverlayTrigger>
                    </span>
                    <span className="copy-btn" onClick={() => setExpandedEditor(expandedEditor === 'validationInput' ? null : 'validationInput')}>
                      <OverlayTrigger
                        placement="top"
                        overlay={<Tooltip id="tooltip-expand-validation-input">{expandedEditor === 'validationInput' ? 'Collapse' : 'Expand'}</Tooltip>}
                      >
                        {expandedEditor === 'validationInput' ? <FaCompress /> : <FaExpand />}
                      </OverlayTrigger>
                    </span>
                  </div>
                </div>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  onChange={(value) => setValidationInput(value)}
                  value={validationInput}
                  name="validation_input_editor"
                  editorProps={{ $blockScrolling: true }}
                  height={expandedEditor === 'validationInput' ? "800px" : "650px"}
                  width="100%"
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                  annotations={validationAnnotations}
                />
              </Form.Group>
            </Col>}
          </Row>
          <Row className="mt-3">
            <Col className="text-center">
              <Button variant="primary" onClick={handleValidateJson} className="mb-2 action-button">
                Validate JSON
              </Button>
            </Col>
          </Row>
        </>
      );
    }

    if (activeTab === 'jsondiff') {
      const diffLines = getDiffLines(jsonDiffLeftLines, jsonDiffRightLines, jsonDiffLeftMarkers, jsonDiffRightMarkers);
      const hunks = getDiffHunks(jsonDiffLeftLines, jsonDiffRightLines, jsonDiffLeftMarkers, jsonDiffRightMarkers, 3);
      const showNoDiff = (jsonDiffLeftLines.length > 0 || jsonDiffRightLines.length > 0) && !hasDiff(jsonDiffLeftMarkers, jsonDiffRightMarkers);
      const handleExpand = (start, end) => {
        setExpandedSections(prev => new Set(prev).add(`${start}-${end}`));
      };
      const isExpanded = (start, end) => expandedSections.has(`${start}-${end}`);
      return (
        <>
          <Row>
            <Col md={5}>
              <Form.Group>
                <Form.Label>JSON 1</Form.Label>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  onChange={setJsonDiffInput1}
                  value={jsonDiffInput1}
                  name="json_diff_input_1"
                  editorProps={{ $blockScrolling: true }}
                  height="650px"
                  width="100%"
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>
            <Col md={2} className="d-flex flex-column align-items-center justify-content-center button-col-compact">
              <Button variant="primary" onClick={handleJsonDiff} className="mb-2 action-button">
                Diff
              </Button>
            </Col>
            <Col md={5}>
              <Form.Group>
                <Form.Label>JSON 2</Form.Label>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  onChange={setJsonDiffInput2}
                  value={jsonDiffInput2}
                  name="json_diff_input_2"
                  editorProps={{ $blockScrolling: true }}
                  height="650px"
                  width="100%"
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>
          </Row>
          {jsonDiffError && (
            <Row className="mt-3">
              <Col>
                <Card body className="text-danger">{jsonDiffError}</Card>
              </Col>
            </Row>
          )}
          {showNoDiff && (
            <Row className="mt-3">
              <Col>
                <div className="alert alert-success text-center" role="alert">
                  No differences found! 🎉
                </div>
              </Col>
            </Row>
          )}
          {(jsonDiffLeftLines.length > 0 || jsonDiffRightLines.length > 0) && (
            <Row className="mt-3">
              <Col md={6}>
                <Card className="json-diff-card">
                  <Card.Body>
                    <Form.Label>Diff: JSON 1</Form.Label>
                    <pre className="json-diff-pre">
                      {hunks.some(h => h.type === 'hunk')
                        ? hunks.map((hunk, idx) => {
                            if (hunk.type === 'hunk' || isExpanded(hunk.start, hunk.end)) {
                              return diffLines.slice(hunk.start, hunk.end).map((line, i) => (
                                <span key={hunk.start + i} className={line.leftClass}>{line.left || '\u00A0'}</span>
                              ));
                            } else {
                              // Only one row for the collapsed section
                              return (
                                <span key={`collapsed-left-${hunk.start}-${hunk.end}`} className="diff-collapsed">
                                  ... <button className="btn btn-link btn-sm p-0" onClick={() => handleExpand(hunk.start, hunk.end)}>Expand {hunk.end - hunk.start} lines</button> ...
                                </span>
                              );
                            }
                          })
                        : diffLines.map((line, idx) => (
                            <span key={idx} className={line.leftClass}>{line.left || '\u00A0'}</span>
                          ))}
                    </pre>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={6}>
                <Card className="json-diff-card">
                  <Card.Body>
                    <Form.Label>Diff: JSON 2</Form.Label>
                    <pre className="json-diff-pre">
                      {hunks.some(h => h.type === 'hunk')
                        ? hunks.map((hunk, idx) => {
                            if (hunk.type === 'hunk' || isExpanded(hunk.start, hunk.end)) {
                              return diffLines.slice(hunk.start, hunk.end).map((line, i) => (
                                <span key={hunk.start + i} className={line.rightClass}>{line.right || '\u00A0'}</span>
                              ));
                            } else {
                              // Only one row for the collapsed section
                              return (
                                <span key={`collapsed-right-${hunk.start}-${hunk.end}`} className="diff-collapsed">
                                  ... <button className="btn btn-link btn-sm p-0" onClick={() => handleExpand(hunk.start, hunk.end)}>Expand {hunk.end - hunk.start} lines</button> ...
                                </span>
                              );
                            }
                          })
                        : diffLines.map((line, idx) => (
                            <span key={idx} className={line.rightClass}>{line.right || '\u00A0'}</span>
                          ))}
                    </pre>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          )}
        </>
      );
    }

    return null;
  };

  useEffect(() => {
    // Check if user has seen onboarding before
    const hasSeenOnboarding = localStorage.getItem('jsonDiffAppOnboarding');
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }
  }, []);

  const completeOnboarding = () => {
    localStorage.setItem('jsonDiffAppOnboarding', 'true');
    setShowOnboarding(false);
    setOnboardingStep(0);
  };

  const nextOnboardingStep = () => {
    setOnboardingStep(prev => prev + 1);
  };

  const prevOnboardingStep = () => {
    setOnboardingStep(prev => prev - 1);
  };

  const getTabPosition = (tabKey) => {
    const tabElement = tabRefs.current[tabKey];
    if (tabElement) {
      const rect = tabElement.getBoundingClientRect();
      return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      };
    }
    return null;
  };

  const onboardingSteps = [
    {
      tab: 'format',
      title: 'JSON Formatter',
      description: 'Format and beautify your JSON with proper indentation. Switch between code view and tree view for better readability.',
      features: ['Format JSON with proper indentation', 'View as code or tree structure', 'Adjust font size', 'Paint annotations']
    },
    {
      tab: 'minify',
      title: 'JSON Minify',
      description: 'Remove all unnecessary whitespace and formatting to create compact JSON for production use.',
      features: ['Remove all whitespace', 'Compact JSON output', 'Perfect for production']
    },
    {
      tab: 'validate',
      title: 'JSON Validator',
      description: 'Check if your JSON is syntactically correct and get detailed error messages if there are issues.',
      features: ['Syntax validation', 'Error highlighting', 'Detailed error messages']
    },
    {
      tab: 'unescape',
      title: 'JSON Unescape',
      description: 'Convert escaped JSON strings back to readable format and parse nested JSON structures.',
      features: ['Unescape JSON strings', 'Parse nested JSON', 'Handle complex structures']
    },
    {
      tab: 'jsondiff',
      title: 'JSON Diff',
      description: 'Compare two JSON objects side by side and see the differences highlighted with vivid colors.',
      features: ['Side-by-side comparison', 'Vivid diff highlighting', 'Collapsible sections', 'Synchronized scrolling']
    },
    {
      tab: 'compress',
      title: 'Zstd Compress',
      description: 'Compress your JSON data using Zstandard compression algorithm for efficient storage and transmission.',
      features: ['Zstandard compression', 'Base64 output', 'Efficient data reduction']
    },
    {
      tab: 'zstd',
      title: 'Zstd Decompress',
      description: 'Decompress Zstandard compressed data back to readable JSON format.',
      features: ['Zstandard decompression', 'Base64 input support', 'Restore original JSON']
    }
  ];

  return (
    <>
      <Header theme={theme} toggleTheme={toggleTheme} />
      <Container fluid className="mt-4 pt-5 content-extra-padding">
        <Nav variant="tabs" activeKey={activeTab} onSelect={(k) => setActiveTab(k)}>
          <Nav.Item>
            <Nav.Link 
              eventKey="format" 
              ref={el => tabRefs.current['format'] = el}
            >
              JSON Formatter
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link 
              eventKey="minify" 
              ref={el => tabRefs.current['minify'] = el}
            >
              JSON Minify
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link 
              eventKey="validate" 
              ref={el => tabRefs.current['validate'] = el}
            >
              JSON Validator
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link 
              eventKey="unescape" 
              ref={el => tabRefs.current['unescape'] = el}
            >
              JSON Unescape
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link 
              eventKey="jsondiff" 
              ref={el => tabRefs.current['jsondiff'] = el}
            >
              JSON Diff
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link 
              eventKey="compress" 
              ref={el => tabRefs.current['compress'] = el}
            >
              Zstd Compress
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link 
              eventKey="zstd" 
              ref={el => tabRefs.current['zstd'] = el}
            >
              Zstd Decompress
            </Nav.Link>
          </Nav.Item>
        </Nav>
        <div className="mt-3 content-bg">{renderContent()}</div>
      </Container>

      <Footer />

      <ToastContainer position="top-end" className="p-3" style={{ position: 'fixed', zIndex: 9999 }}>
        <Toast onClose={() => setShowToast(false)} show={showToast} delay={5000} autohide bg={toastVariant === 'success' ? 'light' : toastVariant}>
          <Toast.Body className={toastVariant === 'success' ? 'text-dark d-flex align-items-center' : 'text-white d-flex align-items-center'} style={toastVariant === 'success' ? { backgroundColor: '#d4edda', borderColor: '#c3e6cb', fontSize: '16px' } : { fontSize: '16px' }}>
            {toastVariant === 'success' && <FaCheck className="me-2" style={{ color: '#28a745', fontSize: '20px' }} />}
            {toastMessage}
          </Toast.Body>
        </Toast>
      </ToastContainer>

      {/* Onboarding Modal */}
      <Modal 
        show={showOnboarding} 
        onHide={completeOnboarding}
        size="lg"
        centered
        backdrop="static"
        keyboard={false}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <FaQuestionCircle className="me-2" />
            Welcome to JSON Diff App!
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {onboardingSteps[onboardingStep] && (
            <div className="text-center">
              <h4 className="mb-3">{onboardingSteps[onboardingStep].title}</h4>
              <p className="mb-4">{onboardingSteps[onboardingStep].description}</p>
              <div className="features-list">
                <h6>Key Features:</h6>
                <ul className="list-unstyled">
                  {onboardingSteps[onboardingStep].features.map((feature, index) => (
                    <li key={index} className="mb-2">
                      <span className="feature-bullet">•</span> {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <div className="d-flex justify-content-between align-items-center w-100">
            <div>
              <span className="text-muted">
                Step {onboardingStep + 1} of {onboardingSteps.length}
              </span>
            </div>
            <div>
              {onboardingStep > 0 && (
                <Button variant="outline-secondary" onClick={prevOnboardingStep} className="me-2">
                  Previous
                </Button>
              )}
              {onboardingStep < onboardingSteps.length - 1 ? (
                <Button variant="primary" onClick={nextOnboardingStep}>
                  Next
                </Button>
              ) : (
                <Button variant="success" onClick={completeOnboarding}>
                  Get Started!
                </Button>
              )}
            </div>
          </div>
        </Modal.Footer>
      </Modal>

      {/* Onboarding Overlay */}
      {showOnboarding && onboardingSteps[onboardingStep] && (() => {
        const currentTab = onboardingSteps[onboardingStep].tab;
        const tabPosition = getTabPosition(currentTab);
        
        return (
          <div className="onboarding-overlay">
            {tabPosition && (
              <>
                <div 
                  className="onboarding-highlight"
                  style={{
                    position: 'absolute',
                    top: tabPosition.top - 5,
                    left: tabPosition.left - 5,
                    width: tabPosition.width + 10,
                    height: tabPosition.height + 10,
                    zIndex: 1000,
                    pointerEvents: 'none'
                  }}
                />
                <div 
                  className="onboarding-tooltip"
                  style={{
                    position: 'absolute',
                    top: tabPosition.top + tabPosition.height + 10,
                    left: tabPosition.left,
                    width: '300px',
                    zIndex: 1001,
                    background: 'white',
                    border: '2px solid #007bff',
                    borderRadius: '8px',
                    padding: '15px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                  }}
                >
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <strong>{onboardingSteps[onboardingStep].title}</strong>
                    <button 
                      className="btn btn-sm btn-outline-secondary"
                      onClick={completeOnboarding}
                      style={{ padding: '2px 6px', fontSize: '12px' }}
                    >
                      <FaTimes />
                    </button>
                  </div>
                  <p className="mb-0" style={{ fontSize: '14px' }}>
                    {onboardingSteps[onboardingStep].description}
                  </p>
                </div>
              </>
            )}
          </div>
        );
      })()}
    </>
  );
};

export default App;
