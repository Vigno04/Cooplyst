import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

export default function CustomSelect({ value, onChange, options, className = '', placeholder = '', renderOption }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handle = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
        document.addEventListener('click', handle);
        return () => document.removeEventListener('click', handle);
    }, []);

    const currentOption = options.find(o => o.value === value);
    const displayLabel = currentOption ? (renderOption ? renderOption(currentOption, true) : currentOption.label) : placeholder;

    const handleChange = (val) => {
        onChange(val);
        setOpen(false);
    };

    return (
        <div ref={ref} className={`custom-select-container ${open ? 'open' : ''} ${className}`} onClick={() => setOpen(o => !o)}>
            <div className="custom-select-value">
                {displayLabel}
            </div>
            <ChevronDown size={14} className="custom-select-arrow" />

            {open && (
                <div className="custom-select-dropdown">
                    {options.map((opt) => (
                        <div
                            key={opt.value}
                            className={`custom-select-option ${value === opt.value ? 'active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); handleChange(opt.value); }}
                        >
                            {renderOption ? renderOption(opt, false) : opt.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
