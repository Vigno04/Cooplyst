import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Globe } from 'lucide-react';
import { languages } from '../i18n';

export default function LanguageSelector({ value, onChange, className = '' }) {
    const { i18n, t } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handle = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
        document.addEventListener('click', handle);
        return () => document.removeEventListener('click', handle);
    }, []);

    const current = languages.find(l => l.code === (value || i18n.language)) || languages[0];

    const change = (code) => {
        i18n.changeLanguage(code);
        onChange?.(code);
        setOpen(false);
    };

    return (
        <div ref={ref} className={`lang-switcher-container ${className}`} onClick={() => setOpen(o => !o)}>
            <Globe size={16} className="lang-icon" />
            <img src={current.flag} alt={current.code} className="lang-flag" />
            <div className="lang-selected">{current.translation?.langLabel || current.code.toUpperCase()}</div>
            <ChevronDown size={14} className={`lang-arrow ${open ? 'open' : ''}`} />
            {open && (
                <div className="lang-dropdown">
                    {languages.map(({ code, translation, flag }) => (
                        <div key={code} className={`lang-option ${i18n.language === code ? 'active' : ''}`} onClick={() => change(code)}>
                            <img src={flag} alt={code} style={{ width: 20, height: 14, marginRight: 8, verticalAlign: 'middle' }} />
                            {translation?.langLabel || code.toUpperCase()}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
