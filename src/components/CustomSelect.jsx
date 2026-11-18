import React, { useState, useRef, useEffect } from 'react';

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
  placeholder
}) {
  const [isOpen, setIsOpen] = useState(false);
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
      className="custom-select-wrapper"
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
        className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
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

      {/* Floating Styled Dropdown Menu */}
      {isOpen && (
        <div className="custom-select-dropdown" role="listbox">
          {options.map((opt, idx) => {
            const isSelected = String(opt.value) === String(value);
            return (
              <div
                key={idx}
                role="option"
                aria-selected={isSelected}
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
          })}
        </div>
      )}
    </div>
  );
}
