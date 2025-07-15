import React, { useState } from 'react';
import { FaCaretRight, FaCaretDown } from 'react-icons/fa';

const JsonNode = ({ label, value, nodeCounts, level = 0, searchTerm = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const isObject = typeof value === 'object' && value !== null;
  const isArray = Array.isArray(value);

  const toggleOpen = () => setIsOpen(!isOpen);

  const matchesSearch = (text) => {
    return text.toLowerCase().includes(searchTerm.toLowerCase());
  };

  const renderHighlightedText = (text) => {
    if (!searchTerm) return text;
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) =>
          matchesSearch(part) ? (
            <span key={i} className="highlight">{part}</span>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  const renderValue = () => {
    if (isObject || isArray) {
      const count = nodeCounts[JSON.stringify(value)] || 0;
      return (
        <span className="json-node-toggle" onClick={toggleOpen}>
          {isOpen ? <FaCaretDown /> : <FaCaretRight />}
          {isArray ? `[${count}]` : `{${count}}`}
        </span>
      );
    } else {
      return <span className="json-node-value">{renderHighlightedText(JSON.stringify(value))}</span>;
    }
  };

  // Determine if the node or any of its children match the search term
  const shouldRender = () => {
    if (!searchTerm) return true; // Render all if no search term
    if (matchesSearch(String(label))) return true;
    if (!isObject && !isArray && matchesSearch(String(value))) return true;

    if (isObject || isArray) {
      for (const [, val] of Object.entries(value)) {
        if (typeof val === 'object' && val !== null) {
          // Recursively check children
          // This is a simplified check, a more robust solution would involve passing down a 'hasMatch' flag
          // For now, we'll assume if a child matches, the parent should be open.
          if (JSON.stringify(val).toLowerCase().includes(searchTerm.toLowerCase())) {
            return true;
          }
        } else if (matchesSearch(String(val))) {
          return true;
        }
      }
    }
    return false;
  };

  if (!shouldRender()) return null;

  return (
    <div className="json-node" style={{ marginLeft: `${level * 20}px` }}>
      <span className="json-node-label">{renderHighlightedText(label)}:</span> {renderValue()}
      {(isObject || isArray) && (isOpen || searchTerm) && (
        <div className="json-node-children">
          {Object.entries(value).map(([key, val]) => (
            <JsonNode
              key={key}
              label={isArray ? `[${key}]` : key}
              value={val}
              nodeCounts={nodeCounts}
              level={level + 1}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const JsonTreeView = ({ data, searchTerm = '' }) => {
  const [nodeCounts, setNodeCounts] = useState({});

  // Function to recursively count nodes
  const countNodes = (obj) => {
    let counts = {};
    const traverse = (current) => {
      if (typeof current === 'object' && current !== null) {
        let count = 0;
        if (Array.isArray(current)) {
          count = current.length;
          current.forEach(item => traverse(item));
        } else {
          count = Object.keys(current).length;
          Object.values(current).forEach(val => traverse(val));
        }
        counts[JSON.stringify(current)] = count;
      }
    };
    traverse(obj);
    return counts;
  };

  React.useEffect(() => {
    if (data) {
      try {
        const parsedData = JSON.parse(data);
        setNodeCounts(countNodes(parsedData));
      } catch (e) {
        console.error("Error parsing JSON for tree view:", e);
        setNodeCounts({});
      }
    }
  }, [data]);

  if (!data) {
    return <div>Enter JSON to see tree view</div>;
  }

  try {
    const parsedData = JSON.parse(data);
    return (
      <div className="json-tree-view">
        <JsonNode label="root" value={parsedData} nodeCounts={nodeCounts} searchTerm={searchTerm} />
      </div>
    );
  } catch (e) {
    return <div className="text-danger">Invalid JSON for tree view: {e.message}</div>;
  }
};

export default JsonTreeView;
