import React, { useState, useRef, useEffect, useCallback } from 'react';

export default function CustomSelect({
  value,
  onChange,
  children,
  required,
  disabled,
  className = '',
  style = {},
  id,
  name,
  placeholder,
  searchable
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [placement, setPlacement] = useState('bottom'); // 'bottom' | 'top'
  const [maxHeight, setMaxHeight] = useState(240);
  const searchInputRef = useRef(null);
  const containerRef = useRef(null);

  // Parse option elements from children
  const options = [];
  React.Children.forEach(children, (child) => {
    if (!child) return;
    if (child.type === 'option') {
      const val = child.props.value !== undefined ? child.props.value : child.props.children;
      options.push({
        value: val,
        label: child.props.children,
        disabled: child.props.disabled
      });
    }
  });

  const isSearchable = searchable !== undefined ? searchable : options.length > 8;

  // Find active option
  const hasValue = value !== undefined && value !== null && value !== '';
  let selectedOption = null;
  if (hasValue) {
    selectedOption = options.find((opt) => String(opt.value) === String(value)) || null;
  } else {
    selectedOption = options.find((opt) => opt.value === '' || opt.value === null || opt.value === undefined) || null;
  }

  const isPlaceholder = !hasValue || !selectedOption || selectedOption.value === '';
  const displayLabel = selectedOption ? selectedOption.label : (placeholder || 'Select...');

  // Intelligently calculate available space and adjust dropdown position & height
  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const triggerEl = containerRef.current.querySelector('.custom-select-trigger') || containerRef.current;
    const rect = triggerEl.getBoundingClientRect();
    if (!rect.width && !rect.height) return;

    const modalCard = containerRef.current.closest('.modal-card') || containerRef.current.closest('.modal-backdrop');
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    let spaceBelow = viewportHeight - rect.bottom - 12;
    let spaceAbove = rect.top - 12;

    if (modalCard) {
      const modalRect = modalCard.getBoundingClientRect();
      const modalSpaceBelow = modalRect.bottom - rect.bottom - 16;
      const modalSpaceAbove = rect.top - modalRect.top - 16;

      spaceBelow = Math.min(spaceBelow, modalSpaceBelow);
      spaceAbove = Math.min(spaceAbove, modalSpaceAbove);
    }

    const desiredHeight = 200;

    // Flip upward if space below is too small and space above offers more room
    if (spaceBelow < desiredHeight && spaceAbove > spaceBelow) {
      setPlacement('top');
      setMaxHeight(Math.max(90, Math.min(260, Math.floor(spaceAbove))));
    } else {
      setPlacement('bottom');
      setMaxHeight(Math.max(90, Math.min(260, Math.floor(spaceBelow))));
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      updatePosition();
      // Recalculate right after render to ensure precise bounds
      const timer = setTimeout(() => {
        updatePosition();
        if (isSearchable && searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 30);

      const handleScrollOrResize = () => {
        updatePosition();
      };

      window.addEventListener('resize', handleScrollOrResize);
      window.addEventListener('scroll', handleScrollOrResize, true);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', handleScrollOrResize);
        window.removeEventListener('scroll', handleScrollOrResize, true);
      };
    }
  }, [isOpen, isSearchable, updatePosition]);

  const filteredOptions = isSearchable && searchTerm.trim()
    ? options.filter((opt) => opt.value === '' || String(opt.label).toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (val, isDisabled) => {
    if (isDisabled) return;
    if (onChange) {
      onChange({
        target: {
          value: val,
          name: name || id || ''
        }
      });
    }
    setIsOpen(false);
  };

  const handleTriggerKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    }
  };

  // Separate wrapper layout styles from trigger styles
  const { width, minWidth, maxWidth, flex, margin, marginTop, marginBottom, marginLeft, marginRight, ...triggerStyle } = style;

  return (
    <div
      ref={containerRef}
      className={`custom-select-wrapper ${className}`.trim()}
      style={{
        position: 'relative',
        width: width || '100%',
        minWidth,
        maxWidth,
        flex,
        margin,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
        zIndex: isOpen ? 60 : 1
      }}
    >
      {/* Hidden native select to preserve form submission & native validation */}
      <select
        tabIndex={-1}
        aria-hidden="true"
        required={required}
        value={value}
        onChange={onChange}
        name={name}
        id={id}
        className="custom-select-native"
      >
        {children}
      </select>

      {/* Styled Trigger */}
      <button
        type="button"
        disabled={disabled}
        title={typeof displayLabel === 'string' ? displayLabel : ''}
        className={`custom-select-trigger ${isOpen ? 'open' : ''} ${placement === 'top' && isOpen ? 'open-top' : ''}`}
        style={triggerStyle}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`custom-select-text ${isPlaceholder ? 'placeholder' : ''}`}>
          {displayLabel}
        </span>
        <svg
          className={`custom-select-arrow ${isOpen ? 'rotated' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Floating Adjustable Styled Dropdown Menu */}
      {isOpen && (
        <div
          className={`custom-select-dropdown placement-${placement}`}
          style={{ maxHeight: `${maxHeight}px` }}
          role="listbox"
        >
          {isSearchable && (
            <div
              className="custom-select-search-wrap"
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                padding: '4px 6px 6px',
                background: 'var(--surface-raised, #ffffff)',
                borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
                marginBottom: '4px'
              }}
            >
              <input
                ref={searchInputRef}
                type="text"
                className="input-text"
                placeholder="Type to search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  height: '32px',
                  fontSize: '13px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: 'var(--surface-subtle, #f8fafc)',
                  border: '1px solid var(--border-subtle, #cbd5e1)',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          )}
          {filteredOptions.length === 0 ? (
            <div style={{ padding: '12px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
              No matches found
            </div>
          ) : (
            filteredOptions.map((opt, idx) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <div
                  key={idx}
                  role="option"
                  aria-selected={isSelected}
                  title={typeof opt.label === 'string' ? opt.label : ''}
                  className={`custom-select-item ${isSelected ? 'selected' : ''} ${opt.disabled ? 'disabled' : ''}`}
                  onClick={() => handleSelect(opt.value, opt.disabled)}
                >
                  <span className="custom-select-item-label">{opt.label}</span>
                  {isSelected && (
                    <svg
                      className="custom-select-check"
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
