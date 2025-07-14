import React, { useState, useRef, useCallback, useEffect } from 'react';
import { diff_match_patch } from 'diff-match-patch';
import { Container, Row, Col, Form, Button, Card, Nav } from 'react-bootstrap';
import AceEditor from 'react-ace';
import ace from 'ace-builds';
import { unescapeString, parseRecursive } from './utils';
import { init, compress, decompress } from '@bokuweb/zstd-wasm';
import Header from './Header';
import Footer from './Footer';

import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-dracula';
import 'ace-builds/src-noconflict/ext-searchbox';

ace.config.setModuleUrl('ace/mode/json_worker', '/static/js/worker-json.js');

const App = () => {
  const [json1, setJson1] = useState('');
  const [json2, setJson2] = useState('');
  const [diff, setDiff] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('diff');
  const [formatInput, setFormatInput] = useState('');
  const [formattedOutput, setFormattedOutput] = useState('');
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
  const [syncScroll, setSyncScroll] = useState(true);
  const [theme, setTheme] = useState('light');
  const [wrapTextEnabled, setWrapTextEnabled] = useState(false);

  const toggleWrapText = () => {
    setWrapTextEnabled((prev) => !prev);
  };

  const leftEditorRef = useRef(null);
  const rightEditorRef = useRef(null);
  const isScrollingRef = useRef(false);

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
    } catch (e) {
      setError('Invalid JSON input. Please check your JSON and try again.');
      setDiff(null);
    }
  };

  const handleFormat = () => {
    try {
      const parsedJson = JSON.parse(formatInput);
      setFormattedOutput(JSON.stringify(parsedJson, null, 2));
      setFormatError('');
      setError(''); // Clear general error
    } catch (e) {
      setFormatError(`Invalid JSON input: ${e.message}`);
      setFormattedOutput('');
      setError(''); // Clear general error
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
    } catch (e) {
      setZstdError(`Decompression or JSON parsing error: ${e.message}`);
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

    } catch (e) {
      console.error('General error in handleUnescapeJson:', e);
      setUnescapeError(`Error unescaping or parsing JSON: ${e.message}`);
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

    } catch (e) {
      setCompressError(`Compression or JSON parsing error: ${e.message}`);
    }
  };

  const handleJsonMinify = () => {
    setMinifyError('');
    setMinifiedOutput('');
    try {
      const parsedJson = JSON.parse(minifyInput);
      setMinifiedOutput(JSON.stringify(parsedJson));
    } catch (e) {
      setMinifyError(`Minification or JSON parsing error: ${e.message}`);
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
          <Col md={6}>
            <AceEditor
              ref={leftEditorRef}
              mode="json"
              theme={theme === 'light' ? 'github' : 'dracula'}
              value={json1}
              name="diff_left"
              editorProps={{ $blockScrolling: true }}
              height="600px"
              width="100%"
              readOnly
              setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
              markers={markers1}
              onScroll={() => handleScroll('left')}
            />
          </Col>
          <Col md={6}>
            <AceEditor
              ref={rightEditorRef}
              mode="json"
              theme={theme === 'light' ? 'github' : 'dracula'}
              value={json2}
              name="diff_right"
              editorProps={{ $blockScrolling: true }}
              height="600px"
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

  const renderContent = () => {
    if (activeTab === 'diff') {
      return (
        <>
          <Row>
            <Col md={6}>
              <Form.Group>
                <Form.Label>JSON 1</Form.Label>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  onChange={(value) => setJson1(value)}
                  value={json1}
                  name="json1_editor"
                  editorProps={{ $blockScrolling: true }}
                  height="500px"
                  width="100%"
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>JSON 2</Form.Label>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  onChange={(value) => setJson2(value)}
                  value={json2}
                  name="json2_editor"
                  editorProps={{ $blockScrolling: true }}
                  height="500px"
                  width="100%"
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>
          </Row>
          <Row className="mt-3">
            <Col className="text-center">
              <Button variant="primary" onClick={handleCompare}>
                Compare
              </Button>
            </Col>
          </Row>
          {renderDiff()}
        </>
      );
    }

    if (activeTab === 'format') {
      return (
        <>
          <Row>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Input JSON</Form.Label>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  onChange={(value) => setFormatInput(value)}
                  value={formatInput}
                  name="format_input_editor"
                  editorProps={{ $blockScrolling: true }}
                  height="500px"
                  width="100%"
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Formatted JSON</Form.Label>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  value={formattedOutput}
                  name="formatted_output_editor"
                  editorProps={{ $blockScrolling: true }}
                  height="500px"
                  width="100%"
                  readOnly
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>
          </Row>
          <Row className="mt-3">
            <Col className="text-center">
              <Button variant="primary" onClick={handleFormat}>
                Format
              </Button>
            </Col>
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
      return (
        <>
          <Row>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Base64 Zstd Compressed String</Form.Label>
                <AceEditor
                  mode="text"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  onChange={(value) => setZstdInput(value)}
                  value={zstdInput}
                  name="zstd_input_editor"
                  editorProps={{ $blockScrolling: true }}
                  height="500px"
                  width="100%"
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Decompressed JSON</Form.Label>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  value={zstdOutput}
                  name="zstd_output_editor"
                  editorProps={{ $blockScrolling: true }}
                  height="500px"
                  width="100%"
                  readOnly
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>
          </Row>
          <Row className="mt-3">
            <Col className="text-center">
              <Button variant="primary" onClick={handleZstdDecompress}>
                Decompress
              </Button>
            </Col>
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
      return (
        <>
          <Row>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Escaped JSON String</Form.Label>
                <AceEditor
                  mode="text"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  onChange={(value) => setEscapeInput(value)}
                  value={escapeInput}
                  name="escape_input_editor"
                  editorProps={{ $blockScrolling: true }}
                  height="500px"
                  width="100%"
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Unescaped JSON</Form.Label>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  value={unescapeOutput}
                  name="unescape_output_editor"
                  editorProps={{ $blockScrolling: true }}
                  height="500px"
                  width="100%"
                  readOnly
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>
          </Row>
          <Row className="mt-3">
            <Col className="text-center">
              <Button variant="primary" onClick={handleUnescapeJson}>
                Unescape & Format
              </Button>
            </Col>
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
      return (
        <>
          <Row>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Input JSON</Form.Label>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  onChange={(value) => setCompressInput(value)}
                  value={compressInput}
                  name="compress_input_editor"
                  editorProps={{ $blockScrolling: true }}
                  height="500px"
                  width="100%"
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Compressed Base64 String</Form.Label>
                <AceEditor
                  mode="text"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  value={compressedOutput}
                  name="compressed_output_editor"
                  editorProps={{ $blockScrolling: true }}
                  height="500px"
                  width="100%"
                  readOnly
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>
          </Row>
          <Row className="mt-3">
            <Col className="text-center">
              <Button variant="primary" onClick={handleJsonCompress}>
                Compress
              </Button>
            </Col>
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
      return (
        <>
          <Row>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Input JSON</Form.Label>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  onChange={(value) => setMinifyInput(value)}
                  value={minifyInput}
                  name="minify_input_editor"
                  editorProps={{ $blockScrolling: true }}
                  height="500px"
                  width="100%"
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Minified JSON</Form.Label>
                <AceEditor
                  mode="json"
                  theme={theme === 'light' ? 'github' : 'dracula'}
                  value={minifiedOutput}
                  name="minified_output_editor"
                  editorProps={{ $blockScrolling: true }}
                  height="500px"
                  width="100%"
                  readOnly
                  setOptions={{ useWorker: false, fontFamily: 'Monaco', wrap: wrapTextEnabled }}
                />
              </Form.Group>
            </Col>
          </Row>
          <Row className="mt-3">
            <Col className="text-center">
              <Button variant="primary" onClick={handleJsonMinify}>
                Minify
              </Button>
            </Col>
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

    return null;
  };

  return (
    <>
      <Header theme={theme} toggleTheme={toggleTheme} wrapTextEnabled={wrapTextEnabled} toggleWrapText={toggleWrapText} />
      <Container className="mt-4 pt-5 content-extra-padding">
        <Nav variant="tabs" activeKey={activeTab} onSelect={(k) => setActiveTab(k)}>
          <Nav.Item>
            <Nav.Link eventKey="diff" className="json-diff-tab">JSON Diff</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="format">JSON Formatter</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="zstd">Zstd Decompress</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="compress">Zstd Compress</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="unescape">JSON Unescape</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="minify">JSON Minify</Nav.Link>
          </Nav.Item>
        </Nav>
        <div className="mt-3">{renderContent()}</div>
      </Container>

      <Footer />
    </>
  );
};

export default App;
